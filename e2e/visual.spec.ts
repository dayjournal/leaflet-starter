import { test, expect, stabilizeTileRequests, MAP_READY_TIMEOUT_MS } from './_helpers';

test('visual: map container screenshot', async ({ page }) => {
    await stabilizeTileRequests(page);

    await page.goto('/');
    const map = page.locator('#map');
    await expect(map).toBeVisible();

    // Wait until every tile has loaded and finished Leaflet's fade-in animation.
    // Explicit timeout: fail fast with this location instead of waiting out the
    // 60s test timeout when tiles never settle.
    await page.waitForFunction(
        () => {
            const tiles = document.querySelectorAll('.leaflet-tile');
            const loaded = document.querySelectorAll('.leaflet-tile-loaded');
            return (
                tiles.length > 0 &&
                loaded.length === tiles.length &&
                Array.from(tiles).every((tile) => getComputedStyle(tile).opacity === '1')
            );
        },
        undefined,
        { timeout: MAP_READY_TIMEOUT_MS }
    );

    // No baseline is committed (snapshotDir is gitignored; see playwright.config.ts):
    // the first local run writes .playwright-snapshots/ and fails — rerun to compare.
    await expect(map).toHaveScreenshot('map.png', {
        // Keep it tight to reduce irrelevant diffs
        animations: 'disabled',
        scale: 'css',
    });
});
