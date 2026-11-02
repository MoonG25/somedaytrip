// 일정 창: 장소 목록 닫기 · 아무 분 · 끝 시각 · 상태 · 통화 · 저장하고 다음 · 먼 장소 확인
import { test, expect, createPlan, setTime, type Page } from './fixtures';

const M = '.sdt-modal[open]';

/** 1일차 "추가" 창 열기 */
async function openAdd(page: Page) {
  await page.locator('.itin-day').first().locator('.itin-add').click();
  await page.locator(`${M} .item-form`).waitFor();
}
/** 첫 일정의 고치기 창 */
async function openEdit(page: Page, n = 0) {
  const row = page.locator('.itinerary .route-item').nth(n);
  await row.hover();
  await row.locator('[aria-label=고치기]').click();
  await page.locator(`${M} .item-form`).waitFor();
}

test.beforeEach(async ({ page }) => {
  // 환율 고정: 1엔 = 10원
  await page.route('https://open.er-api.com/**', (r) => r.fulfill({ json: { result: 'success', rates: { KRW: 1, JPY: 0.1, USD: 0.00075 } } }));
});

test('장소 목록은 바깥 클릭·Esc·blur로 닫히고 저장을 막지 않는다', async ({ page }) => {
  await createPlan(page);
  await openAdd(page);
  const search = page.locator(`${M} input[aria-label="장소 검색"]`);
  const list = page.locator(`${M} .ac-list`);

  // 바깥 클릭(이름 칸)
  await search.fill('센소지');
  await expect(list.locator('li[data-i]')).toHaveCount(1);
  await page.locator(`${M} .item-form input.inp`).first().click();
  await expect(list).toHaveCount(0);

  // 다시 포커스하면 열리고, Esc는 목록만 닫는다 (창은 그대로)
  await search.focus();
  await expect(list).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toHaveCount(0);
  await expect(page.locator(`${M} .item-form`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator(`${M} .item-form`)).toHaveCount(0);

  // "찾지 못했어요" 안내도 blur로 닫힌다
  await openAdd(page);
  await search.fill('없는곳이름');
  await expect(page.locator(`${M} .ac-msg`)).toContainText('결과가 없어요');
  await page.keyboard.press('Tab');
  await expect(page.locator(`${M} .ac-msg`)).toHaveCount(0);

  // 목록이 열린 채로 저장해도 저장된다
  await page.locator(`${M} .item-form input.inp`).first().fill('아사쿠사 산책');
  await search.fill('센소지');
  await expect(list.locator('li[data-i]')).toHaveCount(1);
  await page.click(`${M} button[type=submit]`);
  await expect(page.locator(`${M} .item-form`)).toHaveCount(0);
  await expect(page.locator('.itinerary .route-item')).toContainText(['아사쿠사 산책']);

  // 목록 항목 클릭은 그대로 된다
  await openAdd(page);
  await page.locator(`${M} .item-form input.inp`).first().fill('하네다 도착');
  await search.fill('하네다');
  await list.locator('li[data-i]').first().click();
  await expect(page.locator(`${M} .place-chosen`)).toContainText('하네다공항');
});

test('아무 분이나 넣고 끝 시각을 적는다', async ({ page }) => {
  await createPlan(page);
  await openAdd(page);
  await page.locator(`${M} .item-form input.inp`).first().fill('온천');
  await setTime(page, '13:07');
  await page.selectOption(`${M} select[aria-label="끝 시"]`, '15');
  await page.selectOption(`${M} select[aria-label="끝 분"]`, '26');
  await page.click(`${M} button[type=submit]`);
  await expect(page.locator('.itinerary .route-item').first()).toContainText('13:07');

  // 다시 열면 그대로
  await openEdit(page);
  await expect(page.locator(`${M} select[aria-label="시"]`)).toHaveValue('13');
  await expect(page.locator(`${M} select[aria-label="분"]`)).toHaveValue('07');
  await expect(page.locator(`${M} select[aria-label="끝 시"]`)).toHaveValue('15');
  await expect(page.locator(`${M} select[aria-label="끝 분"]`)).toHaveValue('26');
  // 16:25가 16:20으로 바뀌지 않는다
  await setTime(page, '16:25');
  await page.click(`${M} button[type=submit]`);
  await expect(page.locator('.itinerary .route-item').first()).toContainText('16:25');

  // 이름 앞에 적은 시각은 시간 칸으로
  await openAdd(page);
  await page.locator(`${M} .item-form input.inp`).first().fill('16:40-17:30 체크인');
  await expect(page.locator(`${M} .item-form input.inp`).first()).toHaveValue('체크인');
  await expect(page.locator(`${M} select[aria-label="분"]`)).toHaveValue('40');
  await expect(page.locator(`${M} select[aria-label="끝 시"]`)).toHaveValue('17');
  await expect(page.locator(`${M} select[aria-label="끝 분"]`)).toHaveValue('30');
});

test('상태와 통화(엔 ↔ 원)를 고르고 원화 환산을 본다', async ({ page }) => {
  await createPlan(page);
  await openAdd(page);
  await page.locator(`${M} .item-form input.inp`).first().fill('료칸 저녁');
  const tags = page.locator(`${M} [role=radiogroup][aria-label="상태"]`);
  await expect(tags.locator('[role=radio][aria-checked=true]')).toHaveText('없음');
  await tags.locator('[role=radio]', { hasText: '예약 완료' }).click();
  await expect(tags.locator('[role=radio][aria-checked=true]')).toContainText('예약 완료');

  // 해외 계획이면 기본 통화는 계획 통화
  const cur = page.locator(`${M} [role=radiogroup][aria-label="통화"]`);
  await expect(cur.locator('[aria-checked=true]')).toHaveText('엔');
  await page.fill(`${M} input[aria-label="예상 비용"]`, '1200');
  await expect(page.locator(`${M} .money-hint`)).toHaveText('≈ ₩12,000');
  await page.click(`${M} button[type=submit]`);
  await expect(page.locator(`${M} .item-form`)).toHaveCount(0);

  await openEdit(page);
  await expect(tags.locator('[role=radio][aria-checked=true]')).toContainText('예약 완료');
  await expect(cur.locator('[aria-checked=true]')).toHaveText('엔');
  await expect(page.locator(`${M} input[aria-label="예상 비용"]`)).toHaveValue('1,200');
  // 원화로 바꾸면 만 원 단위 안내
  await cur.locator('[role=radio]', { hasText: '원' }).click();
  await page.fill(`${M} input[aria-label="예상 비용"]`, '16500');
  await expect(page.locator(`${M} .money-hint`)).toHaveText('1만 6,500 원');
  await tags.locator('[role=radio]', { hasText: '희망' }).click();
  await page.click(`${M} button[type=submit]`);
  await openEdit(page);
  await expect(cur.locator('[aria-checked=true]')).toHaveText('원');
  await expect(tags.locator('[role=radio][aria-checked=true]')).toContainText('희망');
});

test('저장하고 다음 일정: 창이 열린 채 같은 날 빈 폼, 순서가 이어진다', async ({ page }) => {
  await createPlan(page);
  await page.locator('.itin-day').nth(1).locator('.itin-add').click();
  await page.locator(`${M} .item-form`).waitFor();
  const title = page.locator(`${M} .item-form input.inp`).first();
  await title.fill('아침 뷔페');
  await setTime(page, '07:30');
  await page.fill(`${M} [placeholder="예: 새벽 6시 반 출발"]`, '1층 식당\n7시부터');
  await page.click(`${M} .save-next`);
  // 창은 그대로, 폼은 비고 이름 칸에 포커스
  await expect(title).toHaveValue('');
  await expect(title).toBeFocused();
  await expect(page.locator(`${M} select[aria-label="시"]`)).toHaveValue('');
  await expect(page.locator(`${M} .day-chips [aria-checked=true]`)).toContainText('DAY 02');
  // Ctrl+Enter = 저장하고 다음
  await title.fill('체크아웃');
  await setTime(page, '10:00');
  await title.press('Control+Enter');
  await expect(title).toHaveValue('');
  // 그냥 Enter는 저장하고 닫기
  await title.fill('버스 타기');
  await setTime(page, '10:30');
  await title.press('Enter');
  await expect(page.locator(`${M} .item-form`)).toHaveCount(0);

  const day2 = page.locator('.itin-day').nth(1).locator('.route-item .ri-title');
  await expect(day2).toHaveText([/아침 뷔페/, /체크아웃/, /버스 타기/]);
  // 여러 줄 메모가 남는다
  const row = page.locator('.itin-day').nth(1).locator('.route-item').first();
  await row.hover();
  await row.locator('[aria-label=고치기]').click();
  await expect(page.locator(`${M} [placeholder="예: 새벽 6시 반 출발"]`)).toHaveValue('1층 식당\n7시부터');
  // 고칠 때는 "저장하고 다음"이 없다
  await expect(page.locator(`${M} .save-next`)).toHaveCount(0);
});

test('여행지에서 먼 장소는 고르기 전에 확인한다', async ({ page }) => {
  await createPlan(page);
  await openAdd(page);
  await page.locator(`${M} .item-form input.inp`).first().fill('야식');
  const search = page.locator(`${M} input[aria-label="장소 검색"]`);
  await search.fill('강릉');
  await page.locator(`${M} .ac-list li[data-i]`).first().click();
  const warn = page.locator(`${M} .far-warn`);
  await expect(warn).toContainText(/여행지에서 약 [\d,]+km 떨어진 곳이에요/);
  await expect(page.locator(`${M} .place-chosen`)).toHaveCount(0);

  // 다시 찾기 → 경고가 닫히고 검색으로
  await warn.locator('button', { hasText: '다시 찾기' }).click();
  await expect(warn).toHaveCount(0);
  await expect(search).toBeFocused();

  // 가까운 곳은 바로
  await search.fill('스카이트리');
  await page.locator(`${M} .ac-list li[data-i]`, { hasText: '스카이트리' }).click();
  await expect(page.locator(`${M} .place-chosen`)).toContainText('도쿄 스카이트리');

  // 그래도 이 장소
  await search.fill('강릉');
  await page.locator(`${M} .ac-list li[data-i]`).first().click();
  await warn.locator('button', { hasText: '그래도 이 장소' }).click();
  await expect(page.locator(`${M} .place-chosen`)).toContainText('강릉');
});

test('모바일에서 일정 창이 가로로 넘치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createPlan(page);
  await openAdd(page);
  await page.fill(`${M} input[aria-label="예상 비용"]`, '1200');
  const over = await page.locator(`${M} .sdt-modal-body`).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});
