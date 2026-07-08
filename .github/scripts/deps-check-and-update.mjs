#!/usr/bin/env node
// Daily dependency update for .github/workflows/deps-autoupdate.yml.
//
// For each group below: pick the newest safe version, pnpm install, build and
// run e2e. A failing group is rolled back so the others can still go out.
// Afterwards: bump the project version, rewrite README versions, and write
// the PR body plus GitHub Actions step outputs (changed / delta /
// prev_version / next_version / updated_packages / failed_groups).
//
// Project version rule: a Leaflet update adopts the Leaflet version itself
// (1.9.4 -> 1.9.5); any other update increments a fourth segment on top of
// the current version (1.9.4 -> 1.9.4.1 -> 1.9.4.2). The fourth segment is
// not semver — fine for git tags and this unpublished package.
//
// Run locally: first create the visual baselines the e2e gate diffs against
// (pnpm exec playwright test e2e/visual.spec.ts --update-snapshots), then
// node .github/scripts/deps-check-and-update.mjs
// (touches package.json / pnpm-lock.yaml / README.md / artifacts/, plus
// node_modules and playwright output)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PKG_PATH = 'package.json';
const LOCK_PATH = 'pnpm-lock.yaml';
const README_PATH = 'README.md';
const ART_DIR = 'artifacts';

// Only adopt versions published at least this many days ago, so a compromised
// release gets a chance to be yanked before we ever open a PR for it.
const MIN_AGE_DAYS = 7;

// Packages in one group are updated and tested together. @types/leaflet rides
// with leaflet so runtime and types cannot drift apart.
const GROUPS = {
    leaflet: [
        { name: 'leaflet', section: 'dependencies' },
        { name: '@types/leaflet', section: 'devDependencies' },
    ],
    typescript: [{ name: 'typescript', section: 'devDependencies' }],
    vite: [{ name: 'vite', section: 'devDependencies' }],
};

main();

function main() {
    fs.mkdirSync(ART_DIR, { recursive: true });

    const prevVersion = readPkg().version;
    const applied = []; // updates that passed all checks, e.g. {name, from, to}
    const failedGroups = []; // e.g. "vite (build)"
    let lastGood = snapshotFiles();

    for (const [groupName, packages] of Object.entries(GROUPS)) {
        console.log(`::group::${groupName}`);
        const updates = updateGroup(packages);
        if (updates.length === 0) {
            console.log(`No updates for ${groupName}.`);
            console.log('::endgroup::');
            continue;
        }

        const failedStage = installAndTest();
        if (failedStage) {
            console.log(`::warning::${groupName}: ${failedStage} failed. Rolling back this group.`);
            failedGroups.push(`${groupName} (${failedStage})`);
            saveFailureReports(groupName);
            restoreFiles(lastGood);
        } else {
            applied.push(...updates);
            lastGood = snapshotFiles();
        }
        console.log('::endgroup::');
    }

    finalize(prevVersion, applied, failedGroups);
}

// Set each package of the group to its newest safe version in package.json.
// Returns the list of updates (empty if the group is already up to date).
function updateGroup(packages) {
    const pkg = readPkg();
    const updates = [];
    for (const { name, section } of packages) {
        const current = versionOf(pkg[section]?.[name]);
        if (!current) continue;
        const next = selectVersion(name, current);
        if (!next) continue;
        pkg[section][name] = `^${next}`;
        updates.push({ name, from: current, to: next });
        console.log(`${name}: ${current} -> ${next}`);
    }
    if (updates.length > 0) writePkg(pkg);
    return updates;
}

// Pick the newest stable version that is newer than `current`, not newer than
// the `latest` dist-tag (so a rolled-back latest is respected), and published
// at least MIN_AGE_DAYS ago. Returns null if there is nothing safe to adopt.
function selectVersion(name, current) {
    if (!parseStable(current)) {
        console.log(`${name}: current version ${current} is not stable x.y.z. Skipping.`);
        return null;
    }
    // npm view is a plain registry query; it works regardless of the
    // project's package manager.
    const latest = capture(`npm view "${name}" version`);
    if (!parseStable(latest)) {
        console.log(`${name}: latest tag ${latest} is not a stable version. Skipping.`);
        return null;
    }
    if (compareVersions(latest, current) < 0) {
        console.log(
            `${name}: latest ${latest} is older than current ${current} (dist-tag rollback?). Skipping.`
        );
        return null;
    }
    if (compareVersions(latest, current) === 0) return null;

    const publishDates = JSON.parse(capture(`npm view "${name}" time --json`));
    const cutoff = Date.parse(ageCutoff());
    let picked = null;
    for (const [version, published] of Object.entries(publishDates)) {
        if (!parseStable(version)) continue; // skips prereleases and the created/modified keys
        if (Date.parse(published) > cutoff) continue;
        if (compareVersions(version, current) <= 0) continue;
        if (compareVersions(version, latest) > 0) continue;
        if (!picked || compareVersions(version, picked) > 0) picked = version;
    }
    if (!picked) {
        console.log(
            `${name}: ${latest} is newer than ${current} but not ${MIN_AGE_DAYS} days old yet. Waiting.`
        );
    }
    return picked;
}

