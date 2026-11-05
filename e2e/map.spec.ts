// 일정 지도: 트랙패드 핀치(ctrl+휠)로 바로 확대 · 화면이 새로 고쳐져도 보던 위치·확대가 그대로
import type { Page } from '@playwright/test';
import { test, expect, createPlan, addItem } from './fixtures';

// 타일은 밖에서 받지 않고 빈 그림으로 (주소의 z가 확대 단계)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const zoomOf = (page: Page) =>
  page.locator('.route-map .leaflet-tile-container img').evaluateAll((imgs) => Math.max(...imgs.map((i) => Number((i as HTMLImageElement).src.match(/\/(\d+)\/\d+\/\d+\.png/)?.[1] || 0))));

test('핀치로 확대하고, 일정을 더해도 지도가 처음으로 돌아가지 않는다', async ({ page }) => {
  await page.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await createPlan(page, { place: '도쿄' });
  await addItem(page, { day: 1, title: '센소지', place: '센소지' });
  const map = page.locator('.route-map');
  await map.scrollIntoViewIfNeeded();
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(0);
  const z0 = await zoomOf(page);

  // 핀치 = ctrl + 휠 (클릭하지 않아도)
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 30);
  await page.keyboard.up('Control');
  await expect.poll(() => zoomOf(page)).toBeLessThan(z0);
  const z1 = await zoomOf(page);
  // 페이지 자체는 확대되지 않는다
  expect(await page.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);

  // 일정을 더하면 화면이 새로 고쳐진다: 지도는 그대로
  await addItem(page, { day: 1, title: '저녁 산책' });
  await page.waitForTimeout(800);
  expect(await zoomOf(page)).toBe(z1);
});
