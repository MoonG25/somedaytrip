// 발권 화면 · 탑승권: 여러 도시 여행(via) · 날짜를 정하면 상태 고르기 · 예산을 현지 통화로
import { test, expect, createPlan, collectErrors, stubPlaces } from './fixtures';
import type { Page } from '@playwright/test';

/** 목적지 고르기 */
async function pickDest(page: Page, q: string) {
  await page.fill('input[name=q]', q);
  await page.locator('#ac-dest li[data-i]').first().waitFor();
  await page.keyboard.press('Enter');
  await page.locator('.dest-card:not([hidden])').waitFor();
}

/** 함께 들를 도시 더하기 */
async function addVia(page: Page, q: string) {
  if (await page.locator('[data-via-open]').isVisible()) await page.click('[data-via-open]');
  await page.fill('input[name=vq]', q);
  await page.locator('#ac-via li[data-i]').first().waitFor();
  await page.keyboard.press('Enter');
}

/** 발권 카드에서 기장 정하고 계획 화면으로 */
async function issue(page: Page, owner = '기장', pw = 'test1234') {
  await page.click('.composer-actions [data-save]');
  await page.locator('.issue-modal[open]').waitFor();
  await page.fill('.issue-modal input[name=ownerName]', owner);
  await page.fill('.issue-modal input[name=pw]', pw);
  await page.click('[data-issue]');
  await page.waitForURL(/\/p\/\w+\//, { timeout: 20_000 });
  await page.locator('.sdt-modal[open]').waitFor();
  await page.click('.sdt-modal[open] .sdt-modal-head button');
  return page.url().split('/p/')[1].split('/')[0];
}

test('경유 도시: 발권 화면에서 더하면 탑승권에 via, 고치기에서 유지·삭제', async ({ page }) => {
  const errs = collectErrors(page);
  await page.goto('/new');
  await expect(page.locator('.via-box')).toBeHidden(); // 목적지를 고르기 전엔 없다
  await pickDest(page, '도쿄');
  await page.click('[data-via-open]');
  await expect(page.locator('input[name=vq]')).toBeFocused();
  await addVia(page, '오사카');
  await expect(page.locator('.via-chip')).toHaveCount(1);
  await addVia(page, '삿포로');
  await expect(page.locator('.via-chip')).toHaveCount(2);
  // 같은 도시는 두 번 들어가지 않는다
  await addVia(page, '오사카');
  await expect(page.locator('.via-chip')).toHaveCount(2);
  await page.click('[data-when="someday"]');
  await page.click('[data-quick="5"]');
  await expect(page.locator('input[name=title]')).toHaveValue('도쿄·오사카·삿포로 4박 5일');
  await expect(page.locator('.preview-ticket .tk-via')).toContainText('오사카 · 삿포로');
  // 순서 바꾸기 → 자동 이름도 따라간다
  await page.click('[data-via-up="1"]');
  await expect(page.locator('input[name=title]')).toHaveValue('도쿄·삿포로·오사카 4박 5일');
  const id = await issue(page);
  await expect(page.locator('.ticket--big .tk-via')).toHaveText(/via\s+삿포로 · 오사카/);
  await expect(page.locator('.ticket--big .tk-title')).toContainText('도쿄·삿포로·오사카 4박 5일');

  // 고치기: 그대로 열리고, 하나 지우면 탑승권에서도 빠진다
  await page.goto(`/p/${id}/edit`);
  await expect(page.locator('.via-chip')).toHaveCount(2);
  await expect(page.locator('.via-chip').first()).toContainText('삿포로');
  await page.click('[data-via-del="0"]');
  await expect(page.locator('.via-chip')).toHaveCount(1);
  await page.click('.composer-actions [data-save]');
  await page.waitForURL(new RegExp(`/p/${id}/`));
  await expect(page.locator('.ticket--big .tk-via')).toHaveText(/via\s+오사카$/);

  // 다 지우면 via 줄이 없다 (예전 계획과 똑같이)
  await page.goto(`/p/${id}/edit`);
  await page.click('[data-via-del="0"]');
  await expect(page.locator('.via-chip')).toHaveCount(0);
  await expect(page.locator('[data-via-open]')).toBeVisible();
  await page.click('.composer-actions [data-save]');
  await page.waitForURL(new RegExp(`/p/${id}/`));
  await expect(page.locator('.ticket--big .tk-route')).toBeVisible();
  await expect(page.locator('.ticket--big .tk-via')).toHaveCount(0);
  expect(errs).toEqual([]);
});

test('경유 도시는 6곳까지, 좁은 화면에서도 넘치지 않는다', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await stubPlaces(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto('/new');
  await pickDest(page, '런던');
  for (const q of ['도쿄', '오사카', '후쿠오카', '삿포로', '리스본', '제주']) await addVia(page, q);
  await expect(page.locator('.via-chip')).toHaveCount(6);
  await expect(page.locator('[data-via-open]')).toBeHidden();
  await expect(page.locator('.via-max')).toBeVisible();
  await page.click('[data-when="someday"]');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.click('.composer-mbar [data-save]');
  await page.locator('.issue-modal[open]').waitFor();
  await page.fill('.issue-modal input[name=ownerName]', '기장');
  await page.fill('.issue-modal input[name=pw]', 'test1234');
  await page.click('[data-issue]');
  await page.waitForURL(/\/p\/\w+\//, { timeout: 20_000 });
  await page.locator('.sdt-modal[open]').waitFor();
  await page.click('.sdt-modal[open] .sdt-modal-head button');
  await expect(page.locator('.ticket--big .tk-via')).toContainText('도쿄 · 오사카');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  // 긴 via 줄은 탑승권 안에서 말줄임
  const box = await page.locator('.ticket--big .tk-via').boundingBox();
  const tk = await page.locator('.ticket--big .tk-main').boundingBox();
  expect(box && tk && box.x + box.width <= tk.x + tk.width + 1).toBe(true);
  await ctx.close();
});

test('날짜를 정하면 상태를 고른다 → 탑승권 칩 "예약 완료"', async ({ page }) => {
  await page.goto('/new');
  await pickDest(page, '후쿠오카');
  await expect(page.locator('.status-seg')).toBeHidden();
  await page.click('[data-when="date"]');
  await expect(page.locator('.status-seg')).toBeVisible();
  await expect(page.locator('[data-status="planning"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-status="done"]')).toHaveCount(0); // 다녀옴은 고치기에서만
  // 언젠가로 바꾸면 상태 칸은 숨고 "언젠가"
  await page.click('[data-when="someday"]');
  await expect(page.locator('.status-seg')).toBeHidden();
  await expect(page.locator('.preview-ticket .tk-chip')).toHaveText('언젠가');
  await page.click('[data-when="date"]');
  await page.click('.cal [data-nav="1"]');
  const days = page.locator('.cal [data-d]:not([disabled])');
  await days.nth(2).click();
  await days.nth(5).click();
  await page.click('[data-status="booked"]');
  await expect(page.locator('[data-status="booked"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.preview-ticket .tk-chip')).toHaveText('예약 완료');
  await issue(page, '후쿠기장', 'fukuoka1');
  await expect(page.locator('.ticket--big .tk-chip')).toHaveText('예약 완료');
  await expect(page.locator('.ticket--big .tk-stamp')).toContainText('CONFIRMED');
});

test('예산을 현지 통화로 적으면 환율로 원화로 바꿔 저장', async ({ page }) => {
  // 1원 = 0.108엔 → 1엔 ≈ 9.26원
  await page.route('https://open.er-api.com/**', (r) => r.fulfill({ json: { result: 'success', base_code: 'KRW', rates: { KRW: 1, JPY: 0.108 } } }));
  await createPlan(page, { place: '오사카' });
  await page.click('[data-task=budget]');
  await expect(page.locator('.pf-rate')).toContainText('1엔 ≈ 9.3원');
  await page.click('.sdt-modal[open] .pf-cur [role=radio]:has-text("엔")');
  await page.click('.sdt-modal[open] .chip:has-text("항공")');
  const amt = page.locator('.pf-row').nth(0).locator('input.num');
  await expect(amt).toHaveAttribute('aria-label', '금액 (엔)');
  await amt.fill('17751');
  await expect(amt).toHaveValue('17,751');
  await expect(page.locator('.pf-conv')).toHaveText('¥17,751 → ₩164,361');
  await expect(page.locator('.pf-total')).toContainText('164,361');
  await page.click('.sdt-modal[open] .modal-actions .btn--solid');
  await expect(page.locator('.ticket--big')).toContainText('164,361');
  // 다시 열면 원화로 저장돼 있다
  await page.click('[data-task=budget]');
  await expect(page.locator('.pf-row').nth(0).locator('input.num')).toHaveValue('164,361');
});

test('환율을 못 받으면 현지 통화 입력을 막고 안내', async ({ page }) => {
  await page.route('https://open.er-api.com/**', (r) => r.fulfill({ status: 500, body: 'down' }));
  await createPlan(page, { place: '오사카' });
  await page.click('[data-task=budget]');
  await expect(page.locator('.pf-rate')).toContainText('원화로만');
  await expect(page.locator('.sdt-modal[open] .pf-cur [role=radio]:has-text("엔")')).toBeDisabled();
  await page.click('.sdt-modal[open] .chip:has-text("항공")');
  await expect(page.locator('.pf-row').nth(0).locator('input.num')).toHaveAttribute('aria-label', '금액');
});

test('원화로 여행하는 계획은 통화 고르기가 없다', async ({ page }) => {
  await createPlan(page, { place: '강릉' });
  await page.click('[data-task=budget]');
  await expect(page.locator('.sdt-modal[open] .pf-rows')).toBeAttached();
  await expect(page.locator('.pf-cur')).toHaveCount(0);
});
