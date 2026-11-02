// e2e 공용 도우미: 장소 검색 고정 응답 · 계획 만들기 · 탑승 · 일정 추가 · 가입
import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';

type Hit = { name: string; en?: string; address?: string; country?: string; countryCode?: string; city?: string; lat: number; lng: number; kind: 'region' | 'poi'; source: string };
const region = (name: string, en: string, country: string, countryCode: string, lat: number, lng: number): Hit => ({ name, en, country, countryCode, lat, lng, kind: 'region', source: 'list' });
const poi = (name: string, en: string, lat: number, lng: number, address = ''): Hit => ({ name, en, address, lat, lng, kind: 'poi', source: 'osm' });

/** 외부 검색 대신 쓰는 고정 결과 (검색어 → 결과) */
export const PLACES: Record<string, Hit[]> = {
  도쿄: [region('도쿄', 'Tokyo', '일본', 'JP', 35.6812, 139.7671)],
  오사카: [region('오사카', 'Osaka', '일본', 'JP', 34.6937, 135.5023)],
  런던: [region('런던', 'London', '영국', 'GB', 51.5074, -0.1278)],
  후쿠오카: [region('후쿠오카', 'Fukuoka', '일본', 'JP', 33.5902, 130.4017)],
  리스본: [region('리스본', 'Lisbon', '포르투갈', 'PT', 38.7223, -9.1393)],
  강릉: [region('강릉', 'Gangneung', '대한민국', 'KR', 37.7519, 128.8761)],
  제주: [region('제주', 'Jeju', '대한민국', 'KR', 33.4996, 126.5312)],
  삿포로: [region('삿포로', 'Sapporo', '일본', 'JP', 43.0618, 141.3545)],
  센소지: [poi('센소지', 'Sensō-ji', 35.7148, 139.7967, '浅草, 다이토구, 도쿄도')],
  시부야: [poi('시부야 스크램블', 'Shibuya Crossing', 35.6595, 139.7005, '시부야구, 도쿄도')],
  츠키지: [poi('츠키지 장외시장', 'Tsukiji Outer Market', 35.6655, 139.7707, '주오구, 도쿄도')],
  하네다: [poi('하네다공항', 'Haneda Airport', 35.5494, 139.7798, '오타구, 도쿄도')],
  스카이트리: [poi('도쿄 스카이트리', 'Tokyo Skytree', 35.7101, 139.8107, '스미다구, 도쿄도')],
};

/** 페이지의 /api/places 요청을 고정 결과로 */
export async function stubPlaces(target: Page | BrowserContext) {
  await target.route('**/api/places?**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') || '';
    const key = Object.keys(PLACES).find((k) => q.includes(k));
    await route.fulfill({ json: { hits: key ? PLACES[key] : [] } });
  });
}

export const test = base.extend<{ stubbed: void }>({
  // 모든 테스트에서 검색을 고정한다 (새로 만드는 컨텍스트는 newPerson으로)
  stubbed: [
    async ({ context }, use) => {
      await stubPlaces(context);
      await use();
    },
    { auto: true },
  ],
  // 확인 창(confirm)은 자동으로 수락
  page: async ({ page }, use) => {
    page.on('dialog', (d) => d.accept());
    await use(page);
  },
});
export { expect };

export const uid = () => Math.random().toString(36).slice(2, 7);

/** 새 브라우저(다른 사람) — 검색 고정 · 확인 창 자동 수락 */
export async function newPerson(browser: import('@playwright/test').Browser, opts: Parameters<import('@playwright/test').Browser['newContext']>[0] = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR', timezoneId: 'Asia/Seoul', ...opts });
  await stubPlaces(ctx);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}

export const acceptDialogs = (page: Page) => page.on('dialog', (d) => d.accept());

