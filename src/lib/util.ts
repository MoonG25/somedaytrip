import type { Kind, Plan, Scope, When } from '../types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

// 32글자 알파벳이라 256으로 나눠 떨어져 치우침이 없다. 헷갈리는 0/o/1/l은 뺐다
const ALPHA = '23456789abcdefghijkmnpqrstuvwxyz';
export function uid(n = 10) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => ALPHA[b % 32]).join('');
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll(sel)] as T[];

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout>;
  return (...a: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

export const SCOPES: Record<Scope, { label: string; icon: string; hint: string; zoom: number }> = {
  local: { label: '동네', icon: '🏘️', hint: '걸어서, 자전거로, 버스 몇 정거장', zoom: 15 },
  domestic: { label: '국내', icon: '🚗', hint: '주말에 훌쩍 떠나는 거리', zoom: 11 },
  abroad: { label: '해외', icon: '✈️', hint: '여권 챙겨서', zoom: 11 },
};

export const KINDS: Record<Kind, { label: string; icon: string }> = {
  see: { label: '구경', icon: '📍' },
  eat: { label: '먹기', icon: '🍜' },
  cafe: { label: '카페', icon: '☕' },
  shop: { label: '쇼핑', icon: '🛍️' },
  move: { label: '이동', icon: '🚶' },
  stay: { label: '숙소', icon: '🛏️' },
  etc: { label: '기타', icon: '✨' },
};

// ---- 날짜 ----
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const today = () => toISO(new Date());

export function dayCount(when: When) {
  if (when.mode === 'someday') return Math.max(1, when.days);
  const n = Math.round((parse(when.end).getTime() - parse(when.start).getTime()) / 864e5) + 1;
  return Math.max(1, Math.min(n, 60));
}

export function dayLabel(when: When, day: number) {
  if (when.mode === 'someday') return `${day}일차`;
  const d = parse(when.start);
  d.setDate(d.getDate() + day - 1);
  return `${day}일차 · ${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
}

export function nightsLabel(n: number) {
  return n === 1 ? '당일치기' : `${n - 1}박 ${n}일`;
}

export function whenLabel(when: When) {
  if (when.mode === 'someday') return `언젠가 · ${nightsLabel(when.days)}${when.season ? ` · ${when.season}` : ''}`;
  const s = parse(when.start);
  const e = parse(when.end);
  const left = Math.round((s.getTime() - parse(today()).getTime()) / 864e5);
  const dd = left > 0 ? `D-${left}` : left === 0 ? 'D-DAY' : parse(today()) <= e ? '여행 중' : '다녀옴';
  const range = when.start === when.end ? `${s.getMonth() + 1}.${s.getDate()}` : `${s.getMonth() + 1}.${s.getDate()} – ${e.getMonth() + 1}.${e.getDate()}`;
  return `${dd} · ${range}`;
}

export function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return '방금';
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanceLabel(d: number) {
  if (d < 1) return `${Math.round(d * 100) * 10}m`;
  return `${d < 10 ? d.toFixed(1) : Math.round(d)}km`;
}

export const dayColor = (day: number | null) => (day == null ? 'var(--muted)' : `oklch(0.66 0.16 ${(day * 67 + 20) % 360})`);

export function planHref(plan: Pick<Plan, 'id'>) {
  return `/p/${plan.id}`;
}
