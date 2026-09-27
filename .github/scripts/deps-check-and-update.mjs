#!/usr/bin/env node
// Update and test dependency groups independently, rolling back failed groups.
// See README for the update policy and local usage.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PKG_PATH = 'package.json';
const LOCK_PATH = 'pnpm-lock.yaml';
const README_PATH = 'README.md';
const ART_DIR = 'artifacts';

// Keep in sync with minimumReleaseAge in pnpm-workspace.yaml.
const MIN_AGE_DAYS = 7;

// Update Leaflet and its types together to avoid mismatches.
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
    const applied = [];
    const failedGroups = [];
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

// Respect a rolled-back latest tag and wait MIN_AGE_DAYS before adopting a release.
function selectVersion(name, current) {
    if (!parseStable(current)) {
        console.log(`${name}: current version ${current} is not stable x.y.z. Skipping.`);
        return null;
    }
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
    const cutoff = Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000;
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

function installAndTest() {
    // Allow the lockfile to follow the package.json changes, including on CI.
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

// Preserve failure reports before the next group overwrites them.
function saveFailureReports(groupName) {
    for (const dir of ['test-results', 'playwright-report']) {
        if (fs.existsSync(dir))
            fs.cpSync(dir, path.join(ART_DIR, `${dir}-${groupName}`), { recursive: true });
    }
}

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

    // Follow Leaflet or bump the fourth segment, without moving backward.
    const leafletUpdate = applied.find((u) => u.name === 'leaflet');
    let nextVersion = leafletUpdate ? leafletUpdate.to : bumpFourth(prevVersion);
    if (compareProjectVersions(nextVersion, prevVersion) <= 0) {
        nextVersion = bumpFourth(prevVersion);
    }

    const pkg = readPkg();
    pkg.version = nextVersion;
    writePkg(pkg);
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
    let readme = fs.readFileSync(README_PATH, 'utf8');
    readme = readme.replace(/Leaflet v[\d.]+/g, `Leaflet v${versionOf(pkg.dependencies.leaflet)}`);
    readme = readme.replace(
        /TypeScript v[\d.]+/g,
        `TypeScript v${versionOf(pkg.devDependencies.typescript)}`
    );
    readme = readme.replace(/Vite v[\d.]+/g, `Vite v${versionOf(pkg.devDependencies.vite)}`);
    fs.writeFileSync(README_PATH, readme);
}

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
    // Publish replaces branch URLs with the commit SHA so images survive branch deletion.
    // Keep the branch name in sync with the workflow's PR and image steps.
    // Check only before.png: the workflow captures after.png after this script runs.
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
    // Only publish has App credentials, so it fills in the auto-merge notice.
    // Keep the failed-group rule in sync with the workflow's Auto-merge step.
    const chain =
        'CI then runs on main, the Release workflow tags and publishes the new version, and the Pages workflow redeploys the demo.';
    lines.push(
        '',
        failedGroups.length > 0
            ? `Because some groups failed checks, this PR is NOT auto-merged — review the exclusions, then merge manually. ${chain}`
            : `{{AUTO_MERGE_NOTE}} ${chain}`
    );
    fs.writeFileSync(path.join(ART_DIR, 'pr-body.md'), lines.join('\n') + '\n');
}

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

// Reject prereleases; only stable x.y.z versions are eligible.
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

// Only project versions allow a fourth segment, e.g. 1.9.4.1.
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
