# Dependency automation

A daily workflow (`workflows/deps-autoupdate.yml`) updates the packages listed
in `deps-config.mjs`, runs build and e2e for each group, opens a pull request
with the passing updates and, when every group passed, arms auto-merge. CI
runs on the PR; once it passes GitHub merges, the Release workflow tags and
publishes, and Slack is told either way. The same files run unchanged in every
starter that follows the conventions below.

## Files

Copy as they are:

- `.github/workflows/ci.yml`, `release.yml`, `deps-autoupdate.yml`
- `.github/scripts/` (every file)
- `.github/package.json`, `.github/package-lock.json` (validator tools)
- `.github/dependabot.yml`, `.github/CODEOWNERS`, `.github/AUTOMATION.md`
- `pnpm-workspace.yaml`, `playwright.config.ts`, `.prettierignore`, `.node-version`
- `e2e/_helpers.ts` and `e2e/fixtures/`
- the `.gitignore` entries for `artifacts/`, `.playwright-snapshots/`, `test-results/`
  and `playwright-report/`

Edit for the repository:

- `.github/deps-config.mjs`: the package groups, the package the project version
  follows, and the names shown in README and release notes
- `pnpm-workspace.yaml`, `allowBuilds`: whatever `pnpm install` reports for this
  repository's dependencies
- `e2e/smoke.spec.ts` and `e2e/visual.spec.ts`: the map library's own readiness
  checks

Remove: the root `package-lock.json`, any older update workflow or script, a tracked
`artifacts/` folder.

Optional: leaflet-starter's `.github/workflows/pages.yml` deploys the demo from
CI. It needs the Pages source set to "GitHub Actions"; when switching, delete
the committed `docs/` build and the script that produced it. A starter that
keeps `docs/` has to rebuild and commit it by hand after each bot merge: the
bot only commits package.json, the lockfile, README and the two screenshots.

## What the repository must have

- default branch `main`
- pnpm, pinned through `packageManager` in package.json; managed packages as
  `^x.y.z` ranges; package.json indented with 2 spaces (the update script
  rewrites it that way)
- `.node-version`
- `scripts.build` runs `tsc` before `vite build`, so a TypeScript update is
  type-checked
- `e2e/smoke.spec.ts` and `e2e/visual.spec.ts`, with exactly one
  `toHaveScreenshot('map.png', ...)` (the workflow copies `map-*.png` onto one
  file) and `snapshotDir: '.playwright-snapshots'`; the tests use no network
  and no secrets, tiles come from the committed fixtures, and `test` from
  `e2e/_helpers.ts` fails a spec on page errors
- README lines of the form `<Name> vX.Y.Z` for every entry in `displayNames`,
  in each language section. No other README line may end a longer name with
  one of them (`Big Foo v2.0.0` would be rewritten along with `Foo v1.0.0`)

## Repository settings, in this order

1. Protect `main`: require a pull request (0 approvals is fine) and the
   `build-and-smoke` check, applied to administrators too. Do not require
   review from code owners. Check the branch protection or ruleset settings
   to confirm that `build-and-smoke` is required; `protected: true` alone
   does not confirm this.
2. Allow auto-merge; delete head branches automatically.
3. Actions, workflow permissions: read, and allow GitHub Actions to create and
   approve pull requests.
4. Install the shared GitHub App on the repository (`dayjournal-leaflet-deps`
   today; repository permissions Contents and Pull requests, read and write),
   then set the variable `APP_CLIENT_ID` and the secret `APP_PRIVATE_KEY`. The
   values are the same in every starter.
5. Set the secret `SLACK_WEBHOOK_URL`.
6. After the first merge, run the workflow once from the Actions tab with
   `dry_run=true` to check install, build and tests. Then complete the setup
   check below.
7. Separately, check the next day that a run with the event `schedule`
   appears. A schedule that never fires can be reset by disabling and
   re-enabling the workflow.

Stopping after step 3 is safe: the workflow opens the PR with `github.token`
and leaves it for a human. Doing step 4 before step 1 is not: without a
required check, `gh pr merge --auto` merges at once.

## Confirming setup

Run the workflow with `dry_run=false` when eligible updates are available and
every group passes. Check that the App token step succeeds, the PR's
`build-and-smoke` check passes, auto-merge merges the PR, CI passes on the
resulting main commit, and Release creates its tag and release.

A dry run does not issue an App token or exercise PR creation, auto-merge,
main CI or Release. A run with no updates skips this path too, so neither
confirms setup. Checking that `schedule` fires is a separate check.

## Checking update results

The publish job uses the validator from the trusted main checkout before
applying downloaded results. Updated dependencies can alter those results,
so the validator accepts only the project and managed dependency versions,
matching README versions and registry lockfile entries. It rejects changes
such as a new `postinstall` script, a different `packageManager`, an added
dependency or a non-registry package source.

The lockfile is parsed as YAML. It must use version 9, a single root importer,
registry packages with integrity hashes, and references to existing snapshots.
The importer must match package.json; lockfile settings must remain unchanged.
Unsupported sources, fields and YAML aliases stop publication for manual review.

The parser and version checker are pinned in `.github/package-lock.json`.
Publish installs only these tools from main, with install scripts disabled.
Dependabot proposes their updates separately. To run the validator tests locally:

```sh
npm ci --prefix .github --ignore-scripts --no-audit --no-fund
node --test .github/scripts/verify-update.test.mjs
```

## How versions are chosen

Only stable `x.y.z` releases that are at least 7 days old are taken, the same
rule pnpm applies through `minimumReleaseAge` in `pnpm-workspace.yaml`. A group
whose install, build or e2e fails is rolled back and listed in the PR; the other
groups still ship.

## Running the update script locally

Record the visual baseline first with `pnpm run test:visual:update`; the
workflow records it from main the same way. Then
`node .github/scripts/deps-check-and-update.mjs` prints the step outputs
instead of writing them to `$GITHUB_OUTPUT`. It runs `pnpm install`,
`pnpm run build` and `pnpm exec playwright test` for each group and rewrites
package.json, pnpm-lock.yaml and README.md, so run it on a branch.
