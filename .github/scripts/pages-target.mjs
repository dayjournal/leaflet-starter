#!/usr/bin/env node
// Decide whether a Deploy GitHub Pages run may publish, and which commit.
//   node .github/scripts/pages-target.mjs
// Reads the event that workflows/pages.yml runs for, then asks the GitHub API
// (contents: read, actions: read) for the tip of main and the commit's CI
// runs. Writes deploy=true|false, sha=<commit> and reason=<word> to
// $GITHUB_OUTPUT (or to stdout when unset). Exits 1 when a check cannot be
// completed, such as a failed API request, so an error never passes as a
// decision. pages-target.test.mjs covers the rules.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;

// input: { eventName, event, repository, ref, sha, targetSha }
// api(path) returns the JSON of a GET request to the GitHub REST API.
export async function decidePagesTarget(input, api) {
    const skip = (reason, sha = '') => ({ deploy: false, sha, reason });
    const { eventName, repository } = input;
    let sha;
    if (eventName === 'workflow_dispatch') {
        // A manual run republishes the current main and passes the same checks
        // as an automatic one; it cannot pick another ref or skip CI.
        if (input.ref !== 'refs/heads/main') return skip('not-main');
        sha = requireSha(input.sha, 'GITHUB_SHA');
    } else if (eventName === 'workflow_run') {
        const run = input.event?.workflow_run ?? {};
        if (run.event !== 'push') return skip('not-a-push');
        if (run.conclusion !== 'success') return skip('ci-not-successful');
        if (run.head_branch !== 'main') return skip('not-main');
        if (!repository || run.head_repository?.full_name !== repository) {
            return skip('foreign-repository');
        }
        sha = requireSha(run.head_sha, 'workflow_run.head_sha');
    } else {
        return skip('unsupported-event');
    }

    // The deploy job passes the commit that the build job checked out.
    if (input.targetSha && sha !== requireSha(input.targetSha, 'PAGES_TARGET_SHA')) {
        throw new Error(`pages-target: ${sha} is not the commit that was built`);
    }
    if ((await readMainSha(api, repository)) !== sha) return skip('stale', sha);

    const latest = await latestCiRun(api, repository, sha);
    if (
        !latest ||
        latest.head_sha !== sha ||
        latest.head_branch !== 'main' ||
        latest.event !== 'push' ||
        latest.head_repository?.full_name !== repository
    ) {
        return skip('no-ci-run', sha);
    }
    if (latest.status !== 'completed') return skip('ci-not-finished', sha);
    if (latest.conclusion !== 'success') return skip('ci-not-successful', sha);

    // main can move while the CI history is read.
    if ((await readMainSha(api, repository)) !== sha) return skip('stale', sha);
    return { deploy: true, sha, reason: 'current' };
}

async function readMainSha(api, repository) {
    const ref = await api(`/repos/${repository}/git/ref/heads/main`);
    return requireSha(ref.object?.sha, 'the tip of main');
}

// The newest push run of ci.yml for the commit. Runs are not filtered by
// result: a newer failed or unfinished run (a re-run included) must block the
// commit even when an earlier run for it succeeded.
async function latestCiRun(api, repository, sha) {
    const query = new URLSearchParams({
        branch: 'main',
        event: 'push',
        head_sha: sha,
        per_page: '100',
    });
    const runs = [];
    for (let page = 1; ; page++) {
        const result = await api(
            `/repos/${repository}/actions/workflows/ci.yml/runs?${query}&page=${page}`
        );
        // The API lists at most 1,000 runs for a filtered query.
        if (!Array.isArray(result.workflow_runs) || result.total_count > 1000) {
            throw new Error('pages-target: cannot read the CI runs of the commit');
        }
        runs.push(...result.workflow_runs);
        if (result.workflow_runs.length < 100) break;
        if (page === 10) throw new Error('pages-target: too many CI runs to check');
    }
    return runs.sort((a, b) => b.run_number - a.run_number)[0];
}

function requireSha(value, what) {
    const text = String(value ?? '');
    if (!SHA.test(text)) throw new Error(`pages-target: ${what} is not a commit SHA: "${text}"`);
    return text;
}

// GET requests to the GitHub REST API. An HTTP error fails the check; the
// message never contains the token.
export function githubApi({ token, apiUrl = 'https://api.github.com' }, fetcher = fetch) {
    return async (path) => {
        const response = await fetcher(`${apiUrl}${path}`, {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28',
            },
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
            throw new Error(`pages-target: GitHub API returned HTTP ${response.status}`);
        }
        return response.json();
    };
}

export function formatOutputs(decision) {
    return `deploy=${decision.deploy}\nsha=${decision.sha}\nreason=${decision.reason}\n`;
}

export function readInput(env) {
    return {
        eventName: env.GITHUB_EVENT_NAME,
        event: JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8')),
        repository: env.GITHUB_REPOSITORY,
        ref: env.GITHUB_REF,
        sha: env.GITHUB_SHA,
        targetSha: env.PAGES_TARGET_SHA,
    };
}

async function main() {
    let decision;
    try {
        const api = githubApi({ token: process.env.GH_TOKEN, apiUrl: process.env.GITHUB_API_URL });
        decision = await decidePagesTarget(readInput(process.env), api);
    } catch (error) {
        console.error(`::error::${error.message}`);
        process.exit(1);
    }
    if (decision.deploy) {
        console.log(`Publishing ${decision.sha} (${decision.reason}).`);
    } else {
        console.log(`::notice::Not publishing from this run: ${decision.reason}.`);
    }
    const outputs = formatOutputs(decision);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, outputs);
    else process.stdout.write(outputs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
