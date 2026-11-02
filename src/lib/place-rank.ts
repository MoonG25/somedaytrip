// 장소 검색 결과를 합치고 고르는 순수 함수들 (외부 API를 부르지 않는다)
//  - 거리: 기준 지점에서 가까운 순, 같은 거리권이면 들어온 순서(카카오 → Nominatim → Photon)
//  - 일본 명소 한글 사전 조회 (띄어쓰기·'온천'·'절' 같은 꼬리말은 무시)
import { JP_AREAS, JP_PLACES, type JpPlace } from '@/data/jp-ko';

export type Hit = {
  name: string;
  en?: string;
  address?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  lat: number;
  lng: number;
  kind: 'region' | 'poi';
  source: 'kakao' | 'photon' | 'osm' | 'list';
};

export type Near = { lat: number; lng: number };

/** 두 지점 사이 거리 (km, 대원 거리) */
export function km(a: Near, b: Near) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 이보다 멀면 "엉뚱한 곳"으로 본다 (poi 검색) */
export const FAR_KM = 1500;
// 기준 지점 100km 안에 결과가 있으면 800km 밖(바다 건너 다른 나라)도 뺀다. 도쿄 계획의 "뷔페" → 한국 식당 같은 것
const NEAR_KM = 100;
const ABROAD_KM = 800;

/** 대략 한국 땅 안인가 (쓰시마·규슈는 뺀다) */
export function inKorea(p: Near) {
  if (p.lat >= 37.4 && p.lat <= 37.6 && p.lng >= 130.7 && p.lng <= 131.95) return true; // 울릉도·독도
  return p.lat >= 33 && p.lat <= 38.7 && p.lng >= 124.5 && p.lng <= 129.6 && !(p.lat < 34.8 && p.lng > 129.1);
}
// 해외 계획에서도 남기는 한국 장소: 출국·귀국 길의 공항·항구·역
const HUB = /공항|항구|여객터미널|국제여객|airport|ferry|역$|station/i;
const korean = (h: Hit) => h.countryCode === 'KR' || (!h.countryCode && inKorea(h));

// 같은 거리권 (이 안에서는 품질 순서를 지킨다)
const BANDS = [1, 5, 20, 80, 300, FAR_KM];
const band = (d: number) => {
  const i = BANDS.findIndex((b) => d <= b);
  return i < 0 ? BANDS.length : i;
};

