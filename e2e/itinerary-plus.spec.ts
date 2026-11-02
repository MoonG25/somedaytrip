// 긴 시간표 다루기: 시간순 정렬(시간 없는 줄은 제자리) · 이 아래에 추가 · 끌어서 옮기기 · 날짜 접기·칩 · 이동 한 줄 · 새 칸 표시 · 먼 거리
import type { Page } from '@playwright/test';
import { test, expect, createPlan, newPerson, boardAsGuest, skipGate, setTime } from './fixtures';

type Add = { day?: number; title: string; time?: string; place?: string; memo?: string; kind?: string; cost?: number };

/** 일정 창에 값 채우고 저장 (창은 이미 열려 있다) */
async function fillItem(page: Page, { title, time, place, memo, kind, cost }: Add) {
  await page.locator('.sdt-modal[open] .item-form').waitFor();
  await page.locator('.sdt-modal[open] .item-form input.inp').first().fill(title);
  if (kind) await page.locator('.sdt-modal[open] [aria-label="종류"] [role=radio]').filter({ hasText: kind }).click();
  if (time) await setTime(page, time);
  if (place) {
    await page.fill('.sdt-modal[open] input[aria-label="장소 검색"]', place);
    await page.locator('.sdt-modal[open] .ac-list li[data-i]').first().click();
  }
  if (cost) await page.locator('.sdt-modal[open] .money input').first().fill(String(cost));
  if (memo) await page.fill('.sdt-modal[open] [placeholder="예: 새벽 6시 반 출발"]', memo);
  await page.click('.sdt-modal[open] button[type=submit]');
  await page.locator('.sdt-modal[open] .item-form').waitFor({ state: 'detached' });
}

async function add(page: Page, a: Add) {
  const n = await page.locator('.itinerary .route-item:not(.is-ghost)').count();
  await page.locator('.itin-day').nth((a.day ?? 1) - 1).locator('.itin-add').click();
  await fillItem(page, a);
  await expect(page.locator('.itinerary .route-item:not(.is-ghost)')).toHaveCount(n + 1);
}

const titles = (page: Page, day = 1) =>
  page
    .locator('.itin-day')
    .nth(day - 1)
    .locator('.route-item:not(.is-ghost) .ri-title strong')
    .evaluateAll((els) => els.map((e) => (e.textContent || '').replace(/^\S+\s/, '').trim()));

test('시간순 정렬: 시간 없는 줄은 제자리, 되돌리기', async ({ page }) => {
  await createPlan(page);
  await add(page, { title: '점심', time: '12:00' });
  await add(page, { title: '다음 구간' });
  await add(page, { title: '아침 산책', time: '08:00' });
  // 2일차: 시간 있는 일정이 하나뿐이면 시간 없는 줄이 섞여 있어도 버튼이 없다
  await add(page, { day: 2, title: '체크아웃' });
  await add(page, { day: 2, title: '공항 가기', time: '09:00' });
  await add(page, { day: 2, title: '짐 찾기' });
  await expect(page.locator('.itin-day').nth(1).locator('.time-sort')).toHaveCount(0);

  const d1 = page.locator('.itin-day').first();
  await d1.locator('.time-sort').click();
  await expect.poll(() => titles(page)).toEqual(['아침 산책', '다음 구간', '점심']);
  await expect(d1.locator('.time-sort')).toContainText('되돌리기');
  await d1.locator('.time-sort').click();
  await expect.poll(() => titles(page)).toEqual(['점심', '다음 구간', '아침 산책']);
  await expect(page.locator('.itin-day').nth(1).locator('.time-sort')).toHaveCount(0);
});

test('이 아래에 추가: 기장은 바로, 승객은 바구니로 그 자리에', async ({ page, browser }) => {
  const { url } = await createPlan(page);
  for (const t of ['가', '나', '다']) await add(page, { title: t });
  const row = page.locator('.itinerary .route-item').filter({ hasText: '가' }).first();
  await row.hover();
  await page.click('[aria-label="가 아래에 일정 추가"]');
  await fillItem(page, { title: '끼움' });
  await expect.poll(() => titles(page)).toEqual(['가', '끼움', '나', '다']);

  const { page: g, ctx } = await newPerson(browser);
  await g.addInitScript(() => localStorage.setItem('sdt:name', '손님'));
  await boardAsGuest(g, url);
  await g.locator('.itinerary .route-item').filter({ hasText: '나' }).first().hover();
  await g.click('[aria-label="나 아래에 일정 추가"]');
  await fillItem(g, { title: '승객 제안' });
  await expect(g.locator('.basket')).toContainText('추가 1');
  await expect.poll(() => titles(g)).toEqual(['가', '끼움', '나', '승객 제안', '다']);
  await ctx.close();
});

test('끌어서 순서 바꾸기 · 손잡이 키보드', async ({ page }) => {
  await createPlan(page);
  for (const t of ['하나', '둘', '셋']) await add(page, { title: t });
  const grip = (t: string) => page.locator('.itinerary .route-item').filter({ hasText: t }).first().locator('.ri-grip');
  await page.locator('.itin-day').first().evaluate((e) => e.scrollIntoView({ block: 'center' }));
  const from = (await grip('셋').boundingBox())!;
  const to = (await page.locator('.itinerary .route-item').filter({ hasText: '하나' }).first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + ((to.y + 5 - (from.y + from.height / 2)) * i) / 8);
  await expect(page.locator('.route-item.drop-before')).toHaveCount(1);
  await page.mouse.up();
  await expect.poll(() => titles(page)).toEqual(['셋', '하나', '둘']);

  // 키보드: 손잡이에서 ↓
  await grip('셋').focus();
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => titles(page)).toEqual(['하나', '셋', '둘']);
});

