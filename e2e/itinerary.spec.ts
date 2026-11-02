// 일정: 기장은 바로 반영 · 승객은 바구니 → 제안 → 일정 위에 반투명 → 기장이 하나씩 반영·거절
import { test, expect, createPlan, newPerson, boardAsGuest, addItem, sendBasket, setTime } from './fixtures';

test('기장 추가·제안·하나씩 반영·우선순위·충돌·철회', async ({ page, browser }) => {
  const { url } = await createPlan(page, { pw: 'owner123' });
  await addItem(page, { title: '오도리 공원', time: '10:00' });
  await addItem(page, { title: '니조 시장', time: '13:00' });
  await expect(page.locator('.itinerary .route-item')).toHaveCount(2);

  // 승객 A: 시간 수정 + 추가 2 (하나는 시간 사이)
  const { page: a, ctx: ca } = await newPerson(browser);
  await a.addInitScript(() => localStorage.setItem('sdt:name', '지민'));
  await boardAsGuest(a, url);
  await a.locator('.itinerary .route-item').first().hover();
  await a.locator('.itinerary .route-item').first().locator('[aria-label=고치기]').click();
  await setTime(a, '09:00');
  await a.click('.sdt-modal[open] button[type=submit]');
  await addItem(a, { title: '맥주 박물관', time: '15:00', place: '센소지' });
  await addItem(a, { title: '시계탑', time: '11:00' });
  await expect(a.locator('.basket')).toContainText('추가 2 · 수정 1');
  await sendBasket(a, '아침 일찍 가자!');
  await expect(a).not.toHaveURL(/\/pr\//);
  await expect(a.locator('.route-item.is-ghost')).toHaveCount(2);
  await expect(a.locator('.sg-strip.update')).toBeVisible();

  // 승객 B: A와 같은 곳 + 빼기
  const { page: b, ctx: cb } = await newPerson(browser);
  await b.addInitScript(() => localStorage.setItem('sdt:name', '준호'));
  await boardAsGuest(b, url);
  await expect(b.locator('text=기장 검토 중').first()).toBeVisible();
  await addItem(b, { title: '맥주 박물관', time: '15:00', place: '센소지' });
  await b.locator('.itinerary .route-item:not(.is-ghost):not(.is-add)').nth(1).locator('[aria-label=지우기]').click();
  await sendBasket(b);

  // 기장: 대기열 4개, 같은 곳은 하나로 맨 앞
  await page.goto(url);
  await expect(page.locator('.sq-row')).toHaveCount(4);
  await expect(page.locator('.sq-row').first()).toContainText('2명이 원해요');
  await expect(page.locator('.role-bar')).toContainText('검토할 제안 4개');
  // 시간 자리에 추가 제안(시계탑 11:00은 10:00과 13:00 사이)
  const order = await page.locator('.itin-day').first().locator('.route-list > li').evaluateAll((els) => els.map((e) => (e.classList.contains('is-ghost') ? 'G' : e.classList.contains('ri-suggs') ? 'S' : 'R')));
  expect(order.join('')).toBe('RSGRSG');

  await page.locator('.sq-row').first().locator('.sg-ok').click();
  await expect(page.locator('.sq-row')).toHaveCount(3);
  await expect(page.locator('.itinerary .route-item:not(.is-ghost) .ri-title').filter({ hasText: '맥주' })).toHaveCount(1);
  await page.locator('.sg-strip.update .sg-no').click();
  await expect(page.locator('.sg-strip.update')).toHaveCount(0);
  await expect(page.locator('.itinerary .route-item').first()).toContainText('10:00');

  // 충돌: 기장이 고친 뒤 빼기 제안 반영 → 확인 후 덮어씀
  await page.locator('.itinerary .route-item:not(.is-ghost)').nth(1).hover();
  await page.locator('.itinerary .route-item:not(.is-ghost)').nth(1).locator('[aria-label=고치기]').click();
  await setTime(page, '14:00');
  await page.click('.sdt-modal[open] button[type=submit]');
  await expect(page.locator('.sg-strip.remove')).toContainText('그 사이 바뀜');
  await page.locator('.sg-strip.remove .sg-ok').click();
  await expect(page.locator('.itinerary .route-item .ri-title').filter({ hasText: '니조' })).toHaveCount(0);

  // 승객 A 철회 → 대기열 사라짐
  await a.goto(url);
  await a.locator('.sq-row').first().locator('.link-u').click();
  await expect(a.locator('.sugg-queue')).toHaveCount(0);

  // 기록
  await page.goto(url);
  const pills = await page.locator('.pr-row .pill').allTextContents();
  expect(pills).toEqual(expect.arrayContaining(['일부 수락', '수락됨']));
  await ca.close();
  await cb.close();
});

test('승객 제안 바구니: 되돌리기 · 비우기', async ({ page, browser }) => {
  const { url } = await createPlan(page);
  await addItem(page, { title: '첫 일정', time: '10:00' });
  const { page: g, ctx } = await newPerson(browser);
  await g.addInitScript(() => localStorage.setItem('sdt:name', '손님'));
  await boardAsGuest(g, url);
  await g.locator('.itinerary .route-item').first().locator('[aria-label=지우기]').click();
  await expect(g.locator('.route-item.is-remove')).toBeVisible();
  await g.locator('.route-item.is-remove .link-u').click();
  await expect(g.locator('.basket')).toHaveCount(0);
  await ctx.close();
});
