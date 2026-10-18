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
- `pnpm-workspace.yaml`, `.prettierignore`, `.node-version`
- the `.gitignore` entries for `dist`, `dist-subpath/`, `/docs/`, `artifacts/`,
  `.playwright-snapshots/`, `test-results/` and `playwright-report/`

Edit for the repository:

- `.github/deps-config.mjs`: the package groups, the package the project version
  follows, and the names shown in README and release notes
- `pnpm-workspace.yaml`, `allowBuilds`: whatever `pnpm install` reports for this
  repository's dependencies
- `playwright.config.ts`: root/subpath projects and library-specific preview builds
- `e2e/_helpers.ts`, `e2e/fixtures/`, `e2e/smoke.spec.ts` and
  `e2e/visual.spec.ts`: the map library's own fixtures and readiness checks

Remove: the root `package-lock.json`, any older update workflow or script,
and tracked build outputs in `dist/`, `docs/` or `artifacts/`.

Optional: `.github/workflows/pages.yml` builds and deploys `dist/` after CI
succeeds on main. Adapt its build step to the library's base-path handling;
see [GitHub Pages](#github-pages). Legacy `docs/` build scripts may remain
for local compatibility checks, but their generated files are ignored and
not committed. Configure Pages to use GitHub Actions before removing tracked
`docs/` from a starter that still publishes from a branch.

## What the repository must have

- default branch `main`
- pnpm, pinned through `packageManager` in package.json; managed packages as
  `^x.y.z` ranges; package.json indented with 2 spaces (the update script
  rewrites it that way)
- `.node-version`
- `vite.config.mts` for an explicit ESM Vite configuration; include it in
  `tsconfig.json` while keeping library-specific plugins, base and output settings
- `scripts.build` runs `tsc` before `vite build`, so a TypeScript update is
  type-checked
- `e2e/smoke.spec.ts` and `e2e/visual.spec.ts`, with exactly one
  `toHaveScreenshot('map.png', ...)`, projects named `root` and `subpath`,
  `snapshotDir: '.playwright-snapshots'` and `updateSnapshots: 'none'`. The
  workflow tests both projects and copies `map-root-linux.png` for the PR
  comparison image. The tests use no network
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

## GitHub Pages

For repositories with `workflows/pages.yml`, automatic deployment follows a
successful `CI` run for a push to this repository's `main`. The build checks
out the exact commit CI validated. PRs (including a fork branch named `main`),
failed CI and cancelled CI do not trigger an automatic deployment. A manual
run (`workflow_dispatch`) must be started on `main` and passes the same checks
as an automatic one: it republishes the current `main` and cannot publish a
branch, a tag, an older commit or a commit whose CI failed or has not
finished. GitHub Release creation and Pages deployment are separate workflows.

CI runs finish in any order and an old run can be re-run, so a completed run
is not proof that its commit is still the tip of `main`, or that CI still
passes for it. `scripts/pages-target.mjs` reads the tip of `main` and the
commit's `ci.yml` runs through the GitHub API (`contents: read`,
`actions: read`). A commit is published only while it is the tip of `main`
and the latest push CI run for that exact commit has succeeded. The runs are
not filtered by result, so a newer failed, cancelled or unfinished run, a
re-run included, blocks the commit even after an earlier run passed. The
workflow checks once in a first job, before anything enters a concurrency
group, so that a stale run normally ends there, and once more right before
`deploy-pages`, where the commit must also be the one the build job checked
out. A run that does not qualify is skipped with a notice; a failed API
request or an unreadable answer stops the run with an error.

The check and the entry into a concurrency group are separate steps, and
GitHub orders a group by arrival, not by commit. The groups are chosen so
that a run which became stale in between can never cancel or replace the run
for a newer commit. Builds use one group per commit (`pages-build-<sha>`):
only another run for the same commit (a CI re-run or a manual run) replaces
a running build, and a stale build that slipped past the first check costs
its minutes and nothing else. Deployments share one group (`pages-deploy`),
run one at a time and are never cancelled midway. The group uses
`queue: max`, so every waiting run is kept (up to 100; beyond that GitHub
cancels further runs) instead of only the newest one, and a stale run that
arrives late cannot replace a waiting run for a newer commit. The queue is
ordered by arrival, so the check right before `deploy-pages` decides when
each run gets its turn: a run whose commit is no longer the tip of `main` is
skipped and the newer run publishes. `queue: max` cannot be combined with
`cancel-in-progress: true`. Whether GitHub accepts the setting and keeps
and skips queued runs as intended can only be observed on GitHub, not in
the local tests.

Before merging the Pages workflow:

1. In **Settings > Pages > Build and deployment**, change **Source** from
   **Deploy from a branch** to **GitHub Actions**. Do not add another suggested
   Jekyll or static-site workflow; `workflows/pages.yml` handles deployment.
2. In **Settings > Environments > github-pages**, set **Deployment branches
   and tags** to **Selected branches and tags** and allow the `main` branch.
   Keep this restriction if it already exists. Fully automatic publication
   requires an environment without a manual approval requirement.
