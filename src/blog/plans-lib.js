// moon.log의 lib/plans.js에서 옮겨 온 계획 계산 도구 (서버·브라우저 공용, DOM 없음)
// 섬데트에서 바뀐 점
//  - 계획의 "가 볼 곳(stops)"은 협업 일정(items)에서 만든다 → toView()
//  - D-day는 늘 서울 날짜 기준 (서버는 UTC라서)
//  - 위조방지 무늬는 /art/g/<seed>.svg 주소의 그림을 마스크로 쓴다 (페이지에 수십 KB씩 넣지 않게)
import { rng, haversine, hashStr, seoulToday } from './util.js';

export const HOME = { city: '서울', code: 'SEL', coords: [37.5665, 126.978], tz: 'Asia/Seoul' };

export const STATUS = {
  booked: { ko: '예약 완료', en: 'CONFIRMED', flap: '예약완료', order: 0 },
  preparing: { ko: '준비 중', en: 'PREPARING', flap: '준비중', order: 1 },
  planning: { ko: '계획 중', en: 'PLANNING', flap: '계획중', order: 2 },
  dream: { ko: '언젠가', en: 'SOMEDAY', flap: '언젠가', order: 3 },
  done: { ko: '다녀옴', en: 'ARRIVED', flap: '도착', order: 4 },
};

export const SCOPE = {
  abroad: { ko: '해외', icon: '✈️' },
  domestic: { ko: '국내', icon: '🚄' },
  local: { ko: '동네', icon: '🏘️' },
};

/** 화면용 계획: 저장된 계획 + 일정에서 만든 stops + 주소 */
export function toView(plan, items = []) {
  const sorted = [...items].sort((a, b) => (a.day ?? 999) - (b.day ?? 999) || a.order - b.order);
  return {
    ...plan,
    slug: plan.id,
    href: `/p/${plan.id}/${plan.slug}`,
    items: sorted,
    stops: sorted.filter((i) => i.place).map((i) => ({ id: i.id, name: i.title, en: i.en || i.place.en || '', coords: [i.place.lat, i.place.lng], note: i.memo, day: i.day })),
  };
}

export const totalBudget = (p) => Object.values(p.budget || {}).reduce((s, v) => s + Number(v || 0), 0);

/** 인원 모두의 전체 예산 (다 같이 내는 항목은 그대로, 1인당 항목은 인원만큼) */
export function groupBudget(p) {
  const n = Math.max(1, p.travelers || 1);
  if (!Array.isArray(p.budgetItems) || !p.budgetItems.length) return totalBudget(p) * n;
  return p.budgetItems.reduce((s, b) => s + (b.per === 'group' ? b.amount : b.amount * n), 0);
}

export function planCenter(p) {
  if (p.coords) return p.coords;
  if (!p.stops?.length) return HOME.coords;
  const n = p.stops.length;
  return [p.stops.reduce((s, x) => s + x.coords[0], 0) / n, p.stops.reduce((s, x) => s + x.coords[1], 0) / n];
}

/** 서울에서의 대권 거리와 대략의 비행시간 (순항 820km/h + 이착륙 40분) */
export function flight(p) {
  const km = haversine(HOME.coords, planCenter(p));
  const hours = km / 820 + 0.66;
  const mins = Math.max(30, Math.round(hours * 6) * 10);
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return { km, hours, label: hh ? `약 ${hh}시간${mm ? ` ${mm}분` : ''}` : `약 ${mm}분` };
}

/** 탑승권 넷째 칸: 해외는 비행시간, 국내는 거리, 동네는 그냥 동네 */
export const hasPlace = (p) => !!(p.coords || p.stops?.length);

export function travelField(p) {
  if (p.scope === 'local') return { dt: '여행', dd: '동네 한 바퀴' };
  if (!hasPlace(p)) return { dt: p.scope === 'domestic' ? '거리' : '비행', dd: '—' };
  const f = flight(p);
  if (p.scope === 'domestic') return { dt: '거리', dd: `${Math.round(f.km)}km` };
  return { dt: '비행', dd: f.label };
}

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000;
export function daysUntil(target) {
  if (!target) return null;
  return Math.round(dayNum(target) - dayNum(seoulToday()));
}

