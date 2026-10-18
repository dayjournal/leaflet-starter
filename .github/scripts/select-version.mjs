// Which release a managed package may move to. deps-check-and-update.mjs calls
// selectVersion(); select-version.test.mjs checks the rules with canned npm
// output and a fixed clock.

// Stable x.y.z only. Prereleases and the created/modified keys of `npm view
// time` never match.
export function parseStable(version) {
    const m = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function compareVersions(a, b) {
    const pa = parseStable(a);
    const pb = parseStable(b);
    if (!pa || !pb) throw new Error(`Invalid semver: ${a} / ${b}`);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

// The version to update `name` to, or null to leave it alone.
//
// - `current` and the `latest` dist-tag must be stable x.y.z. A `latest` below
//   `current` is a rolled-back tag and is left alone: no downgrade.
// - Only releases above `current`, up to `latest`, published at least
//   `minAgeDays` ago qualify. pnpm applies the same age through
//   minimumReleaseAge in pnpm-workspace.yaml.
// - Only the current major qualifies. A new major needs the migration guide,
//   code changes and a check by hand (.github/AUTOMATION.md, "Major updates"),
//   so it is logged and skipped. A newer same-major release is still taken.
//
// `capture(cmd)` runs a shell command and returns its stdout; `now()` is the
// clock, in milliseconds.
export function selectVersion(
    name,
    current,
    { capture, minAgeDays, now = Date.now, log = console.log }
) {
    const parsedCurrent = parseStable(current);
    if (!parsedCurrent) {
        log(`${name}: current version ${current} is not stable x.y.z. Skipping.`);
        return null;
    }
    const latest = capture(`npm view "${name}" version`);
    if (!parseStable(latest)) {
        log(`${name}: latest tag ${latest} is not a stable version. Skipping.`);
        return null;
    }
    if (compareVersions(latest, current) < 0) {
        log(
            `${name}: latest ${latest} is older than current ${current} (dist-tag rollback?). Skipping.`
        );
        return null;
    }
    if (compareVersions(latest, current) === 0) return null;

    const publishDates = JSON.parse(capture(`npm view "${name}" time --json`));
    const cutoff = now() - minAgeDays * 24 * 60 * 60 * 1000;
    const major = parsedCurrent[0];
    let picked = null;
    let newerMajor = null;
    let waiting = false;
    for (const [version, published] of Object.entries(publishDates)) {
        const parsed = parseStable(version);
        if (!parsed) continue;
        if (compareVersions(version, current) <= 0) continue;
        if (compareVersions(version, latest) > 0) continue;
        if (parsed[0] !== major) {
            if (!newerMajor || compareVersions(version, newerMajor) > 0) newerMajor = version;
            continue;
        }
        if (Date.parse(published) > cutoff) {
            waiting = true;
            continue;
        }
        if (!picked || compareVersions(version, picked) > 0) picked = version;
    }
    if (newerMajor) {
        log(
            `${name}: ${newerMajor} is a new major version. The daily update stays on ${major}.x; ` +
                'update it by hand (see .github/AUTOMATION.md, "Major updates").'
        );
    }
    if (!picked && waiting) {
        log(
            `${name}: a ${major}.x release newer than ${current} is not ${minAgeDays} days old yet. Waiting.`
        );
    }
    return picked;
}
