// 휴대폰 화면: 아이폰 SE(375)에서 일정 창이 잘리지 않고, 폴드 접은 화면(412)에서 지도 버튼이 핀을 가리지 않는다
import { test, expect, createPlan, addItem } from './fixtures';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.use({ isMobile: true, hasTouch: true });

test('아이폰 SE: 일정 추가 창의 칸이 창 안에 들어온다', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await createPlan(page, { place: '도쿄' });
  await page.locator('.itin-day').first().locator('.itin-add').click();
  const form = page.locator('.sdt-modal[open] .item-form');
  await form.waitFor();
  const { sw, cw } = await form.evaluate((f) => ({ sw: f.scrollWidth, cw: f.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
  // DAY 칩은 그 줄 안에서 옆으로 넘긴다
  const chips = page.locator('.sdt-modal[open] .day-chips');
  expect(await chips.evaluate((c) => c.scrollWidth > c.clientWidth)).toBe(true);
});

test('폴드 접은 화면: 지도 위 버튼 밑에 핀이 깔리지 않는다', async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org|opentopomap\.org|arcgisonline\.com/, (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await createPlan(page, { place: '도쿄' });
  await addItem(page, { day: 1, title: '하네다', place: '하네다' });
  await addItem(page, { day: 1, title: '센소지', place: '센소지' });
  await addItem(page, { day: 2, title: '스카이트리', place: '스카이트리' });
  // 일정은 넓은 화면에서 넣고(좁으면 둘째 날이 접혀 있다), 폴드 크기로 다시 연다
  await page.setViewportSize({ width: 412, height: 914 });
  await page.reload();
  const pins = page.locator('.route-map .leaflet-marker-icon');
  await expect(pins).toHaveCount(3);
  await page.locator('.route-map').scrollIntoViewIfNeeded();
  const under = await page.locator('.route-map-wrap').evaluate((w) => Math.max(...Array.from(w.querySelectorAll('.map-base, .map-days'), (c) => c.getBoundingClientRect().bottom)));
  const tops = await pins.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  for (const t of tops) expect(t).toBeGreaterThanOrEqual(under);
});