/** 국가 코드 → 국기 이모지 */
export const flagOf = (cc = '') =>
  cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🏳️';

export const nights = (d) => (d > 1 ? `${d - 1}박 ${d}일` : '당일');

export function sortPlans(list, mode = 'status') {
  const when = (p) => p.target || '9999';
  const by = {
    status: (a, b) => STATUS[a.status].order - STATUS[b.status].order || when(a).localeCompare(when(b)) || (a.priority ?? 99) - (b.priority ?? 99),
    priority: (a, b) => (a.priority ?? 99) - (b.priority ?? 99),
    soon: (a, b) => when(a).localeCompare(when(b)) || (a.priority ?? 99) - (b.priority ?? 99),
    budget: (a, b) => totalBudget(a) - totalBudget(b),
    distance: (a, b) => flight(a).km - flight(b).km,
    recent: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  };
  return [...list].sort(by[mode] || by.status);
}

/* ---------- "시간 났다!" 적합도 ---------- */
const monthGap = (months, m) => Math.min(...months.map((x) => Math.min(Math.abs(x - m), 12 - Math.abs(x - m))));

export function fitScore(p, { days, month, budget }) {
  const total = totalBudget(p);
  const dayFit = p.days <= days ? 1 : Math.max(0, 1 - (p.days - days) / p.days);
  const gap = p.months?.length ? monthGap(p.months, month) : 0;
  const monthFit = gap === 0 ? 1 : gap === 1 ? 0.5 : 0;
  const budgetFit = total <= budget ? 1 : Math.max(0, 1 - (total - budget) / total);
  const score = Math.round((dayFit * 0.4 + monthFit * 0.35 + budgetFit * 0.25) * 100);
  const missing = [];
  if (dayFit < 1) missing.push(`+${p.days - days}일`);
  if (monthFit < 1) missing.push(`${p.months.slice(0, 3).join('·')}월이 좋아요`);
  if (budgetFit < 1) missing.push(`+${Math.ceil((total - budget) / 10000)}만 원`);
  return { score, fit: dayFit === 1 && monthFit === 1 && budgetFit === 1, missing };
}

/* ---------- 동선 최적화: 최근접 이웃으로 시작해 2-opt로 다듬기 ---------- */
export const routeKm = (stops) => stops.slice(1).reduce((s, x, i) => s + haversine(stops[i].coords, x.coords), 0);

export function optimizeRoute(stops) {
  if (stops.length < 3) return [...stops];
  const rest = stops.slice(1);
  const route = [stops[0]];
  while (rest.length) {
    const last = route[route.length - 1];
    let bi = 0;
    rest.forEach((s, i) => {
      if (haversine(last.coords, s.coords) < haversine(last.coords, rest[bi].coords)) bi = i;
    });
    route.push(rest.splice(bi, 1)[0]);
  }
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const cand = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        if (routeKm(cand) < routeKm(route) - 0.01) {
          route.splice(0, route.length, ...cand);
          improved = true;
        }
      }
    }
  }
  return route;
}

