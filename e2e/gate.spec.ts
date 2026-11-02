// 탑승 수속: 링크로 처음 오면 탑승권 → 승객/기장 → 스텁 뜯고 입장
import { test, expect, createPlan, newPerson, boardAsGuest } from './fixtures';

test('승객: 처음엔 수속, 스텁을 잡아 뜯으면 입장, 다시 오면 바로', async ({ page, browser }) => {
  const { url } = await createPlan(page);
  const { page: g, ctx } = await newPerson(browser);
  await g.goto(url);
  await expect(g.locator('.boarding-gate h2')).toContainText('기장');
  await g.fill('[aria-label="승객 이름"]', '지민');
  await g.click('text=탑승권 받기');
  await expect(g.locator('.bg-pass')).toContainText('지민');
  // 조금만 당기면 제자리
  const box = (await g.locator('.boarding-gate .tk-stub').boundingBox())!;
  await g.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await g.mouse.down();
  await g.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 5);
  await g.mouse.up();
  await expect(g.locator('.boarding-gate')).toBeVisible();
  await g.waitForTimeout(500); // 제자리로 돌아가는 애니메이션(0.22초)이 끝난 뒤
  // 충분히 당기면 뜯긴다
  await g.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await g.mouse.down();
  for (let i = 1; i <= 8; i++) await g.mouse.move(box.x + box.width / 2 + i * 18, box.y + box.height / 2 + i * 10);
  await g.mouse.up();
  await expect(g.locator('.boarding-gate')).toHaveCount(0);
  await expect(g.locator('.role-bar.is-guest')).toContainText('PASSENGER');
  await g.reload();
  await expect(g.locator('.boarding-gate')).toBeHidden();
  await ctx.close();
});

test('기장: 수속에서 비밀번호 → 기장으로 입장 (틀리면 안내)', async ({ page, browser }) => {
  const { url } = await createPlan(page, { pw: 'captain1' });
  const { page: c, ctx } = await newPerson(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await c.goto(url);
  await c.fill('[aria-label="기장 비밀번호"]', 'wrong-pw');
  await c.click('text=기장 인증');
  await expect(c.locator('.boarding-gate .form-error')).toBeVisible();
  await c.fill('[aria-label="기장 비밀번호"]', 'captain1');
  await c.click('text=기장 인증');
  await expect(c.locator('.boarding-gate.is-ready')).toBeVisible();
  await c.click('text=뜯고 탑승하기');
  await expect(c.locator('.role-bar.is-owner')).toBeVisible();
  expect(await c.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await ctx.close();
});

test('홈에서 탑승권을 뜯고 오면 수속을 건너뛴다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.tickets .ticket .ticket-link').first().click();
  await page.waitForURL(/\/p\//);
  await expect(page.locator('.boarding-gate')).toBeHidden();
});

test('승객 탑승 직후 저장 권유는 계획마다 한 번', async ({ page, browser }) => {
  const { url } = await createPlan(page);
  const { page: g, ctx } = await newPerson(browser);
  await boardAsGuest(g, url, '손님');
  await expect(g.locator('.save-nudge')).toContainText('이 브라우저에만');
  await g.reload();
  await expect(g.locator('.save-nudge')).toHaveCount(0);
  await ctx.close();
});
