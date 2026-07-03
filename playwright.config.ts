import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    timeout: 60_000,
    expect: {
        timeout: 10_000,
    },
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],
    // Snapshots live in one directory that .gitignore excludes — no baseline is
    // committed. .github/workflows/deps-autoupdate.yml regenerates the baseline
    // from pre-update main (--update-snapshots) before comparing.
    snapshotDir: '.playwright-snapshots',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        // Make renders more deterministic in CI.
        colorScheme: 'light',
        // reducedMotion is a context option, not a top-level `use` option —
        // outside contextOptions it would be silently ignored.
        contextOptions: { reducedMotion: 'reduce' },
    },
    webServer: {
        // `vite preview` serves the existing dist/ build — run `pnpm run build`
        // first (as ci.yml does), or the tests hit a stale or missing build.
        command: 'pnpm run preview --host 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
});
