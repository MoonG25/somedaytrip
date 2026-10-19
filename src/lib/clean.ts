// 브라우저에서 온 값은 믿지 않는다. 서버가 저장하기 전에 모양과 길이를 맞춘다.
import type { Item, Kind, Op, Place, PlanInfo, Scope, Status, Visibility } from './types';

const str = (v: unknown, max: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);
const num = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const coord = (lat: unknown, lng: unknown): [number, number] | null => {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [+a.toFixed(5), +b.toFixed(5)] : null;
};

export const STATUSES = ['booked', 'preparing', 'planning', 'dream', 'done'] as const satisfies readonly Status[];
export const SCOPES = ['abroad', 'domestic', 'local'] as const satisfies readonly Scope[];
export const KIND_KEYS = ['see', 'eat', 'cafe', 'shop', 'move', 'stay', 'etc'] as const satisfies readonly Kind[];

export function cleanPlace(p: unknown): Place | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const c = coord(o.lat, o.lng);
  if (!c) return null;
  return { name: str(o.name, 80) || '이름 없는 곳', en: str(o.en, 80) || undefined, address: str(o.address, 160) || undefined, lat: c[0], lng: c[1] };
}

export function cleanItem(i: unknown): Item {
  const o = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>;
  return {
    id: str(o.id, 24) || Math.random().toString(36).slice(2, 10),
    day: o.day == null || o.day === '' ? null : num(o.day, 1, 60, 1),
    time: /^\d{2}:\d{2}$/.test(String(o.time ?? '')) ? String(o.time) : '',
    title: str(o.title, 80) || '이름 없는 일정',
    en: str(o.en, 80),
    kind: oneOf(o.kind, KIND_KEYS, 'see'),
    place: cleanPlace(o.place),
    memo: str(o.memo, 400),
    cost: o.cost == null || o.cost === '' ? null : num(o.cost, 0, 1e10, 0),
    order: Number.isFinite(Number(o.order)) ? Number(o.order) : 0,
  };
}

/** 부분 수정(before/after)의 칸들도 같은 규칙으로 */
function cleanPartial(p: unknown): Partial<Item> {
  if (!p || typeof p !== 'object') return {};
  const o = p as Record<string, unknown>;
  const full = cleanItem({ ...o, id: 'x' });
  const out: Partial<Item> = {};
  for (const k of Object.keys(o)) {
    if (k in full && k !== 'id') (out as Record<string, unknown>)[k] = (full as unknown as Record<string, unknown>)[k];
  }
  return out;
}

export function cleanOps(ops: unknown): Op[] {
  if (!Array.isArray(ops)) return [];
  return ops.slice(0, 100).flatMap((o): Op[] => {
    if (!o || typeof o !== 'object') return [];
    const op = o as Record<string, unknown>;
    if (op.type === 'add') return [{ type: 'add', item: cleanItem(op.item) }];
    if (op.type === 'update' && typeof op.id === 'string') {
      const after = cleanPartial(op.after);
      return Object.keys(after).length ? [{ type: 'update', id: op.id, before: cleanPartial(op.before), after }] : [];
    }
    if (op.type === 'remove' && typeof op.id === 'string') return [{ type: 'remove', id: op.id, before: cleanItem({ ...(op.before as object), id: op.id }) }];
    return [];
  });
}

export function cleanInfo(i: unknown): PlanInfo {
  const o = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>;
  const cover = (o.cover && typeof o.cover === 'object' ? o.cover : {}) as Record<string, unknown>;
  const budget: Record<string, number> = {};
  if (o.budget && typeof o.budget === 'object') {
    for (const [k, v] of Object.entries(o.budget as object).slice(0, 12)) {
      const key = str(k, 20);
      if (key) budget[key] = num(v, 0, 1e10, 0);
    }
  }
  const checklist = Array.isArray(o.checklist)
    ? o.checklist
        .slice(0, 60)
        .map((c): [string, boolean] => (Array.isArray(c) ? [str(c[0], 80), !!c[1]] : [str(c, 80), false]))
        .filter(([t]) => t)
    : [];
  const months = Array.isArray(o.months) ? [...new Set(o.months.map((m) => num(m, 1, 12, 1)))].sort((a, b) => a - b) : [];
  const coords = Array.isArray(o.coords) ? coord(o.coords[0], o.coords[1]) : null;
  return {
    title: str(o.title, 60) || '이름 없는 여행',
    place: str(o.place, 40) || '어딘가',
    placeEn: str(o.placeEn, 40),
    country: str(o.country, 40),
    countryCode: str(o.countryCode, 2).toUpperCase().replace(/[^A-Z]/g, ''),
    iata: str(o.iata, 3).toUpperCase().replace(/[^A-Z]/g, ''),
    scope: oneOf(o.scope, SCOPES, 'abroad'),
    status: oneOf(o.status, STATUSES, 'dream'),
    priority: num(o.priority, 0, 99, 9),
    target: isoDate(o.target),
    days: num(o.days, 1, 60, 3),
    months,
    tz: /^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/.test(String(o.tz ?? '')) ? String(o.tz) : 'Asia/Seoul',
    currency: /^[A-Z]{3}$/.test(String(o.currency ?? '')) ? String(o.currency) : 'KRW',
    cover: { scene: str(cover.scene, 20) || 'mountain', time: str(cover.time, 20) || 'day' },
    why: str(o.why, 200),
    tags: Array.isArray(o.tags) ? o.tags.map((t) => str(t, 20)).filter(Boolean).slice(0, 10) : [],
    intro: str(o.intro, 6000),
    coords,
    budget,
    checklist,
    ownerName: str(o.ownerName, 20) || '주인',
    visibility: oneOf<Visibility>(o.visibility, ['link', 'public'], 'link'),
  };
}

/** 주소용 이름: kyoto-5days. 영문 이름이 없으면 trip */
export function planSlug(p: Pick<PlanInfo, 'placeEn' | 'iata' | 'days' | 'scope'>) {
  const base = (p.placeEn || p.iata || (p.scope === 'local' ? 'local-trip' : 'trip'))
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'trip'}-${p.days}days`;
}
