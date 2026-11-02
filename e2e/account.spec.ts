// 이메일 계정 (선택 가입) · 탑승권 지갑
import { test, expect, createPlan, newPerson, boardAsGuest, signup, login, uid } from './fixtures';

test('가입 규칙·중복 확인 · 계정으로 발권 · 다른 기기에서 기장 · 탈퇴', async ({ page, browser }) => {
  const r = uid();
  const email = `t_${r}@example.com`;
  const nick = `여행자${r.slice(0, 4)}`;
  await page.goto('/');
  await expect(page.locator('.header-tools .auth-in')).toBeVisible();
  await page.goto('/signup');
  await page.fill('input[type=email]', 'bad');
  await expect(page.locator('#h-email')).toContainText('모양');
  await page.fill('input[autocomplete=nickname]', '기장');
  await expect(page.locator('#h-nick')).toContainText('쓸 수 없는');
  await page.fill('input[type=email]', email);
  await page.fill('input[autocomplete=nickname]', nick);
  await page.fill('input[autocomplete=new-password]', 'pass12345');
  await expect(page.locator('.auth-submit')).toBeDisabled(); // 동의 전
  await page.check('.auth-agree input');
  await expect(page.locator('#h-nick')).toContainText('쓸 수 있는');
  await page.click('.auth-submit');
  await page.waitForURL(/\/account/);
  await expect(page.locator('.acc-nick')).toContainText(nick);
  await expect(page.locator('.header-tools .auth-me')).toBeVisible();

  // 대소문자 달라도 중복
  const { page: d, ctx: cd } = await newPerson(browser);
  await d.goto('/signup');
  await d.fill('input[type=email]', email.toUpperCase());
  await d.fill('input[autocomplete=nickname]', nick.toLowerCase());
  await expect(d.locator('#h-email')).toContainText('이미 가입');
  await expect(d.locator('#h-nick')).toContainText('이미 쓰는');
  await cd.close();

  // 계정으로 발권: 비밀번호 칸 없음
  await page.goto('/new');
  await page.fill('input[name=q]', '도쿄');
  await page.locator('.ac-list li[data-i]').first().waitFor();
  await page.keyboard.press('Enter');
  await page.click('[data-when="someday"]');
  await page.click('.composer-actions [data-save]');
  await expect(page.locator('.issue-modal input[name=pw]')).toBeHidden();
  await expect(page.locator('.issue-modal input[name=ownerName]')).toHaveValue(nick);
  await page.click('[data-issue]');
  await page.waitForURL(/\/p\/\w+\//);
  const plan = page.url().split('?')[0];

  // 다른 기기: 로그인만 하면 기장, 홈에 내 계획
  const { page: q, ctx: cq } = await newPerson(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await login(q, email);
  await q.goto(plan);
  await expect(q.locator('.role-bar.is-owner')).toBeVisible();
  await expect(q.locator('.boarding-gate')).toHaveCount(0);
  await q.goto('/');
  await expect(q.locator(`.tickets .ticket.is-mine[data-slug="${plan.split('/p/')[1].split('/')[0]}"]`)).toBeVisible();

  // 계획 비밀번호 정하기 (지금 비밀번호 없이)
  await page.goto(plan);
  await page.click('.owner-menu summary');
  await page.click('text=계획 비밀번호 정하기');
  await expect(page.locator('.sdt-modal[open] input[autocomplete=current-password]')).toHaveCount(0);
  const pws = page.locator('.sdt-modal[open] input[type=password]');
  await pws.nth(0).fill('kyoto2026');
  await pws.nth(1).fill('kyoto2026');
  await page.click('.sdt-modal[open] button[type=submit]');
  await expect(page.locator('.sdt-modal[open]')).toHaveCount(0);

  // 로그아웃 → 탈퇴
  await q.goto('/account');
  await q.click('text=로그아웃');
  await q.waitForURL((u) => u.pathname === '/');
  expect(await q.evaluate(() => document.documentElement.dataset.authed ?? '')).toBe('');
  await page.goto('/account');
  await page.click('text=탈퇴하기');
  await page.fill('.sdt-modal[open] input[type=password]', 'pass12345');
  await page.click('.sdt-modal[open] .danger-btn');
  await page.waitForURL((u) => u.pathname === '/');
  await page.goto('/login');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'pass12345');
  await page.click('.auth-submit');
  await expect(page.locator('.form-error')).toContainText('이메일 또는 비밀번호');
  await cq.close();
});

test('탑승권 저장: 가입하고 지갑에 · 다른 기기 · 빼기는 어디서나 빠짐', async ({ page, browser }) => {
  const r = uid();
  const { url, id } = await createPlan(page);
  await expect(page.locator('.save-btn')).toContainText('탑승권 저장');
  const { page: g, ctx } = await newPerson(browser);
  await boardAsGuest(g, url, `손님${r.slice(0, 3)}`);
  await g.click('.save-nudge >> text=가입하고 저장');
  await expect(g.locator('.sdt-modal[open] input[autocomplete=nickname]')).toHaveValue(/^손님/);
  await g.fill('.sdt-modal[open] input[type=email]', `w_${r}@example.com`);
  await g.fill('.sdt-modal[open] input[autocomplete=new-password]', 'pass12345');
  await g.check('.sdt-modal[open] .auth-agree input');
  await expect(g.locator('.sdt-modal[open] #h-email')).toContainText('쓸 수 있는');
  await g.click('.sdt-modal[open] .auth-submit');
  await expect(g.locator('.sdt-modal[open]')).toHaveCount(0);
  await expect(g.locator('.save-btn')).toContainText('지갑에 있음');
  expect(g.url()).toContain(url);

  const { page: q, ctx: cq } = await newPerson(browser);
  await login(q, `w_${r}@example.com`);
  await q.goto('/');
  await expect(q.locator(`.tickets .ticket.is-mine[data-slug="${id}"]`)).toBeVisible();
  await expect(q.locator('.wallet-bar')).toHaveCount(0);

  await g.click('.save-btn');
  await expect(g.locator('.save-btn')).toContainText('탑승권 저장');
  await q.goto('/');
  await q.waitForTimeout(1500);
  await expect(q.locator(`.tickets .ticket.is-mine[data-slug="${id}"]`)).toHaveCount(0);
  await ctx.close();
  await cq.close();
});
