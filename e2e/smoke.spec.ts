import {
    test,
    expect,
    stabilizeTileRequests,
    waitForMapReady,
    expectValidTileRequests,
    tileLevel,
    MAP_READY_TIMEOUT_MS,
} from './_helpers';

// src/main.ts sets L.Icon.Default.imagePath to 'img/icon/', a path relative to
// the page, so markers find the copies of public/img/icon/ under any base.
// vite preview answers a missing file with index.html (HTTP 200), so the type
// is checked as well as the status.
const MARKER_ICONS = ['marker-icon.png', 'marker-icon-2x.png', 'marker-shadow.png'];

test('smoke: Leaflet renders loaded tiles', async ({ page, baseURL }) => {
    const tileUrls = await stabilizeTileRequests(page);

    await page.goto('./');
    await expect(page.locator('#map')).toBeVisible();

    // L.map('map') adds the .leaflet-container class to #map itself, so this
    // selector only matches once Leaflet has initialized on the container.
    await expect(page.locator('#map.leaflet-container')).toBeVisible({
        timeout: MAP_READY_TIMEOUT_MS,
    });

    await waitForMapReady(page);
    await expectValidTileRequests(tileUrls);

    for (const file of MARKER_ICONS) {
        const url = new URL(`img/icon/${file}`, baseURL).href;
        const response = await page.request.get(url);
        expect(response.status(), url).toBe(200);
        expect(response.headers()['content-type'], url).toMatch(/^image\//);
    }
});

test('smoke: the tile URL check rejects anything but a valid MIERUNE tile', async () => {
    expect(tileLevel('https://tile.mierune.co.jp/mierune_mono/11/1818/806.png')).toBe(11);
    for (const url of [
        // Wrong host, wrong path prefix, unexpanded template, out of range.
        'https://example.com/mierune_mono/11/1818/806.png',
        'https://tile.mierune.co.jp/other/mierune_mono/11/1818/806.png',
        'https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png',
        'https://tile.mierune.co.jp/mierune_mono/11/2048/806.png',
        'https://tile.mierune.co.jp/mierune_mono/11/1818/2048.png',
    ]) {
        expect(tileLevel(url), url).toBe(-1);
    }
});
