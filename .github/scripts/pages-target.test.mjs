// Rules of decidePagesTarget() against a canned GitHub API. No network or
// GitHub access.
//   node --test .github/scripts/pages-target.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decidePagesTarget, formatOutputs, githubApi, readInput } from './pages-target.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const REPO = 'owner/starter';

// A finished, successful CI run for a push of commit A to this repository's main.
const passed = {
    run_number: 7,
    head_sha: A,
    head_branch: 'main',
    head_repository: { full_name: REPO },
    event: 'push',
    status: 'completed',
    conclusion: 'success',
};
// The Pages workflow started by that CI run, and one started by hand on main.
const automatic = {
    eventName: 'workflow_run',
    event: { workflow_run: passed },
    repository: REPO,
    ref: 'refs/heads/main',
    sha: B,
};
const manual = {
    eventName: 'workflow_dispatch',
    event: {},
    repository: REPO,
    ref: 'refs/heads/main',
    sha: A,
};

// `heads` are the successive answers for the tip of main, `runs` the CI runs
// the API lists for commit A.
function fakeApi({ heads = [A], runs = [passed] } = {}) {
    let mainReads = 0;
    return async (requestPath) => {
        if (requestPath === `/repos/${REPO}/git/ref/heads/main`) {
            return { object: { sha: heads[Math.min(mainReads++, heads.length - 1)] } };
        }
        const url = new URL(requestPath, 'https://api.github.com');
        assert.equal(url.pathname, `/repos/${REPO}/actions/workflows/ci.yml/runs`);
        assert.equal(url.searchParams.get('head_sha'), A);
        assert.equal(url.searchParams.get('branch'), 'main');
        assert.equal(url.searchParams.get('event'), 'push');
        assert.equal(url.searchParams.get('status'), null);
        const offset = (Number(url.searchParams.get('page')) - 1) * 100;
        return { total_count: runs.length, workflow_runs: runs.slice(offset, offset + 100) };
    };
}
const noApi = async () => assert.fail('an ineligible run must not query GitHub');

for (const input of [automatic, manual]) {
    const name = input.eventName;

    test(`${name}: publishes the tip of main once its CI run passed`, async () => {
        assert.deepEqual(await decidePagesTarget(input, fakeApi()), {
            deploy: true,
            sha: A,
            reason: 'current',
        });
    });

    test(`${name}: skips a commit that is no longer the tip of main`, async () => {
        assert.deepEqual(await decidePagesTarget(input, fakeApi({ heads: [B] })), {
            deploy: false,
            sha: A,
            reason: 'stale',
        });
    });

    test(`${name}: skips a commit without a CI run`, async () => {
        const decision = await decidePagesTarget(input, fakeApi({ runs: [] }));
        assert.deepEqual(decision, { deploy: false, sha: A, reason: 'no-ci-run' });
    });

    for (const [status, conclusion, reason] of [
        ['completed', 'failure', 'ci-not-successful'],
        ['completed', 'cancelled', 'ci-not-successful'],
        ['completed', 'skipped', 'ci-not-successful'],
        ['in_progress', null, 'ci-not-finished'],
        ['queued', null, 'ci-not-finished'],
    ]) {
        test(`${name}: a newer ${conclusion ?? status} CI run blocks the commit`, async () => {
            const runs = [passed, { ...passed, run_number: 8, status, conclusion }];
            const decision = await decidePagesTarget(input, fakeApi({ runs }));
            assert.deepEqual(decision, { deploy: false, sha: A, reason });
        });
    }
}

for (const [change, reason] of [
    [{ event: 'pull_request' }, 'not-a-push'],
    [{ conclusion: 'failure' }, 'ci-not-successful'],
    [{ conclusion: 'cancelled' }, 'ci-not-successful'],
    [{ head_branch: 'feature' }, 'not-main'],
    // A fork can name its branch "main"; the repository check still rejects it.
    [{ head_repository: { full_name: 'someone/starter' } }, 'foreign-repository'],
    [{ head_repository: null }, 'foreign-repository'],
]) {
    test(`does not publish a workflow_run with ${JSON.stringify(change)}`, async () => {
        const input = { ...automatic, event: { workflow_run: { ...passed, ...change } } };
        assert.deepEqual(await decidePagesTarget(input, noApi), {
            deploy: false,
            sha: '',
            reason,
        });
    });
}

for (const ref of ['refs/heads/feature', 'refs/tags/v1.0.0']) {
    test(`a manual run from ${ref} does not publish`, async () => {
        assert.deepEqual(await decidePagesTarget({ ...manual, ref }, noApi), {
            deploy: false,
            sha: '',
            reason: 'not-main',
        });
    });
}

