// 3단계 리뷰에서 확인된 문제들의 회귀 테스트
import { test, expect, createPlan, newPerson, addItem } from './fixtures';

const title = (p: import('@playwright/test').Page) => p.locator('.sdt-modal[open] .item-form input.inp').first();

test('이름 앞 시각: 한 글자씩 친 "16:40 - 17:30 체크인"도 시작·끝 시각으로', async ({ page }) => {
  await createPlan(page);
  await page.locator('.itin-day').first().locator('.itin-add').click();
  await title(page).pressSequentially('16:40 - 17:30 체크인', { delay: 15 });
  await expect(title(page)).toHaveValue('체크인');
  await expect(page.locator('.sdt-modal[open] select[aria-label="시"]')).toHaveValue('16');
  await expect(page.locator('.sdt-modal[open] select[aria-label="분"]')).toHaveValue('40');
  await expect(page.locator('.sdt-modal[open] select[aria-label="끝 시"]')).toHaveValue('17');
  await expect(page.locator('.sdt-modal[open] select[aria-label="끝 분"]')).toHaveValue('30');
});

test('고치는 일정은 이름 앞 시각을 떼지 않고, "아침 산책"은 먹기로 짐작하지 않는다', async ({ page }) => {
  await createPlan(page);
  await page.locator('.itin-day').first().locator('.itin-add').click();
  await title(page).fill('아침 산책');
  await expect(page.locator('.sdt-modal[open] [aria-label="종류"] [role=radio][aria-checked="true"]')).toContainText('구경');
  await page.click('.sdt-modal[open] button[type=submit]');
  await addItem(page, { title: '전망대', time: '09:00' });
  const row = page.locator('.itinerary .route-item').filter({ hasText: '전망대' });
  await row.hover();
  await row.locator('[aria-label=고치기]').click();
  await title(page).fill('10:00 전망대');
  await expect(title(page)).toHaveValue('10:00 전망대');
  await expect(page.locator('.sdt-modal[open] select[aria-label="시"]')).toHaveValue('09');
});

test('터치 화면: 일정 줄의 고치기·지우기 버튼이 흐리게 남지 않는다', async ({ page, browser }) => {
  const { url } = await createPlan(page);
  await addItem(page, { title: '하네다 → 요코하마' });
  const { page: m, ctx } = await newPerson(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await page.context().storageState() });
  await m.goto(url);
  const actions = m.locator('.route-item .ri-actions').first();
  await expect(actions).toBeVisible();
  expect(Number(await actions.evaluate((e) => getComputedStyle(e).opacity))).toBe(1);
  await ctx.close();
});