test('모바일: 첫날만 펴고 나머지 접기 · 날짜 칩으로 이동 · 가로 넘침 없음', async ({ page, browser }) => {
  const { url } = await createPlan(page);
  for (const day of [1, 2, 3]) for (const t of ['아침', '점심', '저녁']) await add(page, { day, title: `${day}일 ${t}`, time: t === '아침' ? '08:00' : t === '점심' ? '12:00' : '18:00' });
  await add(page, { day: 2, title: '숙소 체크인', kind: '숙소' });

  const { page: m, ctx } = await newPerson(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await skipGate(ctx);
  await m.goto(url);
  const day = (n: number) => m.locator('.itin-day').nth(n - 1);
  await expect(day(1).locator('.itin-body')).toBeVisible();
  await expect(day(2).locator('.itin-body')).toBeHidden();
  await expect(day(3).locator('.itin-body')).toBeHidden();
  // 접힌 날도 요약(곳 수 · 오늘 밤 숙소)은 보인다
  await expect(day(2).locator('.itin-fold')).toContainText('4곳');
  await expect(day(2).locator('.itin-fold')).toContainText('🛏 숙소 체크인');
  await expect(day(2).locator('.itin-fold')).toHaveAttribute('aria-expanded', 'false');
  expect(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const folded = await m.evaluate(() => document.documentElement.scrollHeight);

  // 다 펴면 더 길다
  await day(2).locator('.itin-fold').click();
  await day(3).locator('.itin-fold').click();
  await expect(day(3).locator('.itin-body')).toBeVisible();
  const opened = await m.evaluate(() => document.documentElement.scrollHeight);
  expect(opened - folded).toBeGreaterThan(300);
  expect(await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  // 접은 상태는 이 탭에서 기억한다
  await day(1).locator('.itin-fold').click();
  await day(2).locator('.itin-fold').click();
  await day(3).locator('.itin-fold').click();
  await m.reload();
  await expect(day(1).locator('.itin-body')).toBeHidden();
  await expect(day(3).locator('.itin-body')).toBeHidden();

  // 날짜 칩: 그날을 펴고 그 자리로
  await m.click('.itin-jump .ij-chip:has-text("03")');
  await expect(day(3).locator('.itin-body')).toBeVisible();
  await expect(day(3).locator('.itin-day-head')).toBeInViewport();
  await ctx.close();
});

test('이동 구간은 작은 한 줄, 눌러서 고치기', async ({ page }) => {
  await createPlan(page);
  await add(page, { title: '센소지 구경', time: '10:00', memo: '아침 일찍' });
  await add(page, { title: '아사쿠사 → 오시아게', kind: '이동', time: '11:30', memo: '도에이 아사쿠사선 한 정거장, 걸어도 20분 정도라 날씨 좋으면 걸어가요' });
  const mv = page.locator('.route-item.is-move');
  await expect(mv).toHaveCount(1);
  await expect(mv.locator('.ri-line')).toContainText('11:30');
  await expect(mv.locator('.ri-line')).toContainText('아사쿠사 → 오시아게');
  await expect(mv.locator('.ri-memo')).toContainText('도에이');
  const hMove = (await mv.boundingBox())!.height;
  const hSee = (await page.locator('.route-item:not(.is-move)').first().boundingBox())!.height;
  expect(hMove).toBeLessThan(hSee);
  await mv.hover();
  await mv.locator('[aria-label=고치기]').click();
  await expect(page.locator('.sdt-modal[open] .item-form input.inp').first()).toHaveValue('아사쿠사 → 오시아게');
  await page.keyboard.press('Escape');
});

test('비용은 통화 기호로, 날짜 합계', async ({ page }) => {
  await createPlan(page);
  await add(page, { title: '라멘', cost: 12000 });
  await add(page, { title: '전망대', cost: 30000 });
  await expect(page.locator('.route-item').filter({ hasText: '라멘' }).locator('.ri-meta')).toContainText('₩12,000');
  await expect(page.locator('.itin-day').first().locator('.itin-fold small')).toContainText('₩42,000');
});

// 끝 시각·상태·현지 통화는 일정 창(영역 A)에 입력 칸이 생겨야 화면으로 넣을 수 있다
test.skip('새 칸 표시: 끝 시각 · 상태 배지 · 현지 통화 비용', async () => {});

test('먼 거리: 300km 넘게 떨어진 장소는 총 이동에서 빼고 경고', async ({ page }) => {
  await createPlan(page, { place: '도쿄' });
  await add(page, { title: '시부야', place: '시부야' });
  await add(page, { title: '센소지', place: '센소지' });
  await add(page, { title: '바다 보기', place: '강릉' });
  await add(page, { title: '스카이트리', place: '스카이트리' });
  const far = page.locator('.route-item.is-far');
  await expect(far).toHaveCount(1);
  await expect(far).toContainText('바다 보기');
  await expect(far.locator('.ri-far')).toContainText('멀리 떨어진 장소');
  const km = Number((await page.locator('.route-km').textContent())!.replace(/[^\d.]/g, ''));
  expect(km).toBeGreaterThan(0);
  expect(km).toBeLessThan(50);
});

test('먼 거리 예외: 공항 이동 구간은 거리에서만 빼고 경고하지 않는다', async ({ page }) => {
  await createPlan(page, { place: '도쿄' });
  await add(page, { title: '✈ 강릉 출발', kind: '이동', place: '강릉' });
  await add(page, { title: '하네다공항 도착', kind: '이동', place: '하네다' });
  await add(page, { title: '센소지', place: '센소지' });
  await expect(page.locator('.route-item.is-far')).toHaveCount(0);
  const km = Number((await page.locator('.route-km').textContent())!.replace(/[^\d.]/g, ''));
  expect(km).toBeLessThan(50);
});