// The cutoff used when selecting versions. pnpm enforces the same age gate on
// every install (including transitive dependencies) via minimumReleaseAge in
// pnpm-workspace.yaml — keep the two in sync.
function ageCutoff() {
    return new Date(Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Returns the name of the first failing stage, or null if everything passed.
function installAndTest() {
    // --no-frozen-lockfile: pnpm defaults frozen-lockfile to true on CI, but
    // this script has just changed package.json on purpose.
    if (!tryRun('pnpm install --no-frozen-lockfile')) return 'install';
    if (!tryRun('pnpm run build')) return 'build';
    if (!tryRun('pnpm exec playwright test')) return 'e2e';
    return null;
}

function snapshotFiles() {
    return {
        pkg: fs.readFileSync(PKG_PATH, 'utf8'),
        lock: fs.readFileSync(LOCK_PATH, 'utf8'),
    };
}

function restoreFiles(snapshot) {
    fs.writeFileSync(PKG_PATH, snapshot.pkg);
    fs.writeFileSync(LOCK_PATH, snapshot.lock);
    run('pnpm install --frozen-lockfile');
}

// Keep the playwright output of a failed group for the run artifacts, before
// the next group overwrites it.
function saveFailureReports(groupName) {
    for (const dir of ['test-results', 'playwright-report']) {
        if (fs.existsSync(dir))
            fs.cpSync(dir, path.join(ART_DIR, `${dir}-${groupName}`), { recursive: true });
    }
}

// Project version rule, README versions, PR body, and step outputs.
function finalize(prevVersion, applied, failedGroups) {
    const outputs = {
        updated_packages: applied.map((u) => u.name).join(', '),
        failed_groups: failedGroups.join(', '),
    };

    if (applied.length === 0) {
        writeGithubOutput({ changed: 'false', ...outputs });
        console.log('No dependency updates.');
        return;
    }

    // Adopt the Leaflet version when Leaflet changed, otherwise increment the
    // fourth segment (see the header). Never move backward (a Leaflet patch
    // release arriving after unrelated bumps must not collide with an
    // existing tag).
    const leafletUpdate = applied.find((u) => u.name === 'leaflet');
    let nextVersion = leafletUpdate ? leafletUpdate.to : bumpFourth(prevVersion);
    if (compareProjectVersions(nextVersion, prevVersion) <= 0) {
        nextVersion = bumpFourth(prevVersion);
    }

    const pkg = readPkg();
    pkg.version = nextVersion;
    writePkg(pkg);
    // Sync the version field into the lockfile without touching node_modules.
    // --no-frozen-lockfile: see installAndTest().
    run('pnpm install --lockfile-only --no-frozen-lockfile');

    updateReadmeVersions(pkg);
    writePrBody(applied, prevVersion, nextVersion, failedGroups);

    const delta = applied.map((u) => `${u.name} ${u.from} → ${u.to}`).join(', ');
    writeGithubOutput({
        changed: 'true',
        delta,
        prev_version: prevVersion,
        next_version: nextVersion,
        ...outputs,
    });
    console.log(`Project version: ${prevVersion} -> ${nextVersion}`);
}

function updateReadmeVersions(pkg) {
    // Each version appears twice: in the English and in the Japanese section.
    let readme = fs.readFileSync(README_PATH, 'utf8');
    readme = readme.replace(/Leaflet v[\d.]+/g, `Leaflet v${versionOf(pkg.dependencies.leaflet)}`);
    readme = readme.replace(
        /TypeScript v[\d.]+/g,
        `TypeScript v${versionOf(pkg.devDependencies.typescript)}`
    );
    readme = readme.replace(/Vite v[\d.]+/g, `Vite v${versionOf(pkg.devDependencies.vite)}`);
    fs.writeFileSync(README_PATH, readme);
}

// Writes artifacts/pr-body.md — consumed by the Create Pull Request step's
// body-path in deps-autoupdate.yml.
function writePrBody(applied, prevVersion, nextVersion, failedGroups) {
    const lines = [
        'Automated dependency update (scheduled job).',
        '',
        '## Updated',
        ...applied.map((u) => `- ${u.name}: ${u.from} → ${u.to}`),
        '',
        '## Project version',
        `- ${prevVersion} → ${nextVersion}`,
        '',
        '## Checks (already run in the update workflow, per group)',
        '- build (tsc + vite): OK',
        '- e2e smoke + visual diff vs pre-update main + runtime error check: OK',
    ];
    // before.png / after.png are both committed to the bot branch (see the
    // "Capture ... comparison image" steps and add-paths in
    // deps-autoupdate.yml), so both raw URLs resolve while the PR is open with
    // no dependency on main carrying a baseline. They render the real basemap
    // from committed offline fixtures (e2e/fixtures/tiles), so the render is
    // deterministic: any visible difference is a genuine rendering change from
    // this update (the deterministic pixel-diff gate above stays the
    // authoritative check). The links die when the bot branch is deleted on
    // merge; keep the branch name in sync with the Create Pull Request step in
    // deps-autoupdate.yml.
    //
    // Guard on before.png only: it is produced before this script runs, whereas
    // after.png is produced by a later step (guaranteed when there are updates,
    // and its failure aborts the job before the PR is created).
    const beforeImg = 'e2e/screenshots/before.png';
    const afterImg = 'e2e/screenshots/after.png';
    if (process.env.GITHUB_REPOSITORY && fs.existsSync(beforeImg)) {
        const raw = `https://raw.githubusercontent.com/${process.env.GITHUB_REPOSITORY}/bot/deps-update`;
        lines.push(
            '',
            '## Visual comparison (should look identical)',
            '',
            '| Before (pre-update) | After (updated) |',
            '| --- | --- |',
            `| ![before](${raw}/${beforeImg}) | ![after](${raw}/${afterImg}) |`,
            '',
            `If they differ, \`${afterImg}\` also shows a diff under Files changed with GitHub's image diff viewers (2-up / swipe / onion skin).`
        );
    }
    if (failedGroups.length > 0) {
        lines.push(
            '',
            '## Excluded from this PR (checks FAILED)',
            ...failedGroups.map((g) => `- ${g}`)
        );
    }
    if (process.env.RUN_URL) {
        lines.push('', `Artifacts (playwright report / visual diffs): ${process.env.RUN_URL}`);
    }
    lines.push(
        '',
        'Merging this PR triggers CI; the Release workflow then tags and publishes the new version, and the Pages workflow redeploys the demo.'
    );
    fs.writeFileSync(path.join(ART_DIR, 'pr-body.md'), lines.join('\n') + '\n');
}

// ---- small helpers ---------------------------------------------------------

function run(cmd) {
    execSync(cmd, { stdio: 'inherit' });
}

function tryRun(cmd) {
    try {
        run(cmd);
        return true;
    } catch {
        return false;
    }
}

function capture(cmd) {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
        .toString()
        .trim();
}

function readPkg() {
    return JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
}

function writePkg(pkg) {
    fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
}

function versionOf(spec) {
    return String(spec || '').replace(/^[^\d]*/, ''); // "^1.9.4" -> "1.9.4"
}

// Returns [major, minor, patch] for a stable x.y.z version, null otherwise
// (prereleases like 2.0.0-alpha.1 are rejected on purpose).
function parseStable(version) {
    const m = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compareVersions(a, b) {
    const pa = parseStable(a);
    const pb = parseStable(b);
    if (!pa || !pb) throw new Error(`Invalid semver: ${a} / ${b}`);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

// The PROJECT version allows an optional fourth segment ("1.9.4" or
// "1.9.4.1"); registry versions stay strict three-segment (parseStable) on
// purpose. Returns [major, minor, patch, fourth].
function parseProjectVersion(version) {
    const m = String(version).match(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!m) throw new Error(`Invalid project version: ${version}`);
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 0 : Number(m[4])];
}

function compareProjectVersions(a, b) {
    const pa = parseProjectVersion(a);
    const pb = parseProjectVersion(b);
    for (let i = 0; i < 4; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

// "1.9.4" -> "1.9.4.1", "1.9.4.1" -> "1.9.4.2"
function bumpFourth(version) {
    const [major, minor, patch, fourth] = parseProjectVersion(version);
    return `${major}.${minor}.${patch}.${fourth + 1}`;
}

function writeGithubOutput(keyValues) {
    const lines =
        Object.entries(keyValues)
            .map(([k, v]) => `${k}=${v}`)
            .join('\n') + '\n';
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, lines);
    } else {
        console.log('[outputs]\n' + lines);
    }
}