/* ---------- 준비 상태 (체크리스트는 계획에 저장되고, 기장이 체크한다) ---------- */
export function readiness(p) {
  const list = p.checklist || [];
  const done = list.filter(([, d]) => d).length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

export function regionEn(cc) {
  try {
    return cc ? new Intl.DisplayNames('en', { type: 'region' }).of(cc.toUpperCase()) : '';
  } catch {
    return '';
  }
}

/* ---------- 탑승권 장식 ---------- */
/** 지폐·여권의 위조방지 무늬 같은 하이포트로코이드 곡선 SVG 원문 */
export function guillocheSvg(seed, w = 400, h = 220) {
  const r = rng('g' + seed);
  const cx = w * r.range(0.55, 0.8);
  const cy = h * r.range(0.35, 0.65);
  let paths = '';
  for (let k = 0; k < 4; k++) {
    const R = r.range(70, 130);
    const rr = r.range(9, 31);
    const d = r.range(25, 70);
    const steps = 480;
    const turns = Math.ceil(rr) * 2;
    let p = '';
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * turns;
      const x = cx + (R - rr) * Math.cos(t) + d * Math.cos(((R - rr) / rr) * t);
      const y = cy + ((R - rr) * Math.sin(t) - d * Math.sin(((R - rr) / rr) * t)) * 0.62;
      p += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    paths += `<path d="${p}" stroke-opacity="${(0.55 - k * 0.1).toFixed(2)}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="800" height="440" preserveAspectRatio="xMidYMid slice"><g fill="none" stroke="#000" stroke-width=".5">${paths}</g></svg>`;
}
const safeSeed = (s) => encodeURIComponent(String(s));
export const guilloche = (seed) => `<span class="guilloche" data-baked="1" style="--g:url(/art/g/${safeSeed(seed)}.svg)" aria-hidden="true"></span>`;

/** 장식용 바코드 */
export function barcode(seed, w = 120, h = 34) {
  let x = 0;
  let bars = '';
  let n = hashStr(seed);
  const r = rng(seed);
  while (x < w) {
    const bw = 1 + (n & 3);
    n = n >>> 2 || hashStr(seed + x);
    if (r() > 0.42) bars += `<rect x="${x}" width="${bw * 0.9}" height="${h}"/>`;
    x += bw + 1;
  }
  return `<svg class="barcode" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><g fill="currentColor">${bars}</g></svg>`;
}

/** 항로 곡선 (탑승권 위 SEL → 목적지) */
export const ARC_PATH = 'M14 46 C 60 -6, 140 -6, 186 46';
export const PLANE = 'M8 0 L2 -1.2 L-2 -7 L-4 -7 L-2.2 -1.2 L-6 -1 L-7.6 -3 L-8.6 -3 L-7.8 0 L-8.6 3 L-7.6 3 L-6 1 L-2.2 1.2 L-4 7 L-2 7 L2 1.2 Z';

// 국내는 기차, 동네는 걷는 사람 (비행기와 같은 -10..10 좌표)
export const TRAIN = 'M-6.5 -5.5 H6.5 A3.5 3.5 0 0 1 10 -2 V3 A2 2 0 0 1 8 5 H-8 A2 2 0 0 1 -10 3 V-2 A3.5 3.5 0 0 1 -6.5 -5.5 Z M-7.5 -2.8 V0.6 H-2.2 V-2.8 Z M-0.9 -2.8 V0.6 H4.4 V-2.8 Z M5.7 -2.8 V0.6 H8.3 V-1.4 A1.4 1.4 0 0 0 6.9 -2.8 Z M-6 6.2 A1.6 1.6 0 1 0 -6 6.21 Z M6 6.2 A1.6 1.6 0 1 0 6 6.21 Z';
export const WALK = 'M1.2 -9.5 A2.2 2.2 0 1 1 1.21 -9.5 Z M-0.6 -5.6 L2.6 -5.3 L4.6 -1.4 L7 0 L6.2 1.4 L3.2 -0.2 L2.4 -2 L1.6 1.6 L4.4 5 L4.8 9.6 L3 9.8 L2.6 5.8 L0 3 L-1.6 6.4 L-4.6 9.4 L-5.8 8.2 L-3.2 5.4 L-1.4 0.4 L-0.6 -3 L-2.4 -1.8 L-3.4 1.4 L-5 1 L-3.8 -3 Z';

/** 여행 종류별 표: 이름 · 출발 · 도착 코드 · 아이콘 */
export function ticketKind(p) {
  const en3 = (p.placeEn || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
  if (p.scope === 'local') return { brand: 'SOMEDAY WALK · DAY PASS', from: ['HERE', '여기서'], to: p.iata || en3 || 'LCL', icon: WALK, upright: true };
  if (p.scope === 'domestic') return { brand: 'SOMEDAY RAIL · TRAIN TICKET', from: ['SEL', '서울'], to: p.iata || en3 || 'DOM', icon: TRAIN, upright: true };
  return { brand: 'SOMEDAY AIR · BOARDING PASS', from: ['SEL', '서울'], to: p.iata || '???', icon: PLANE, upright: false };
}

export const sceneUrl = (p) => `/art/scene/${p.cover?.scene || 'mountain'}/${p.cover?.time || 'day'}/${safeSeed(p.id || p.slug)}.svg`;