/** 여러 곳의 결과를 순서대로 합친다. 가까운 같은 곳은 하나로 (한국어 이름·영문 이름을 합친다) */
export function mergeHits(list: Hit[], mode: 'poi' | 'dest') {
  const out: Hit[] = [];
  for (const h of list) {
    if (mode === 'dest' && h.kind !== 'region' && h.source !== 'kakao' && h.source !== 'list') continue;
    const same = out.find((x) => km(x, h) < (h.kind === 'region' ? 8 : 0.15) || (x.name === h.name && km(x, h) < 2));
    if (same) {
      same.en ||= h.en || (h.source === 'photon' && /^[\x00-\x7FÀ-ɏ\s'.-]+$/.test(h.name) ? h.name : undefined);
      same.countryCode ||= h.countryCode;
      same.country ||= h.country;
      continue;
    }
    out.push({ ...h });
  }
  return out;
}

/**
 * 기준 지점이 있으면 거리권 순으로 다시 늘어놓는다 (같은 거리권은 원래 순서).
 * 앞의 pinned개(사전에서 찾은 명소)는 맨 앞에 그대로 둔다.
 * poi 검색에서 1,500km 넘게 떨어진 결과는 가까운 결과가 하나라도 있으면 뺀다. 먼 것만 있으면 빈 결과 + far.
 * 100km 안에 결과가 있으면 800km 밖도 뺀다. 기준 지점이 해외면 한국 결과는 공항·항구·역만 남긴다.
 */
export function rankHits(hits: Hit[], near: Near | undefined, mode: 'poi' | 'dest', pinned = 0): { hits: Hit[]; far: boolean } {
  if (!near) return { hits, far: false };
  const head = hits.slice(0, pinned);
  const rest = hits
    .slice(pinned)
    .map((h, i) => ({ h, i, d: km(near, h) }))
    .sort((a, b) => band(a.d) - band(b.d) || a.i - b.i);
  if (mode === 'dest') return { hits: [...head, ...rest.map((x) => x.h)], far: false };
  const limit = rest.some((x) => x.d <= NEAR_KM) ? ABROAD_KM : FAR_KM;
  // 해외 계획이면 한국 가게·동네는 뺀다 (도쿄 계획의 "야식" → 천안 치킨집). 공항·항구·역은 남긴다 ("김포" → 김포공항)
  const abroad = !inKorea(near);
  const close = rest.filter((x) => x.d <= limit && !(abroad && korean(x.h) && !HUB.test(`${x.h.name} ${x.h.en || ''}`)));
  if (!close.length && rest.length && !head.length) return { hits: [], far: true };
  return { hits: [...head, ...close.map((x) => x.h)], far: false };
}

/** 사전 비교용: 소문자, 띄어쓰기·기호 빼기, '쓰'·'쯔' → '츠' */
export function normKo(s: string) {
  return s
    .toLowerCase()
    .replace(/[\s·・\-_.,'"()（）]/g, '')
    .replace(/[쓰쯔]/g, '츠');
}
// 붙여 쳐도 같은 곳으로 보는 꼬리말
const TAIL = /(온천|온센|노천온천|노천탕|절|사원)$/;
const stripTail = (s: string) => {
  const t = s.replace(TAIL, '');
  return t.length >= 2 ? t : s;
};

// 사전 키 (한 번만 만든다)
let KEYS: { key: string; p: JpPlace }[] | null = null;
const keys = () =>
  (KEYS ||= JP_PLACES.flatMap((p) => [p.ko, ...(p.alias || [])].map((a) => ({ key: stripTail(normKo(a)), p }))));

/**
 * 한글 검색어로 일본 명소 찾기. 정확히 같은 이름이 먼저, 없으면 앞글자 (후보가 너무 많으면 안 고른다).
 * "아키하바라역"처럼 끝에 역·거리를 붙여 쳐도 찾는다.
 */
export function lookupJp(q: string, max = 2): JpPlace[] {
  const s = stripTail(normKo(q));
  if (s.length < 2 || !/[가-힣]/.test(s)) return [];
  const uniq = (l: JpPlace[]) => [...new Set(l)];
  const exact = uniq(keys().filter((k) => k.key === s).map((k) => k.p));
  if (exact.length) return exact.slice(0, max);
  const pre = uniq(keys().filter((k) => k.key.startsWith(s)).map((k) => k.p));
  if (pre.length && pre.length <= 3) return pre.slice(0, max);
  if (pre.length) return [];
  const bare = s.replace(/(역|거리|시장)$/, '');
  if (bare !== s && bare.length >= 2) return uniq(keys().filter((k) => k.key === bare).map((k) => k.p)).slice(0, max);
  return [];
}

/** 현지 검색어로 찾은 결과 중 그 명소에 맞는 하나를 골라 한글 이름을 붙인다 */
export function pickJp(p: JpPlace, found: Hit[], near?: Near): Hit | null {
  const a = p.area ? JP_AREAS[p.area] : null;
  let pool = found.filter((h) => h.countryCode === 'JP' || !h.countryCode);
  if (a) {
    const c = { lat: a[0], lng: a[1] };
    const inArea = pool.filter((h) => km(c, h) <= a[2]);
    // 동네 안이 없으면 조금 넓게 (동네 중심이 대략이라)
    pool = inArea.length ? inArea : pool.filter((h) => km(c, h) <= a[2] * 3);
  } else {
    // 동네를 모르는 곳은 이름이 맞는 것만 (비슷한 이름의 엉뚱한 가게를 고르지 않게)
    const q = p.q.replace(/\s+/g, '').toLowerCase();
    pool = pool.filter((h) => h.name.replace(/\s+/g, '').toLowerCase().includes(q));
    if (near) pool = pool.filter((h) => km(near, h) <= FAR_KM).sort((x, y) => km(near, x) - km(near, y));
  }
  const h = pool[0];
  if (!h) return null;
  return { ...h, name: p.ko, en: p.en || h.en || h.name };
}

/** 사전 명소의 현지 검색 기준 좌표 (동네 중심, 없으면 기준 지점) */
export function jpBias(p: JpPlace, near?: Near): Near | undefined {
  const a = p.area ? JP_AREAS[p.area] : null;
  return a ? { lat: a[0], lng: a[1] } : near;
}
