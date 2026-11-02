// 홈 · 내 계획(브라우저 저장 + 쿠키 백업) · 지갑 알림 · 검색용 HTML · 반복 새로고침 없음
import { test, expect, createPlan, newPerson, boardAsGuest, collectErrors } from './fixtures';

test('홈: 서버가 그린 글자 · 전광판 · 예시 탑승권', async ({ page, request }) => {
  const errs = collectErrors(page);
  const html = await (await request.get('/')).text();
  expect(html).toContain('이스탄불, 두 대륙 사이에서');
  await page.goto('/');
  await expect(page.locator('.ticket').first()).toBeVisible();
  expect(await page.locator('.ticket').count()).toBeGreaterThanOrEqual(8);
  await expect(page.locator('.board-body .flap').first()).toBeAttached({ timeout: 10_000 });
  expect(errs).toEqual([]);
});

test('홈에 들어가도 요청이 반복되지 않는다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sdt:mine', JSON.stringify(['kyoto-autumn-plan'])));
  let posts = 0;
  page.on('request', (r) => r.method() === 'POST' && posts++);
  await page.goto('/');
  await page.waitForTimeout(6000);
  expect(posts).toBeLessThanOrEqual(2);
});

test('내 계획: 저장소를 지워도 쿠키로, 쿠키를 지워도 저장소로 되살아난다', async ({ page, browser }) => {
  const { url, id } = await createPlan(page);
  const { page: g, ctx } = await newPerson(browser);
  await boardAsGuest(g, url);
  await g.evaluate(() => localStorage.clear());
  await g.goto('/');
  await expect(g.locator('[data-mine]')).toBeVisible();
  expect(await g.evaluate(() => localStorage.getItem('sdt:mine'))).toContain(id);
  await expect(g.locator('.wallet-bar')).toContainText('이 브라우저에만');
  await ctx.clearCookies();
  await g.goto('/');
  await expect(g.locator('[data-mine]')).toBeVisible();
  // 지갑 알림 닫으면 다시 안 뜸
  await g.click('.wallet-bar .wb-close');
  await g.reload();
  await g.waitForTimeout(1500);
  await expect(g.locator('.wallet-bar')).toHaveCount(0);
  await ctx.close();
});

test('모바일 주요 화면에 가로 넘침이 없다', async ({ browser }) => {
  const { page, ctx } = await newPerson(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const p of ['/', '/new', '/signup', '/login', '/privacy', '/p/kyoto-autumn-plan/kyoto-5days']) {
    await page.goto(p);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), p).toBe(false);
  }
  await ctx.close();
});
