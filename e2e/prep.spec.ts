// 탑승 준비 카드 (기장): 예산 · 소개 · 준비물은 체크리스트로 · 친구 초대
import { test, expect, createPlan, newPerson, boardAsGuest } from './fixtures';

test('예산(1인당·다 같이) · 소개 · 준비물 이동 · 공유', async ({ page, browser }) => {
  const { url } = await createPlan(page, { place: '오사카', travelers: 2 });
  await expect(page.locator('.pf-head b')).toContainText('0/5');
  await page.click('[data-task=budget]');
  await expect(page.locator('.pf-ppl output')).toHaveText('2명');
  await page.click('.sdt-modal[open] .chip:has-text("항공")');
  await page.locator('.pf-row').nth(0).locator('input.num').fill('450000');
  await page.click('.sdt-modal[open] .chip:has-text("숙소")');
  await page.locator('.pf-row').nth(1).locator('input.num').fill('600000');
  await expect(page.locator('.pf-row').nth(1).locator('.b-per')).toContainText('다 같이');
  await expect(page.locator('.pf-total')).toContainText('750,000');
  await expect(page.locator('.pf-total')).toContainText('1,500,000');
  await page.click('.sdt-modal[open] .btn--solid');
  await expect(page.locator('.pf-head b')).toContainText('1/5');
  await expect(page.locator('.ticket--big')).toContainText('750,000');

  await page.click('[data-task=why]');
  await page.fill('.sdt-modal[open] input.inp', '도톤보리에서 밤새 먹기');
  await page.click('.sdt-modal[open] .btn--solid');
  await expect(page.locator('main')).toContainText('도톤보리에서 밤새 먹기');

  await page.click('[data-task=check]');
  await expect(page.locator('.ck-add input')).toBeFocused();

  await page.click('[data-task=invite]');
  await expect(page.locator('.sdt-modal[open] h2')).toContainText('공유');
  await page.click('.sdt-modal[open] .sdt-modal-head button');

  const { page: g, ctx } = await newPerson(browser);
  await boardAsGuest(g, url);
  await expect(g.locator('.prep-board')).toHaveCount(0);
  await ctx.close();
});
