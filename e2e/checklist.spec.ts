// 모두의 체크리스트: 누구나 더하고 체크하고 고치고 지운다 · 계획 정보 저장이 덮어쓰지 않는다
import { test, expect, createPlan, newPerson, boardAsGuest } from './fixtures';

const items = (p: import('@playwright/test').Page) => p.locator('.checklist .check-text').allTextContents();

test('기장·승객 모두 고치고, 정보 고치기를 저장해도 남는다', async ({ page, browser }) => {
  const { url, id } = await createPlan(page);
  await expect(page.locator('.ck-add input')).toBeVisible();
  await expect(page.locator('.ck-suggest .chips')).toBeHidden();
  await page.fill('.ck-add input', 'JR패스 교환');
  await page.keyboard.press('Enter');
  await expect(page.locator('.checklist li')).toHaveCount(1);
  await page.click('.ck-suggest summary');
  await expect(page.locator('[data-cksug="여권 유효기간 확인"]')).toBeVisible();
  await page.click('[data-cksug="멀티 어댑터"]');
  await expect(page.locator('.checklist li')).toHaveCount(2);
  await expect(page.locator('[data-cksug="멀티 어댑터"]')).toHaveCount(0);
  await page.fill('.ck-add input', 'JR패스 교환');
  await page.keyboard.press('Enter');
  await expect(page.locator('.checklist li')).toHaveCount(2); // 같은 항목은 막음
  await page.locator('.checklist li').first().hover();
  await page.click('[data-ckedit="0"]');
  await page.fill('.ck-edit', 'JR패스 교환 (신주쿠)');
  await page.keyboard.press('Enter');
  await expect(page.locator('.checklist .check-text').first()).toHaveText('JR패스 교환 (신주쿠)');

  const { page: g, ctx } = await newPerson(browser);
  await boardAsGuest(g, url);
  await g.fill('.ck-add input', '보조배터리');
  await g.keyboard.press('Enter');
  await expect(g.locator('.checklist li')).toHaveCount(3);
  await g.locator('.checklist li').nth(2).locator('.check-box').click();
  await g.waitForTimeout(800);
  await g.locator('.checklist li').first().hover();
  await g.click('[data-ckdel="0"]');
  await expect(g.locator('.checklist li')).toHaveCount(2);

  await page.reload();
  expect(await items(page)).toEqual(['멀티 어댑터', '보조배터리']);
  await expect(page.locator('.checklist input').nth(1)).toBeChecked();

  await page.goto(`/p/${id}/edit`);
  await expect(page.locator('[data-step="prep"]')).toBeHidden();
  await page.fill('input[name=title]', '이름 바꿈');
  await page.click('[data-save]');
  await page.waitForURL(new RegExp(`/p/${id}/`));
  await expect(page.locator('.checklist li')).toHaveCount(2);
  await ctx.close();
});
