import { test, expect, stabilizeTileRequests } from './_helpers';

test('smoke: page loads and map container exists', async ({ page }) => {
  await stabilizeTileRequests(page);

  await page.goto('/');
  await expect(page.locator('#map')).toBeVisible();

  // Leaflet creates a container with .leaflet-container class inside the map element.
  await expect(page.locator('#map.leaflet-container')).toBeVisible({ timeout: 15_000 });
});
