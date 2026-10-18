// Rules of selectVersion() with canned npm output and a fixed clock. No
// install, network or GitHub access.
//   node --test .github/scripts/select-version.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectVersion, parseStable, compareVersions } from './select-version.mjs';

const NOW = Date.parse('2026-10-18T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const MIN_AGE_DAYS = 7;

const daysAgo = (days) => new Date(NOW - days * DAY).toISOString();

// `time` maps versions to publish dates, as `npm view <name> time --json`
// returns them (plus the created/modified keys npm adds).
function select(current, latest, time, { calls = [] } = {}) {
    const logs = [];
    const capture = (cmd) => {
        calls.push(cmd);
        if (cmd === 'npm view "pkg" version') return latest;
        if (cmd === 'npm view "pkg" time --json') {
            return JSON.stringify({ created: daysAgo(400), modified: daysAgo(1), ...time });
        }
        throw new Error(`unexpected command: ${cmd}`);
    };
    const picked = selectVersion('pkg', current, {
        capture,
        minAgeDays: MIN_AGE_DAYS,
        now: () => NOW,
        log: (line) => logs.push(line),
    });
    return { picked, logs };
}

test('takes the newest same-major release when latest points at the next major', () => {
    const { picked, logs } = select('6.13.0', '7.0.0', {
        '6.14.0': daysAgo(10),
        '7.0.0': daysAgo(9),
    });
    assert.equal(picked, '6.14.0');
    assert.match(logs.join('\n'), /7\.0\.0 is a new major version/);
});

test('leaves the package alone when only a new major is available, and says so', () => {
    const { picked, logs } = select('6.13.0', '7.0.0', { '7.0.0': daysAgo(9) });
    assert.equal(picked, null);
    assert.match(logs.join('\n'), /7\.0\.0 is a new major version/);
    assert.match(logs.join('\n'), /update it by hand/);
    assert.doesNotMatch(logs.join('\n'), /Waiting/);
});

test('takes a same-major latest', () => {
    const { picked, logs } = select('6.13.0', '6.14.0', { '6.14.0': daysAgo(8) });
    assert.equal(picked, '6.14.0');
    assert.equal(logs.length, 0);
});

test('waits for a release younger than the minimum age', () => {
    const { picked, logs } = select('6.13.0', '6.14.0', { '6.14.0': daysAgo(6) });
    assert.equal(picked, null);
    assert.match(logs.join('\n'), /not 7 days old yet\. Waiting/);
});

test('the minimum age is inclusive: exactly seven days qualifies, one millisecond less waits', () => {
    const exact = new Date(NOW - MIN_AGE_DAYS * DAY).toISOString();
    const younger = new Date(NOW - MIN_AGE_DAYS * DAY + 1).toISOString();
    assert.equal(select('6.13.0', '6.14.0', { '6.14.0': exact }).picked, '6.14.0');
    assert.equal(select('6.13.0', '6.14.0', { '6.14.0': younger }).picked, null);
});

test('ignores prereleases', () => {
    // latest is a prerelease: nothing stable to move to.
    assert.equal(select('6.13.0', '7.0.0-beta.1', { '7.0.0-beta.1': daysAgo(30) }).picked, null);
    // latest equals current; a newer prerelease in the publish dates is not a candidate.
    assert.equal(select('6.13.0', '6.13.0', { '6.14.0-pre.1': daysAgo(30) }).picked, null);
});

test('never downgrades when the latest tag is older than current', () => {
    const { picked, logs } = select('6.13.0', '6.12.0', { '6.12.0': daysAgo(60) });
    assert.equal(picked, null);
    assert.match(logs.join('\n'), /dist-tag rollback/);
});

test('does not go past the latest tag', () => {
    const { picked } = select('6.13.0', '6.14.0', {
        '6.14.0': daysAgo(20),
        '6.15.0': daysAgo(10),
    });
    assert.equal(picked, '6.14.0');
});

test('applies the same-major limit to TypeScript and Vite style versions', () => {
    assert.equal(
        select('7.0.2', '8.0.0', { '7.1.0': daysAgo(10), '8.0.0': daysAgo(9) }).picked,
        '7.1.0'
    );
    assert.equal(select('8.3.4', '9.0.0', { '9.0.0': daysAgo(10) }).picked, null);
});

test('skips an unstable current version without asking npm', () => {
    const calls = [];
    const { picked, logs } = select('6.13.0-beta', '6.14.0', {}, { calls });
    assert.equal(picked, null);
    assert.equal(calls.length, 0);
    assert.match(logs.join('\n'), /not stable x\.y\.z/);
});

test('parseStable and compareVersions', () => {
    assert.deepEqual(parseStable('6.13.0'), [6, 13, 0]);
    assert.equal(parseStable('6.13.0-beta.1'), null);
    assert.equal(parseStable('modified'), null);
    assert.ok(compareVersions('6.14.0', '6.13.0') > 0);
    assert.ok(compareVersions('6.13.0', '7.0.0') < 0);
    assert.equal(compareVersions('6.13.0', '6.13.0'), 0);
    assert.throws(() => compareVersions('6.13.0', 'latest'), /Invalid semver/);
});
