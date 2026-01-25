import { expect, test } from '@playwright/test';

const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0e5N8AAAAASUVORK5CYII=', 'base64');

async function stabilizeTileRequests(page: any) {
  // Make tile rendering deterministic (avoid network / remote tile changes).
  await page.route('https://tile.mierune.co.jp/**', async (route: any) => {
    await route.fulfill({
      status: 200,
      headers: {
        'cache-control': 'public, max-age=31536000',
      },
      contentType: 'image/png',
      body: TINY_PNG,
    });
  });
}

export { expect, test, stabilizeTileRequests };
