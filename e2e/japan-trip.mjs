// 최종 검사: 실제 여행 시간표(마크다운)를 사람처럼 화면에서 그대로 입력해 보고 합격 기준을 잰다.
// 시간표 파일에는 숙소 주소·전화 같은 개인정보가 있어서 저장소에 넣지 않는다 → 경로를 환경 변수로 받는다.
//   JAPAN_MD=/path/to/japan-trip.md BASE=http://localhost:3300 node e2e/japan-trip.mjs
// 실제 장소 검색을 쓰므로(외부 API) CI에서는 돌리지 않는다. 테스트 서버(DATABASE_URL 비움)에서만.
import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
const U = process.env.BASE || 'http://localhost:3300';
const MD = process.env.JAPAN_MD;
if (!MD || !fs.existsSync(MD)) {
  console.error('JAPAN_MD에 시간표 마크다운 경로를 주세요');
  process.exit(1);
}
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out') + '/';
fs.mkdirSync(OUT, { recursive: true });
const md = fs.readFileSync(MD, 'utf8');

/* ---------- 시간표 읽기 ---------- */
const sections = md.split(/\n# /);
const dayRows = [];
['12월 6일', '12월 7일', '12월 8일', '12월 9일', '12월 10일'].forEach((d, i) => {
  const sec = sections.find((s) => s.startsWith(d));
  const rows = sec.split('\n').filter((l) => l.startsWith('|') && !l.startsWith('| 시간') && !l.startsWith('| ---'));
  rows.forEach((l) => {
    const [t, title, info] = l.split('|').slice(1, 4).map((x) => x.trim());
    dayRows.push({ day: i + 1, t, title, info });
  });
});
const todo = sections.find((s) => s.startsWith('예약과 출발 전 할 일')).split('\n').filter((l) => l.startsWith('|') && !l.startsWith('| 시점') && !l.startsWith('| ---')).map((l) => l.split('|').slice(1, 3).map((x) => x.trim()));

const JP = {
  텐세이엔: '天成園', '하츠하나 소바': 'はつ花そば', 텐잔: '天山湯治郷', 타마다레: '玉簾の瀧', 다이토칸: '大東舘', 시라하타노유: '白旗の湯', 네츠노유: '熱乃湯',
  사이노카와라: '西の河原露天風呂', 오타키노유: '大滝乃湯', 유바타케: '湯畑', 고자노유: '御座之湯', 지조노유: '地蔵の湯', 고센지: '光泉寺', 치요노유: '千代の湯', 센소지: '浅草寺',
  스카이트리: '東京スカイツリー', 소라마치: '東京ソラマチ', 아키하바라: '秋葉原', '시부야 스카이': 'SHIBUYA SKY', 츠키지: '築地場外市場', 긴자: '銀座', 롯폰기힐스: '六本木ヒルズ',
  곤파치: '権八 西麻布', '도쿄 시티뷰': '東京シティビュー', 미드타운: '東京ミッドタウン', 케야키자카: 'けやき坂', 마루시마: '丸嶋本店', 마츠무라: '松村饅頭', 야스라기테이: '安らぎ亭',
  하네다: '羽田空港', 김포: '김포공항',
};
const kindOf = (r) => {
  const s = r.title;
  if (/→|출발|도착|이동|버스|BT/.test(s)) return 'move';
  if (/숙박|체크인|입실|체크아웃|짐 정리|짐 보관|짐 회수/.test(s)) return 'stay';
  if (/점심|저녁|뷔페|석식|아침|야식|만쥬|소바|에키벤/.test(s)) return 'eat';
  if (/쇼핑|아키하바라/.test(s)) return 'shop';
  return 'see';
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const P = await ctx.newPage();
const errs = [];
P.on('pageerror', (e) => errs.push(e.message));
P.on('dialog', (d) => d.accept());
const log = { steps: {}, rows: [], findings: [], latency: [] };
const note = (f) => (log.findings.push(f), console.log('  ⚑', f));
let acts = 0;
const click = async (sel, o) => (acts++, P.click(sel, o));
const fill = async (sel, v) => (acts++, P.fill(sel, v));
const select = async (sel, v) => (acts++, P.selectOption(sel, v));

/* ---------- 1. 계획 만들기 ---------- */
let t0 = Date.now();
await P.goto(U + '/new'); await P.waitForSelector('.composer-form'); await P.waitForTimeout(800);
// 사용자는 여러 도시 여행이라 목적지에서 망설인다: 하코네로 먼저 찾아본다
await fill('input[name=q]', '하코네'); await P.waitForTimeout(1500);
const hakone = await P.$$eval('.ac-list li[data-i]', (e) => e.map((x) => x.textContent.trim().slice(0, 30))).catch(() => []);
log.steps.destHakone = hakone.slice(0, 3);
await fill('input[name=q]', '쿠사츠'); await P.waitForTimeout(2500);
log.steps.destKusatsu = await P.$$eval('.ac-list li[data-i]', (e) => e.map((x) => x.textContent.trim().slice(0, 30))).catch(() => []);
await fill('input[name=q]', '도쿄'); await P.waitForFunction(() => [...document.querySelectorAll('.ac-list li[data-i]')].some((x) => x.textContent.includes('도쿄')), null, { timeout: 10000 });
await click('.ac-list li[data-i] >> nth=0');
await P.waitForSelector('.dc-air [data-air="HND"]'); await click('.dc-air [data-air="HND"]');
await fill('input[name=title]', '하코네·쿠사츠·도쿄 4박 5일');
await click('[data-when="date"]'); await P.waitForSelector('.cal [data-d]');
let navs = 0;
while (!(await P.$('.cal [data-d="2026-12-06"]')) && navs < 6) { await click('.cal [data-nav="1"]'); navs++; }
await click('.cal [data-d="2026-12-06"]'); await click('.cal [data-d="2026-12-10"]');
log.steps.calendarNavClicks = navs;
log.steps.calSummary = (await P.textContent('.cal-sum')).replace(/\s+/g, ' ').trim();
await click('[data-qppl="2"]');
log.steps.statusChoices = await P.$$eval('[data-step="when"] .status-seg [data-status]', (e) => e.map((x) => x.textContent)).catch(() => []);
log.steps.statusVisible = await P.isVisible('[data-step="when"] .status-seg');
await click('.composer-actions [data-save]'); await P.waitForSelector('.issue-modal[open]');
await fill('.issue-modal input[name=ownerName]', '문'); await fill('.issue-modal input[name=pw]', 'japan2026');
await click('[data-issue]'); await P.waitForURL(/\/p\/\w+\//, { timeout: 20000 });
await P.waitForSelector('.sdt-modal[open]'); await click('.sdt-modal[open] .sdt-modal-head button');
const planUrl = P.url().split('?')[0]; const pid = planUrl.split('/p/')[1].split('/')[0];
log.steps.create = { acts, sec: Math.round((Date.now() - t0) / 1000), status: (await P.textContent('.ticket--big .tk-chip')).trim() };
console.log('plan', planUrl, log.steps.create);

/* ---------- 2. 일정 87줄 ---------- */
let searches = 0, lastSearch = 0;
const searchPlace = async (q) => {
  // 장소 검색은 IP당 1분 40회 제한 → 사람 속도(1.6초 간격)로
  const wait = 1600 - (Date.now() - lastSearch); if (wait > 0) await P.waitForTimeout(wait);
  lastSearch = Date.now(); searches++;
  const q0 = Date.now();
  await fill('.sdt-modal[open] input[aria-label="장소 검색"]', q);
  // 진짜 결과 줄(data-i)이 오거나 "찾지 못했어요"가 뜰 때까지 (찾는 중… 안내는 결과가 아니다)
  const done = await P.waitForFunction(() => {
    const list = document.querySelector('.sdt-modal[open] .ac-list');
    if (!list) return false;
    if (list.querySelector('li[data-i]')) return 'hits';
    const msg = list.querySelector('.ac-msg')?.textContent || '';
    return msg && !/찾는 중/.test(msg) ? 'none' : false;
  }, null, { timeout: 12000 }).then((h) => h.jsonValue()).catch(() => null);
  log.latency.push([q, done ? Date.now() - q0 : null]);
  if (done !== 'hits') return null;
  return P.$$eval('.sdt-modal[open] .ac-list li[data-i]', (e) => e.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
};
// 같은 날 다음 줄은 "저장하고 다음 일정"(Ctrl+Enter)으로 창을 닫지 않고 이어서 적는다 (사람이 가장 빠르게 넣는 방법)
const KIND_LABEL = { eat: '먹기', cafe: '카페', shop: '쇼핑', move: '이동', stay: '숙소', etc: '기타' };
const TAG_OF = (q) => (/희망/.test(q) ? '희망' : /선택/.test(q) ? '선택' : '');
let open = false;
for (const [n, r] of dayRows.entries()) {
  const a0 = acts; const s0 = Date.now(); const out = { n: n + 1, day: r.day, t: r.t, title: r.title };
  const last = !dayRows[n + 1] || dayRows[n + 1].day !== r.day;
  if (!open) {
    await click(`.itin-day >> nth=${r.day - 1} >> .itin-add`);
    await P.waitForSelector('.sdt-modal[open] .item-form');
  }
  // 시각은 이름 앞에 적으면 시간 칸으로 들어간다 ("13:07 → 15:26 특급", "16:40~17:30 노천탕")
  const tm = r.t.match(/^(\d{2}:\d{2})(?:\s*(?:→|~|–|-)\s*(\d{2}:\d{2}))?/);
  const prefix = tm ? `${tm[1]}${tm[2] ? `-${tm[2]}` : ''} ` : '';
  await fill('.sdt-modal[open] .item-form input.inp >> nth=0', (prefix + r.title).slice(0, 80));
  if (tm) { out.time = tm[1]; if (tm[2]) out.end = tm[2]; }
  const kind = kindOf(r);
  // 일정 창이 이름으로 종류를 짐작한다 → 다를 때만 직접 고른다
  await P.waitForTimeout(150);
  const guessed = await P.$eval('.sdt-modal[open] [aria-label="종류"] [role=radio][aria-checked="true"]', (e) => e.textContent.trim()).catch(() => '');
  const want = kind === 'see' ? '구경' : KIND_LABEL[kind];
  if (!guessed.includes(want)) { await click(`.sdt-modal[open] [aria-label="종류"] [role=radio]:has-text("${want}")`); out.kindClick = true; }
  out.kind = kind;
  const qualifier = r.t.replace(/^\d{2}:\d{2}(\s*(→|~|–|-)\s*\d{2}:\d{2})?/, '').trim();
  const tag = TAG_OF(qualifier);
  if (tag) { await click(`.sdt-modal[open] [aria-label="상태"] [role=radio]:has-text("${tag}")`); out.tag = tag; }
  // 장소: 이동 구간은 장소 없이, 그 밖은 한글 이름으로 검색 (안 나오면 넘어간다: 사람은 일본어 이름을 모른다)
  if (kind !== 'move' || /하네다|김포/.test(r.title)) {
    const key = Object.keys(JP).find((k) => r.title.includes(k));
    const ko = key || r.title.replace(/^(점심|저녁|숙박|아침)\s*·?\s*/, '').split(/[·(]/)[0].trim();
    out.placeKo = ko;
    // 이름으로 찾은 추천이 찾던 곳이면 한 번 눌러 고른다 (이름이 맞을 때만: 사람은 엉뚱한 추천을 고르지 않는다)
    const sug = await P.waitForSelector('.sdt-modal[open] .place-suggest', { timeout: 4500 }).then((e) => e.textContent()).catch(() => null);
    if (sug && (sug.includes(ko) || (key && sug.includes(key)))) {
      await click('.sdt-modal[open] .place-suggest'); out.placeHit = sug.slice(0, 40); out.viaSuggest = true;
    }
    const hits = out.viaSuggest ? null : await searchPlace(ko); out.placeKoOk = !!hits || !!out.viaSuggest;
    if (hits) {
      await click('.sdt-modal[open] .ac-list li[data-i] >> nth=0');
      // 여행지에서 먼 곳이라고 확인하면 사람은 다시 찾는다 (엉뚱한 곳을 받아들이지 않는다)
      if (await P.isVisible('.sdt-modal[open] .far-warn').catch(() => false)) { out.farWarn = true; await click('.sdt-modal[open] .far-warn >> text=다시 찾기'); }
      else out.placeHit = hits[0].slice(0, 40);
    }
  }
  const yen = [...r.info.matchAll(/¥([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  // 한 줄에 엔화 금액이 하나면 비용 칸에 (계획 통화가 엔이라 기본이 엔), 여러 개면 메모에만
  if (yen.length === 1) { await fill('.sdt-modal[open] [aria-label="예상 비용"]', String(yen[0])); out.cost = yen[0]; }
  else if (yen.length) out.yenInMemo = yen.length;
  const memo = [qualifier, r.info].filter(Boolean).join(' · ');
  out.memoLen = memo.length;
  await fill('.sdt-modal[open] [placeholder="예: 새벽 6시 반 출발"]', memo.slice(0, 400));
  if (await P.isVisible('.sdt-modal[open] .ac-list li').catch(() => false)) out.listCovered = true; // 이제는 저장을 막지 않아야 한다
  if (last) {
    await click('.sdt-modal[open] button[type=submit]');
    await P.waitForSelector('.sdt-modal[open] .item-form', { state: 'detached', timeout: 10000 }).catch(() => (out.saveFail = true));
    open = false;
  } else {
    acts++; await P.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    open = true;
  }
  await P.waitForFunction((k) => document.querySelectorAll('.itinerary .route-item:not(.is-ghost)').length >= k, n + 1, { timeout: 10000 }).catch(() => (out.renderFail = true));
  if (open) await P.waitForFunction(() => !document.querySelector('.sdt-modal[open] .item-form input.inp')?.value, null, { timeout: 5000 }).catch(() => (out.nextFail = true));
  out.acts = acts - a0; out.sec = +((Date.now() - s0) / 1000).toFixed(1);
  log.rows.push(out);
  if ((n + 1) % 10 === 0) console.log(`  ${n + 1}/${dayRows.length} 줄 · 검색 ${searches}회`);
}

/* ---------- 3. 화면 결과 ---------- */
await P.reload(); await P.waitForSelector('.itinerary .route-item'); await P.waitForTimeout(1500);
log.result = await P.evaluate(() => {
  const days = [...document.querySelectorAll('.itin-day')].map((d) => ({
    head: d.querySelector('.itin-day-head')?.textContent.replace(/\s+/g, ' ').trim(),
    n: d.querySelectorAll('.route-item').length,
    timeSortBtn: !!d.querySelector('.time-sort'),
    first: [...d.querySelectorAll('.route-item .ri-title strong')].slice(0, 4).map((x) => x.textContent.trim()),
  }));
  return { days, pins: document.querySelectorAll('.route-map .leaflet-marker-icon').length, totalKm: document.querySelector('.route-km')?.textContent };
});
// 시각이 화면에 그대로 나오는지 (13:07 → 15:26처럼 끝 시각까지)
const shown = await P.$$eval('.itinerary .route-item:not(.is-ghost)', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')));
log.timeMismatch = log.rows.filter((r) => r.time && !shown.some((t) => t.includes(r.time) && (!r.end || t.includes(r.end)) && t.includes(r.title.slice(0, 6)))).map((r) => `${r.time}${r.end ? '–' + r.end : ''} ${r.title.slice(0, 12)}`);
await P.screenshot({ path: OUT + 'plan-full.png', fullPage: true });
const it = await P.$('#itinerary'); await it.screenshot({ path: OUT + 'itinerary.png' });

/* ---------- 4. 체크리스트 (할 일 표 18줄) ---------- */
t0 = Date.now(); let a1 = acts;
await P.locator('.prep-check').scrollIntoViewIfNeeded();
let ckLong = 0;
for (const [when, what] of todo) {
  const text = `${when} ${what}`; if (text.length > 80) ckLong++;
  await fill('.ck-add input', text.slice(0, 80)); await P.keyboard.press('Enter'); acts++;
  await P.waitForTimeout(900);
}
log.steps.checklist = { items: todo.length, over80: ckLong, acts: acts - a1, sec: Math.round((Date.now() - t0) / 1000), rendered: (await P.$$('.checklist li')).length };

/* ---------- 5. 예산 (원화만) · 소개 ---------- */
a1 = acts;
await click('[data-task=budget]'); await P.waitForSelector('.sdt-modal[open] .pf-ppl');
log.steps.budgetCurrency = (await P.textContent('.sdt-modal[open] .pf-row .money span').catch(() => '')) || (await P.textContent('.sdt-modal[open]')).includes('원') ? '원 고정' : '?';
await click('.sdt-modal[open] .chip:has-text("교통")'); await fill('.pf-row >> nth=0 >> input.num', '165000'); // ¥17,751 ≈ 16.5만 원 (사용자가 직접 환산)
await click('.sdt-modal[open] .btn--solid'); await P.waitForTimeout(1500);
await click('[data-task=why]'); await P.waitForSelector('.sdt-modal[open] .pf-form');
await fill('.sdt-modal[open] input.inp', '하코네 온천에서 시작해 쿠사츠 유모미를 보고, 도쿄 겨울 야경으로 마무리');
const intro = sections.find((s) => s.startsWith('숙박')).slice(0, 6000);
await fill('.sdt-modal[open] textarea', intro);
await click('.sdt-modal[open] .btn--solid'); await P.waitForTimeout(1500);
log.steps.budgetIntro = { acts: acts - a1, introLen: intro.length };

/* ---------- 6. 참고 링크 (고치기 화면) ---------- */
a1 = acts;
const links = [...md.matchAll(/\]\((https?:[^)]+)\)/g)].map((m) => m[1]);
await P.goto(U + `/p/${pid}/edit`); await P.waitForSelector('.composer-form'); await P.waitForTimeout(800);
const linkVisible = await P.isVisible('input[name=linkIn]');
if (linkVisible) { for (const l of links) { await fill('input[name=linkIn]', l); await P.keyboard.press('Enter'); acts++; await P.waitForTimeout(200); } await click('.composer-actions [data-save]'); await P.waitForURL(new RegExp(`/p/${pid}/`), { timeout: 15000 }); }
log.steps.links = { found: links.length, editorVisible: linkVisible, acts: acts - a1 };
await P.waitForTimeout(1500);
log.steps.linkChips = await P.$$eval('.plan-links .pl-chip, .plan-links a', (e) => e.length).catch(() => 0);

/* ---------- 7. 모바일 ---------- */
const M = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })).newPage();
await M.goto(planUrl); await M.waitForTimeout(2500);
log.steps.mobile = { height: await M.evaluate(() => document.documentElement.scrollHeight), itinerary: await M.evaluate(() => document.querySelector('#itinerary')?.offsetHeight || 0), overflow: await M.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
await M.screenshot({ path: OUT + 'mobile.png', fullPage: false });
await (await M.$('.itin-day >> nth=1')).screenshot({ path: OUT + 'mobile-day2.png' });

log.errors = errs; log.searches = searches; log.planUrl = planUrl; log.totalActs = acts;
fs.writeFileSync(OUT + 'result.json', JSON.stringify(log, null, 1));

/* ---------- 합격 기준 ---------- */
const rowsN = log.rows.length;
const perRow = log.rows.reduce((s, r) => s + r.acts, 0) / rowsN;
const covered = log.rows.filter((r) => r.listCovered).length;
const lost = log.timeMismatch || [];
const km = Number(String(log.result.totalKm || '0').replace(/[^\d.]/g, ''));
const card = [
  ['줄당 조작 수', perRow.toFixed(1), perRow <= 4],
  ['저장 버튼이 막힌 횟수', log.rows.filter((r) => r.saveFail || r.renderFail || r.nextFail).length, log.rows.every((r) => !r.saveFail && !r.renderFail && !r.nextFail)],
  ['화면에 틀리게 나온 시각', lost.length ? lost.slice(0, 5).join(', ') + (lost.length > 5 ? ` 외 ${lost.length - 5}` : '') : 0, lost.length === 0],
  ['총 이동 거리(km)', km, km > 0 && km < 1500],
  // 처음 측정: 페이지 24,811px 중 일정 영역 약 15,960px(나머지 소개·체크리스트 등 약 8,850px) → 목표는 일정 영역 1/3 이하
  ['모바일 일정 영역 높이(px)', `${log.steps.mobile.itinerary} (페이지 ${log.steps.mobile.height})`, log.steps.mobile.itinerary > 0 && log.steps.mobile.itinerary <= 5320],
  ['모바일 가로 넘침', log.steps.mobile.overflow ? '있음' : '없음', !log.steps.mobile.overflow],
  ['페이지 오류', errs.length, errs.length === 0],
];
console.log('\n합격 기준');
for (const [k, v, ok] of card) console.log(`  ${ok ? '✓' : '✘'} ${k}: ${v}`);
console.log(`\n총 조작 ${acts} · 검색 ${searches} · 결과 ${OUT}result.json`);
await browser.close();
process.exit(card.every((c) => c[2]) ? 0 : 1);
