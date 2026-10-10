import {
    test,
    expect,
    stabilizeTileRequests,
    waitForMapReady,
    expectValidTileRequests,
    MAP_READY_TIMEOUT_MS,
} from './_helpers';

test('smoke: Leaflet renders loaded tiles', async ({ page }) => {
    const tileUrls = await stabilizeTileRequests(page);

    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible();

    // L.map('map') adds the .leaflet-container class to #map itself, so this
    // selector only matches once Leaflet has initialized on the container.
    await expect(page.locator('#map.leaflet-container')).toBeVisible({
        timeout: MAP_READY_TIMEOUT_MS,
    });

    await waitForMapReady(page);
    await expectValidTileRequests(tileUrls);
});