/** 발권 흐름으로 계획 만들기. 로그인했으면 pw 없이 */
export async function createPlan(page: Page, { place = '도쿄', pw = 'test1234', owner = '기장', someday = true, travelers = 0 }: { place?: string; pw?: string | null; owner?: string; someday?: boolean; travelers?: number } = {}) {
  await page.goto('/new');
  await page.locator('.composer-form').waitFor();
  await page.fill('input[name=q]', place);
  await page.locator('.ac-list li[data-i]').first().waitFor();
  await page.keyboard.press('Enter');
  await page.locator('.dest-card:not([hidden])').waitFor();
  if (someday) await page.click('[data-when="someday"]');
  if (travelers) await page.click(`[data-qppl="${travelers}"]`);
  await page.click('.composer-actions [data-save]');
  await page.locator('.issue-modal[open]').waitFor();
  if (pw) {
    await page.fill('.issue-modal input[name=ownerName]', owner);
    await page.fill('.issue-modal input[name=pw]', pw);
  }
  await page.click('[data-issue]');
  await page.waitForURL(/\/p\/\w+\//, { timeout: 20_000 });
  await page.locator('.sdt-modal[open]').waitFor();
  await page.click('.sdt-modal[open] .sdt-modal-head button');
  const url = page.url().split('?')[0];
  return { url, id: url.split('/p/')[1].split('/')[0] };
}

/** 링크로 온 승객: 탑승 수속 → 스텁 뜯기 */
export async function boardAsGuest(page: Page, url: string, name?: string) {
  await page.goto(url);
  await page.locator('.boarding-gate .ticket').waitFor();
  if (name) await page.fill('[aria-label="승객 이름"]', name);
  await page.click('text=탑승권 받기');
  await page.click('text=뜯고 탑승하기');
  await page.locator('.boarding-gate').waitFor({ state: 'detached' });
}

/** 수속 없이 바로 들어가기 (홈에서 탑승권을 뜯고 온 것처럼) */
export async function skipGate(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    try {
      const m = location.pathname.match(/^\/p\/([^/]+)/);
      if (m) sessionStorage.setItem('sdt:tore', m[1]);
    } catch {}
  });
}

export async function setTime(page: Page, t: string) {
  const [h, m] = t.split(':');
  await page.selectOption('.sdt-modal[open] select[aria-label="시"]', h);
  await page.selectOption('.sdt-modal[open] select[aria-label="분"]', m);
}

/** 그날 일정 추가 (기장은 바로, 승객은 바구니로) */
export async function addItem(page: Page, { day = 1, title, time, place, memo }: { day?: number; title: string; time?: string; place?: string; memo?: string }) {
  await page.locator('.itin-day').nth(day - 1).locator('.itin-add').click();
  await page.locator('.sdt-modal[open] .item-form').waitFor();
  await page.locator('.sdt-modal[open] .item-form input.inp').first().fill(title);
  if (time) await setTime(page, time);
  if (place) {
    await page.fill('.sdt-modal[open] input[aria-label="장소 검색"]', place);
    await page.locator('.sdt-modal[open] .ac-list li[data-i]').first().click();
  }
  if (memo) await page.fill('.sdt-modal[open] [placeholder="예: 새벽 6시 반 출발"]', memo);
  await page.click('.sdt-modal[open] button[type=submit]');
  await page.locator('.sdt-modal[open] .item-form').waitFor({ state: 'detached' });
}

/** 바구니의 제안 보내기 */
export async function sendBasket(page: Page, message = '') {
  await page.click('.basket .btn--solid');
  await page.locator('.sdt-modal[open] .opcards').waitFor();
  if (message) await page.fill('.sdt-modal[open] textarea', message);
  await page.click('.sdt-modal[open] button[type=submit]');
  await page.locator('.basket').waitFor({ state: 'detached' });
}

export async function signup(page: Page, { email, nick, pw = 'pass12345' }: { email: string; nick: string; pw?: string }) {
  await page.goto('/signup');
  await page.fill('input[type=email]', email);
  await page.fill('input[autocomplete=nickname]', nick);
  await page.fill('input[autocomplete=new-password]', pw);
  await page.check('.auth-agree input');
  await expect(page.locator('#h-email')).toContainText('쓸 수 있는');
  await expect(page.locator('#h-nick')).toContainText('쓸 수 있는');
  await page.click('.auth-submit');
  await page.waitForURL(/\/account/);
}

export async function login(page: Page, email: string, pw = 'pass12345') {
  await page.goto('/login');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', pw);
  await page.click('.auth-submit');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** 페이지 오류 모으기 */
export function collectErrors(page: Page) {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));
  return errs;
}
