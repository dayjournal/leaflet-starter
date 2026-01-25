import { test, expect, stabilizeTileRequests } from './_helpers';

test('visual: map container screenshot', async ({ page }) => {
  await stabilizeTileRequests(page);

  await page.goto('/');
  const map = page.locator('#map');
  await expect(map).toBeVisible();

  // Give Leaflet a moment to render the first frame.
  await page.waitForTimeout(500);

  await expect(map).toHaveScreenshot('map.png', {
    // Keep it tight to reduce irrelevant diffs
    animations: 'disabled',
    scale: 'css',
  });
});
