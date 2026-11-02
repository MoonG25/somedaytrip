// 발권 흐름: 한 화면 작성 → 발권 카드 → 계획 화면 · 공항 고르기 · 고치기
import { test, expect, createPlan, collectErrors } from './fixtures';

test('목적지만 고르면 종류·이름 자동 · 발권 카드에서 기장 정하기', async ({ page }) => {
  const errs = collectErrors(page);
  await page.goto('/new');
  await expect(page.locator('[data-step="how"] .budget')).toBeHidden();
  await expect(page.locator('.choice-cards.three')).toBeHidden();
  await page.fill('input[name=q]', '강릉');
  await page.locator('.ac-list li[data-i]').first().waitFor();
  await page.keyboard.press('Enter');
  await expect(page.locator('input[name=title]')).toHaveValue(/^강릉/);
  await expect(page.locator('[data-scope2="local"]')).toBeVisible(); // 국내면 동네/국내 칩
  await page.click('[data-when="someday"]');
  await page.click('[data-quick="3"]');
  await expect(page.locator('input[name=title]')).toHaveValue('강릉 2박 3일');
  await page.click('[data-qppl="4"]');
  await page.click('.composer-actions [data-save]');
  await expect(page.locator('.issue-modal[open] .issue-ticket .ticket')).toBeVisible();
  await page.fill('.issue-modal input[name=ownerName]', '문');
  await page.fill('.issue-modal input[name=pw]', 'ab');
  await page.click('[data-issue]');
  await expect(page).toHaveURL(/\/new$/); // 짧은 비밀번호는 거절
  await page.fill('.issue-modal input[name=pw]', 'gangneung1');
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/p\/\w+\//);
  await expect(page.locator('.sdt-modal[open] h2')).toContainText('계획이 생겼어요');
  await page.click('.sdt-modal[open] .sdt-modal-head button');
  await expect(page.locator('.role-bar.is-owner')).toBeVisible();
  await expect(page.locator('.ticket--big')).toContainText('2박 3일');
  await expect(page.locator('.ticket--big')).toContainText('4명');
  expect(errs).toEqual([]);
});

test('공항이 여러 개인 도시는 칩으로 고르고, 고치기에서도 유지', async ({ page }) => {
  await page.goto('/new');
  await page.fill('input[name=q]', '도쿄');
  await page.locator('.ac-list li[data-i]').first().waitFor();
  await page.keyboard.press('Enter');
  await expect(page.locator('.dc-air [data-air]')).toHaveCount(2);
  await page.click('.dc-air [data-air="HND"]');
  await expect(page.locator('.preview-ticket .tk-port.to b')).toHaveText('HND');
  await page.click('[data-air-custom]');
  await expect(page.locator('input[name=iata]')).toBeFocused();
  await page.fill('input[name=iata]', 'HND');
  await page.click('[data-when="someday"]');
  await page.click('.composer-actions [data-save]');
  await page.fill('.issue-modal input[name=ownerName]', '도쿄기장');
  await page.fill('.issue-modal input[name=pw]', 'tokyo123');
  await page.click('[data-issue]');
  await page.waitForURL(/\/p\/\w+\//);
  await expect(page.locator('.ticket--big .tk-port.to b')).toHaveText('HND');
  const id = page.url().split('/p/')[1].split('/')[0];
  await page.goto(`/p/${id}/edit`);
  await expect(page.locator('.dc-air [data-air="HND"]')).toHaveAttribute('aria-checked', 'true');
  await page.click('.dc-air [data-air="NRT"]');
  await page.click('[data-save]');
  await page.waitForURL(new RegExp(`/p/${id}/`));
  await expect(page.locator('.ticket--big .tk-port.to b')).toHaveText('NRT');
});

test('런던은 공항 5개, 공항 하나뿐인 도시는 직접 입력 링크만', async ({ page }) => {
  for (const [q, n] of [['런던', 5], ['후쿠오카', 0]] as const) {
    await page.goto('/new');
    await page.fill('input[name=q]', q);
    await page.locator('.ac-list li[data-i]').first().waitFor();
    await page.keyboard.press('Enter');
    await expect(page.locator('.dc-air [data-air]')).toHaveCount(n);
    if (!n) await expect(page.locator('[data-air-custom]')).toBeVisible();
  }
});

test('모바일 발권: 아래 저장 바가 푸터에 가려지지 않는다', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { stubPlaces } = await import('./fixtures');
  await stubPlaces(ctx);
  const page = await ctx.newPage();
  await page.goto('/new');
  await page.fill('input[name=q]', '제주');
  await page.locator('.ac-list li[data-i]').first().waitFor();
  await page.keyboard.press('Enter');
  await page.click('[data-when="someday"]');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.click('.composer-mbar [data-save]');
  await expect(page.locator('.issue-modal[open]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await ctx.close();
});

test('계획 화면 기본: 링크 공개는 noindex, 없는 계획은 404', async ({ page, request }) => {
  const { url } = await createPlan(page);
  const html = await (await request.get(url)).text();
  expect(html).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  expect((await request.get('/p/nope-nope-xx')).status()).toBe(404);
});
