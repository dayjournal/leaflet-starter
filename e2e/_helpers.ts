import { expect, test as base, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Real basemap tiles for the default view (Tokyo, zoom 11) are committed under
// e2e/fixtures/tiles/{z}/{x}/{y}.png and served by stabilizeTileRequests, so
// screenshots show the actual map — offline and deterministically. To refresh
// them (only needed if the map's center/zoom/viewport changes), see the note
// on stabilizeTileRequests below.
const TILES_DIR = path.join(__dirname, 'fixtures', 'tiles');

// Fallback tile for any {z}/{x}/{y} without a committed fixture (e.g. an
// off-screen buffer tile Leaflet prefetches): a 256x256 light-gray PNG with a
// subtle 64px grid and a top/left border, so screenshots show the tiles being
// laid out (a transparent pixel would make the basemap invisible and hide
// tile placement regressions from the visual diff).
// Exact contents: #eeeeee background, 1px #e0e0e0 grid lines at x/y = 64/128/192,
// 1px #c8c8c8 border on the top and left edges. To change it, produce a matching
// PNG with any tool and re-encode, e.g.:
//   magick -size 256x256 xc:'#eeeeee' -fill '#e0e0e0' \
//     -draw 'line 64,0 64,255 line 128,0 128,255 line 192,0 192,255 line 0,64 255,64 line 0,128 255,128 line 0,192 255,192' \
//     -fill '#c8c8c8' -draw 'line 0,0 255,0 line 0,0 0,255' tile.png && base64 -i tile.png
const TILE_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAAD5klEQVR42u3WUQ0AIQxEwfpXVhmrAA144I92UDDJ9uWu2vMWv+ru8/NLws///ATALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAfELwAHxC8AB8QvAAfELwAHxC8AB8QvAAfELwAHxC8AB8QvAAfELwAHxC8AB8QvAAfELwAHxC4CfXwD8/ALg5xcAP78A+PkFwM8vAH5+AfDzC4CfXwD8/ALg5xcAvwAEwC8AA/ALwAD8AjAAvwAMwC8AA/ALwAD8AjAAvwAMwC8AA/DPCyCet/X5AvD7BTIAvwAMwC8AA/ALwAD8AjAAvwAMwC8AA/ALwAD8AjAAvwAMwC8AA/ALwAD8AjAAvwAMwC8AA/ALwAD8AjAAvwAMwC8AA/ALwAD8AjAAvwAMwC8AA/ALwAD8AjAAvwAcEL8AHBC/ABwQvwAcEL8AHBC/ABwQvwAcEL8AHBC/ABwQvwAcEL8AHBC/ABwQvwAcEL8AHBC/APj5BcDPLwB+fgHw8wuAn18A/PwC4OcXAD+/APj5BcDPLwB+fgHwC0AA/AIwAL8ADMAvAAPwC8AA/AIwAL8ADMAvAAPwC8AA/AIwAL8ADMA/KoB43tbnC8DvF8gA/AIwAL8ADMAvAAPwC8AA/AIwAL8ADMAvAAPwC8AA/AIwAL8ADMAvAAPwC8AA/AIwAL8ADMAvAAPwC8AA/AIwAL8ADMAvAAPwC8AA/AIwAL8ADMAvAAPwC8AA/AJwQPwCcED8AnBA/AJwQPwCcED8AnBA/AJwQPwCcED8AnBA/AJwQPwCcED8AnBA/AJwQPwCcED8AuDnFwA/vwD4+QXAzy8Afn4B8PMLgJ9fAPz8AuDnFwA/vwD4+QXALwAB8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAD/qADieVufLwC/XyAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAPwCMAC/AAzALwAD8AvAAfELwAHxC8AB8QvAAfELwAHxC8AB8QvAAfELwAHxC8AB8QvAAfELwAHxC8AB8QvAAfELwAHxC4CfXwD8/ALg5xcAP78A+PkFwM8vAH5+AfDzC4CfXwD8/ALg5xcAvwAEwC8AA/ALwAD8AjAAvwAMwC8AA/ALwAD8AjAAvwAMwC8AA/ALwAD8Y/wXhT9Moc1hrTAAAAAASUVORK5CYII=',
    'base64'
);

// Tile URLs must have numeric {z}/{x}/{y} — catches Leaflet URL templating regressions
// that the fulfilled mock tiles would otherwise hide.
const TILE_URL_PATTERN = /\/mierune_mono\/\d+\/\d+\/\d+\.png$/;
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

// Make tile rendering deterministic (avoid network / remote tile changes) while
// still showing the real basemap: serve committed fixture tiles from TILES_DIR,
// falling back to the gray placeholder for any tile without a fixture.
// Returns the fulfilled tile URLs for expectValidTileRequests.
//
// To refresh the fixtures after changing the map's center/zoom/viewport: add
// `console.log(route.request().url())` below, run the visual spec once
// (`pnpm exec playwright test e2e/visual.spec.ts --update-snapshots`) to list
// the requested {z}/{x}/{y}, then download each into e2e/fixtures/tiles/, e.g.
//   curl -s "https://tile.mierune.co.jp/mierune_mono/{z}/{x}/{y}.png" \
//     -o "e2e/fixtures/tiles/{z}/{x}/{y}.png"
async function stabilizeTileRequests(page: Page): Promise<string[]> {
    const tileUrls: string[] = [];
    // The browser requests /favicon.ico on its own; vite preview would 404 it,
    // which the runtime-error fixture would flag as a console error.
    await page.route('**/favicon.ico', (route) => route.fulfill({ status: 204 }));
    await page.route('https://tile.mierune.co.jp/**', async (route) => {
        const url = route.request().url();
        tileUrls.push(url);
        const m = url.match(/\/mierune_mono\/(\d+)\/(\d+)\/(\d+)\.png$/);
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

async function expectValidTileRequests(tileUrls: string[]) {
    await expect
        .poll(() => tileUrls.length, {
            message: 'expected the map to request tiles',
            timeout: MAP_READY_TIMEOUT_MS,
        })
        .toBeGreaterThanOrEqual(MIN_EXPECTED_TILES);
    const invalid = tileUrls.filter((url) => !TILE_URL_PATTERN.test(url));
    expect(invalid, 'tile URLs should contain numeric {z}/{x}/{y}').toEqual([]);
}

export { expect, test, stabilizeTileRequests, expectValidTileRequests };
