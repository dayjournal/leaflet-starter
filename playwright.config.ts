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
    // Baselines are created only by an explicit --update-snapshots run.
    updateSnapshots: 'none',
    use: {
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        // Make renders more deterministic in CI.
        colorScheme: 'light',
        reducedMotion: 'reduce',
    },
    projects: [
        { name: 'root', use: { baseURL: 'http://127.0.0.1:4173/' } },
        { name: 'subpath', use: { baseURL: 'http://127.0.0.1:4174/leaflet-starter/' } },
    ],
    webServer: [
        {
            command: 'pnpm run preview --host 127.0.0.1 --port 4173',
            url: 'http://127.0.0.1:4173/',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
        {
            // Build separately with the Pages base for the subpath check.
            command:
                'pnpm exec vite build --base /leaflet-starter/ --outDir dist-subpath && pnpm exec vite preview --base /leaflet-starter/ --outDir dist-subpath --host 127.0.0.1 --port 4174',
            url: 'http://127.0.0.1:4174/leaflet-starter/',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
    ],
});
