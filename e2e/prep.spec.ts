// 탑승 준비 카드 (기장): 예산 · 소개 · 준비물은 체크리스트로 · 친구 초대
import { test, expect, createPlan, newPerson, boardAsGuest } from './fixtures';

test('예산(1인당·다 같이) · 소개 · 준비물 이동 · 공유', async ({ page, browser }) => {
  const { url } = await createPlan(page, { place: '오사카', travelers: 2 });
  await expect(page.locator('.pf-head b')).toContainText('0/5');
  // 예산은 계획 화면의 예상 경비에서 바로 (창 없이)
  await page.click('[data-task=budget]');
  const bb = page.locator('#budget');
  await expect(page.locator('.bb-add input')).toBeFocused();
  await expect(bb.locator('.bb-ppl output')).toHaveText('2명');
  await bb.locator('.chip:has-text("항공")').click();
  await expect(bb.locator('.bb-row').nth(0).locator('.bb-amt input')).toBeFocused();
  await bb.locator('.bb-row').nth(0).locator('.bb-amt input').fill('450000');
  await bb.locator('.chip:has-text("숙소")').click();
  await bb.locator('.bb-row').nth(1).locator('.bb-amt input').fill('600000');
  await expect(bb.locator('.bb-row').nth(1).locator('.b-per')).toContainText('다 같이');
  await expect(bb.locator('.bb-row').nth(1).locator('.bb-note')).toContainText('1인 ₩300,000');
  await expect(bb.locator('.bb-sum')).toContainText('750,000');
  await expect(bb.locator('.bb-sum')).toContainText('1,500,000');
  // 다 같이 → 1인당: 금액도 1인 몫으로 바로 바뀐다 (합계는 그대로)
  await bb.locator('.bb-row').nth(1).locator('.b-per').click();
  await expect(bb.locator('.bb-row').nth(1).locator('.b-per')).toContainText('1인당');
  await expect(bb.locator('.bb-row').nth(1).locator('.bb-amt input')).toHaveValue('300,000');
  await expect(bb.locator('.bb-sum')).toContainText('750,000');
  await expect(bb.locator('.bb-status')).toContainText('저장했어요');
  await expect(page.locator('.pf-head b')).toContainText('1/5');
  await expect(page.locator('.ticket--big')).toContainText('750,000');
  // 지우기
  await bb.locator('.bb-row').nth(0).locator('.bb-del').click();
  await expect(bb.locator('.bb-row')).toHaveCount(1);
  await expect(bb.locator('.bb-status')).toContainText('저장했어요');
  await page.reload();
  await expect(page.locator('#budget .bb-row')).toHaveCount(1);
  await expect(page.locator('#budget .bb-row .bb-amt input')).toHaveValue('300,000');

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
  // 승객은 예산을 보기만
  await expect(g.locator('#budget .bb-row')).toHaveCount(1);
  await expect(g.locator('#budget input')).toHaveCount(0);
  await ctx.close();
});
