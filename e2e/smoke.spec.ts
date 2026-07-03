import {
    test,
    expect,
    stabilizeTileRequests,
    expectValidTileRequests,
    MAP_READY_TIMEOUT_MS,
} from './_helpers';

test('smoke: page loads, Leaflet initializes, and tile URLs are well-formed', async ({ page }) => {
    const tileUrls = await stabilizeTileRequests(page);

    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible();

    // L.map('map') adds the .leaflet-container class to #map itself, so this
    // selector only matches once Leaflet has initialized on the container.
    await expect(page.locator('#map.leaflet-container')).toBeVisible({
        timeout: MAP_READY_TIMEOUT_MS,
    });

    await expectValidTileRequests(tileUrls);
});
