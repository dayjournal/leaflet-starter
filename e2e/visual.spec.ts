import {
    test,
    expect,
    stabilizeTileRequests,
    waitForMapReady,
    expectValidTileRequests,
} from './_helpers';

test('visual: map container screenshot', async ({ page }) => {
    const tileUrls = await stabilizeTileRequests(page);

    await page.goto('./');
    const map = page.locator('#map');
    await expect(map).toBeVisible();

    await waitForMapReady(page);
    await expectValidTileRequests(tileUrls);

    // No baseline is committed (snapshotDir is gitignored; see playwright.config.ts):
    // check the map by eye, then create one with `pnpm run test:visual:update`.
    await expect(map).toHaveScreenshot('map.png', {
        // Keep it tight to reduce irrelevant diffs
        animations: 'disabled',
        scale: 'css',
    });
});