3. Ensure Actions is enabled and the actions pinned in `pages.yml` are allowed
   by the repository/organization policy. The default workflow permission can
   remain read-only: the check and deploy jobs add `actions: read`, and only
   the separate deploy job requests `pages: write` and `id-token: write`.
   Pages does not need a PAT, the dependency-update App key, or additional
   secrets.
4. Merge the workflow into `main`, then check that the main push's `CI` succeeds
   and `Deploy GitHub Pages` completes. If the Pages settings were changed after
   that run, run `Deploy GitHub Pages` from the **Run workflow** menu on `main`;
   it publishes only after the CI run for that commit has succeeded.

The build publishes `dist/`. Leaflet, OpenLayers and MapLibre GL JS set
`VITE_BASE` to the repository path. Cesium keeps its relative `base: './'` so
the plugin's runtime assets are copied and resolved correctly. Keep those
library-specific build steps when sharing this workflow. Retained `docs/`
scripts are local checks, not part of the automatic publication path.
Generated `dist/` and `docs/` files are ignored and are not committed.

References: [Pages source settings](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
and [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

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
Dependabot proposes their updates separately. To run the validator, version
selection and Pages target tests locally:

```sh
npm ci --prefix .github --ignore-scripts --no-audit --no-fund
node --test .github/scripts/verify-update.test.mjs \
  .github/scripts/select-version.test.mjs \
  .github/scripts/pages-target.test.mjs
```

## How versions are chosen

Only stable `x.y.z` releases that are at least 7 days old are taken, the same
rule pnpm applies through `minimumReleaseAge` in `pnpm-workspace.yaml`. A group
whose install, build or e2e fails is rolled back and listed in the PR; the other
groups still ship.

Updates stay within the current major version (`scripts/select-version.mjs`).
When `latest` points at a new major, the run logs it and still takes a newer
same-major release when one qualifies; otherwise the package, lockfile,
project version and README are left unchanged. A skipped major is not a
failure and never appears in the PR. Adopting it is manual, see below.

## Major updates

A new major of a managed package is a change to review, not a daily update:

1. Read the library's migration guide and decide what the app, the e2e tests
   and the build need.
2. On a branch, install the release with `pnpm add <name>@<version>`
   (`-D` for a devDependency). Keep `minimumReleaseAge`: a release younger
   than 7 days is refused, so wait rather than bypass it.
3. Make the code changes, then run `pnpm run format:check`, `pnpm test` and
   `pnpm run test:visual`, and look at the map and any screenshot diff.
4. Set the project version by the rule the daily update follows: the new
   version of the package named in `projectVersionFollows` when that package
   changed, otherwise a fourth segment. Update the `<Name> vX.Y.Z` lines in
   both README sections.
5. Open a pull request for human review. Once it is merged, the daily update
   continues within the new major.

## Manual tooling updates

The daily workflow updates only the groups in `deps-config.mjs`.
`@playwright/test`, `@types/node` and `prettier` are maintained manually,
as are Node.js (`.node-version`) and pnpm (`packageManager`). Dependabot
separately covers GitHub Actions and the validator packages in `.github/`.
Review the manual tools monthly and when a managed update reveals a
compatibility problem.

1. With the current versions, run `pnpm install --frozen-lockfile`,
   `pnpm exec playwright install chromium`, `pnpm run format:check` and
   `pnpm test`. Inspect the map, then record a visual baseline with
   `pnpm run test:visual:update` before changing versions.
2. Select compatible stable releases that are at least 7 days old. Keep
   `@types/node` on the Node.js major used by the project. Update each tool
   deliberately with the project's pinned pnpm and regenerate
   `pnpm-lock.yaml`; do not bypass `minimumReleaseAge` or update unrelated
   map-library packages as part of this step.
3. For Node.js, update `.node-version` and both language sections of
   `README.md`. For pnpm, update `packageManager` and both README sections,
   then regenerate the lockfile with that pnpm version. Keep these version
   declarations consistent and check the new runtime's supported platforms.
4. Run `pnpm install --frozen-lockfile`, `pnpm run format:check`, `pnpm test`
   and `pnpm run test:visual`. After changing Playwright, install its Chromium
   again before testing. The smoke and visual tests must cover both `root`
   and `subpath`; `pnpm test` also runs TypeScript checking and the build.
   Run the validator tests described in [Checking update results](#checking-update-results)
   as well, especially after changing Node.js or pnpm. Where available, also
   run `pnpm run build:ghpages` to check the retained local `docs/` build.
5. Inspect formatting and screenshot differences. If a browser update
   deliberately changes rendering, review the actual images before explicitly
   refreshing local baselines and rerunning `pnpm run test:visual`. Do not
   regenerate a failing baseline just to make the test pass. Baselines and
   build outputs stay untracked.

## Running the update script locally

Record the visual baseline first with `pnpm run test:visual:update`; the
workflow records it from main the same way. Then
`node .github/scripts/deps-check-and-update.mjs` prints the step outputs
instead of writing them to `$GITHUB_OUTPUT`. It runs `pnpm install`,
`pnpm run build` and `pnpm exec playwright test` for each group and rewrites
package.json, pnpm-lock.yaml and README.md, so run it on a branch.