test('other events never publish', async () => {
    const decision = await decidePagesTarget({ ...manual, eventName: 'push' }, noApi);
    assert.equal(decision.reason, 'unsupported-event');
});

test('ignores a CI run that does not belong to a push of the commit to main', async () => {
    for (const change of [
        { head_sha: B },
        { head_branch: 'feature' },
        { head_repository: { full_name: 'someone/starter' } },
        { event: 'pull_request' },
    ]) {
        const runs = [{ ...passed, ...change }];
        assert.equal((await decidePagesTarget(manual, fakeApi({ runs }))).reason, 'no-ci-run');
    }
});

test('a re-run that fails or is still running after the build blocks publication', async () => {
    const built = await decidePagesTarget(manual, fakeApi());
    for (const rerun of [
        { ...passed, run_attempt: 2, conclusion: 'failure' },
        { ...passed, run_attempt: 2, status: 'in_progress', conclusion: null },
    ]) {
        const decision = await decidePagesTarget(
            { ...manual, targetSha: built.sha },
            fakeApi({ runs: [rerun] })
        );
        assert.equal(decision.deploy, false);
    }
});

test('the deploy job skips a commit that main left while it waited', async () => {
    const built = await decidePagesTarget(automatic, fakeApi());
    const decision = await decidePagesTarget(
        { ...automatic, targetSha: built.sha },
        fakeApi({ heads: [B] })
    );
    assert.equal(decision.reason, 'stale');
});

test('reads main again after the CI history', async () => {
    const decision = await decidePagesTarget(manual, fakeApi({ heads: [A, B] }));
    assert.deepEqual(decision, { deploy: false, sha: A, reason: 'stale' });
});

test('a failed run on the second page cannot hide behind earlier successes', async () => {
    const runs = Array.from({ length: 100 }, (_, i) => ({ ...passed, run_number: i + 1 }));
    runs.push({ ...passed, run_number: 101, conclusion: 'failure' });
    const decision = await decidePagesTarget(manual, fakeApi({ runs }));
    assert.equal(decision.reason, 'ci-not-successful');
});

test('refuses to publish a commit other than the one built', async () => {
    await assert.rejects(
        decidePagesTarget({ ...manual, targetSha: B }, noApi),
        /is not the commit that was built/
    );
});

test('a failed or unusable API answer stops the check', async () => {
    await assert.rejects(
        decidePagesTarget(manual, async () => {
            throw new Error('network failure');
        }),
        /network failure/
    );
    await assert.rejects(
        decidePagesTarget(manual, fakeApi({ heads: [''] })),
        /the tip of main is not a commit SHA/
    );
    await assert.rejects(
        decidePagesTarget(manual, async (requestPath) =>
            requestPath.includes('/git/ref/') ? { object: { sha: A } } : { message: 'Not Found' }
        ),
        /cannot read the CI runs/
    );
    await assert.rejects(
        decidePagesTarget({ ...manual, sha: 'main' }, noApi),
        /GITHUB_SHA is not a commit SHA/
    );
});

test('an HTTP error from GitHub fails without exposing the token', async () => {
    const requests = [];
    const api = githubApi({ token: 'test-token' }, async (url, options) => {
        requests.push({ url, authorization: options.headers.Authorization });
        return { ok: false, status: 403 };
    });
    await assert.rejects(api(`/repos/${REPO}/git/ref/heads/main`), (error) => {
        assert.equal(error.message, 'pages-target: GitHub API returned HTTP 403');
        return true;
    });
    assert.deepEqual(requests, [
        {
            url: `https://api.github.com/repos/${REPO}/git/ref/heads/main`,
            authorization: 'Bearer test-token',
        },
    ]);
});

test('outputs are written as GITHUB_OUTPUT lines', () => {
    assert.equal(
        formatOutputs({ deploy: true, sha: A, reason: 'current' }),
        `deploy=true\nsha=${A}\nreason=current\n`
    );
});

test('reads the event and the environment that pages.yml provides', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pages-target-'));
    try {
        const eventPath = path.join(dir, 'event.json');
        fs.writeFileSync(eventPath, JSON.stringify({ workflow_run: passed }));
        const input = readInput({
            GITHUB_EVENT_NAME: 'workflow_run',
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_REPOSITORY: REPO,
            GITHUB_REF: 'refs/heads/main',
            GITHUB_SHA: B,
            PAGES_TARGET_SHA: A,
        });
        assert.deepEqual(input, { ...automatic, targetSha: A });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
