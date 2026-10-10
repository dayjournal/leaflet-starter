import { expect, test as base, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Fixture tiles keep map screenshots stable. See fixtures/README.md to update them.
const TILES_DIR = path.join(__dirname, 'fixtures', 'tiles');

// Missing tiles use a gray grid so tile placement remains visible.
const TILE_PNG = fs.readFileSync(path.join(__dirname, 'fixtures', 'fallback.png'));

// Validate each request before a fixture can hide an invalid tile URL.
const TILE_URL_PATTERN = /\/mierune_mono\/(\d+)\/(\d+)\/(\d+)\.png$/;
// A 1280x720 viewport requests ~20+ tiles; well below that means the map broke.
const MIN_EXPECTED_TILES = 12;
// Budget for the map to fully come up (tiles requested / loaded / faded in).
// Above the 10s expect timeout, well under the 60s test timeout (playwright.config.ts).
export const MAP_READY_TIMEOUT_MS = 15_000;

// Fail any test that produced an uncaught page error (includes unhandled
// rejections) or a console error during its run. The fixture is auto: true,
// so every spec importing `test` from this file gets the check implicitly —
// there is nothing to call from the spec.
const test = base.extend<{ _runtimeErrors: void }>({
    _runtimeErrors: [
        async ({ page }, use) => {
            const errors: string[] = [];
            page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
            page.on('console', (msg) => {
                if (msg.type() !== 'error') return;
                // Safety net for specs that skip stabilizeTileRequests: the browser's
                // automatic favicon request 404s against vite preview. Match on the
                // message's source URL only, so real errors that merely mention
                // "favicon.ico" in their text are still reported.
                if ((msg.location()?.url ?? '').includes('favicon.ico')) return;
                errors.push(`console.error: ${msg.text()}`);
            });
            await use();
            expect(errors, 'runtime errors detected during test').toEqual([]);
        },
        { auto: true },
    ],
});

// Serve local tiles and collect their URLs for expectValidTileRequests.
async function stabilizeTileRequests(page: Page): Promise<string[]> {
    const tileUrls: string[] = [];
    // The browser requests /favicon.ico on its own; vite preview would 404 it,
    // which the runtime-error fixture would flag as a console error.
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    await page.route('https://tile.mierune.co.jp/**', async (route) => {
        const url = route.request().url();
        tileUrls.push(url);
        expect(
            tileLevel(url),
            `tile URL should contain numeric {z}/{x}/{y} within range: ${url}`
        ).toBeGreaterThanOrEqual(0);
        const m = TILE_URL_PATTERN.exec(url);
        const fixture = m ? path.join(TILES_DIR, m[1], m[2], `${m[3]}.png`) : null;
        const body = fixture && fs.existsSync(fixture) ? fs.readFileSync(fixture) : TILE_PNG;
        try {
            await route.fulfill({
                status: 200,
                headers: {
                    'cache-control': 'public, max-age=31536000',
                },
                contentType: 'image/png',
                body,
            });
        } catch (error) {
            // A fulfillment can lose the race against the page closing during
            // teardown; anything else is a real mock failure and must surface.
            if (!page.isClosed()) throw error;
        }
    });
    return tileUrls;
}

// Web Mercator has 2^z tiles per axis at level z.
function tileLevel(url: string): number {
    const match = TILE_URL_PATTERN.exec(url);
    if (!match) return -1;
    const [z, x, y] = match.slice(1).map(Number);
    const tilesPerAxis = 2 ** z;
    return [z, x, y].every(Number.isSafeInteger) &&
        Number.isFinite(tilesPerAxis) &&
        x < tilesPerAxis &&
        y < tilesPerAxis
        ? z
        : -1;
}

async function waitForMapReady(page: Page) {
    await page.waitForFunction(
        () => {
            const tiles = Array.from(
                document.querySelectorAll<HTMLImageElement>('#map .leaflet-tile')
            );
            const failed = tiles.find((tile) => tile.complete && tile.naturalWidth === 0);
            if (failed) throw new Error(`tile load failed: ${failed.currentSrc || failed.src}`);
            return (
                tiles.length > 0 &&
                tiles.every(
                    (tile) =>
                        tile.complete &&
                        tile.naturalWidth > 0 &&
                        tile.classList.contains('leaflet-tile-loaded') &&
                        getComputedStyle(tile).opacity === '1'
                )
            );
        },
        undefined,
        { timeout: MAP_READY_TIMEOUT_MS }
    );
}

async function expectValidTileRequests(tileUrls: string[]) {
    await expect
        .poll(() => tileUrls.length, {
            message: 'expected the map to request tiles',
            timeout: MAP_READY_TIMEOUT_MS,
        })
        .toBeGreaterThanOrEqual(MIN_EXPECTED_TILES);
    const invalid = tileUrls.filter((url) => tileLevel(url) < 0);
    expect(invalid, 'tile URLs should contain numeric {z}/{x}/{y} within range').toEqual([]);
}

export { expect, test, stabilizeTileRequests, waitForMapReady, expectValidTileRequests };
