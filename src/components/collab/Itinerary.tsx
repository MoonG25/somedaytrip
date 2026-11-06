'use client';
// 일정 · 가 볼 곳. moon.log 계획 상세의 "Places to see"(번호 목록 + 지도) 모양에 협업을 얹었다.
//  - 기장: 고치면 바로 반영 (서버 액션)
//  - 승객: 고친 내용이 "제안 바구니"(이 브라우저)에 모였다가, 제목을 붙여 한 번에 제안
//  - 긴 시간표(80줄 넘게)도 다루기 쉽게: 날짜 접기·날짜 칩, 이동 구간은 한 줄, 끌어서 순서 바꾸기
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GoMode, Item, Op, Plan, Proposal } from '@/lib/types';
import { diffItem, describeOps, findConflicts, GO, KINDS, opCounts, pendingGroups, stage, stagedView, TAGS, type Mark, type PendingGroup } from '@/lib/proposals';
import { curOf, fmtMoney, fmtWithKRW, sumKRW } from '@/lib/money';
import { optimizeRoute, routeKm } from '@/blog/plans-lib.js';
import { loadLeaflet, createMap, destroyMap, pinIcon } from '@/blog/leaflet.js';
import { krwPer } from '@/blog/live.js';
import { applyDirect, propose } from '@/app/actions';
import { rememberPlan } from '@/lib/mine';
import { googleDirections, googleMapsAt } from '@/lib/links';
import ItemModal from './ItemModal';
import Modal from './Modal';
import OpCard, { timeText } from './OpCard';
import { GhostRow, SuggQueue, SuggStrips, useDecide } from './Suggestions';
import { broadcast, dayColor, dayLabel, distanceLabel, km, toast } from './util';

interface Draft {
  baseVersion: number;
  ops: Op[];
}
const draftKey = (id: string) => `sdt:draft:${id}`;
const loadDraft = (id: string): Draft | null => {
  try {
    return JSON.parse(localStorage.getItem(draftKey(id)) || 'null');
  } catch {
    return null;
  }
};
const saveDraft = (id: string, d: Draft | null) => {
  try {
    if (d && d.ops.length) localStorage.setItem(draftKey(id), JSON.stringify(d));
    else localStorage.removeItem(draftKey(id));
  } catch {}
};
const myName = () => {
  try {
    return localStorage.getItem('sdt:name') || '';
  } catch {
    return '';
  }
};

type Row = { item: Item; mark: Mark; fields: string[] };

const SHOW_KEY = 'sdt:sugg';
const foldKey = (id: string) => `sdt:fold:${id}`;
const dayKey = (day: number | null) => (day == null ? 'someday' : String(day));
/** 예전 '이동' 줄에서 가는 방법 짐작 */
const guessGo = (moves: Item[]): GoMode => {
  const t = moves.map((m) => m.title + ' ' + m.memo).join(' ');
  if (/✈|항공|비행|공항 *→|→ *.*공항|\b[A-Z]{2}\d{2,4}\b/.test(t)) return 'flight';
  if (/택시|렌터카|자동차|드라이브/.test(t)) return 'car';
  if (/도보|걸어/.test(t) && !/열차|버스|지하철|선\b|신칸센/.test(t)) return 'walk';
  return moves.length ? 'transit' : '';
};
const GO_ORDER: GoMode[] = ['', 'walk', 'transit', 'car', 'flight'];
/** 이만큼 넘게 떨어진 연속 일정은 잘못 고른 장소로 보고 거리·지도 선에서 뺀다 */
const FAR_KM = 300;

/** 비행 구간 (공항 ↔ 공항): 멀어도 정상이라 거리에서만 빼고 경고하지 않는다 */
// 공항·비행 구간: 멀어도 '잘못 고른 장소' 경고를 하지 않는다 (공항은 이제 이동 줄이 아니라 장소로도 적는다)
const isFlight = (it: Item) => it.go === 'flight' || /공항|✈|airport/i.test(`${it.title} ${it.place?.name ?? ''}`);


/** 여행 중이면 오늘이 몇째 날인지 */
function todayDay(plan: Pick<Plan, 'target' | 'days'>) {
  if (!plan.target) return null;
  const start = new Date(plan.target + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = Math.round((today.getTime() - start.getTime()) / 86400000) + 1;
  return d >= 1 && d <= plan.days ? d : null;
}

export default function Itinerary({ plan, items, owner, pending = [], mine = [] }: { plan: Plan; items: Item[]; owner: boolean; pending?: Proposal[]; mine?: number[] }) {
  const router = useRouter();
  // 대기 중인 제안: 우선순위대로 묶어서 일정 위에 보여 준다
  const groups = useMemo(() => pendingGroups(items, pending), [items, pending]);
  const mineSet = useMemo(() => new Set(mine), [mine]);
  const ctl = useDecide(plan);
  const [showSugg, setShowSuggState] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(SHOW_KEY) === '0') setShowSuggState(false);
    } catch {}
  }, []);
  const setShowSugg = (v: boolean) => {
    setShowSuggState(v);
    try {
      localStorage.setItem(SHOW_KEY, v ? '1' : '0');
    } catch {}
  };
  const ghostsByDay = useMemo(() => {
    const m = new Map<number | null, PendingGroup[]>();
    for (const g of groups) if (g.type === 'add') m.set(g.day, [...(m.get(g.day) || []), g]);
    return m;
  }, [groups]);
  const stripsByItem = useMemo(() => {
    const m = new Map<string, PendingGroup[]>();
    for (const g of groups) if (g.type !== 'add') m.set(g.target, [...(m.get(g.target) || []), g]);
    return m;
  }, [groups]);
  const [draft, setDraft] = useState<Draft | null>(null);
  // order·upper: "이 아래에 추가"로 열었을 때 넣을 자리 (upper = 바로 다음 일정의 order)
  const [edit, setEditState] = useState<{ item: Item | null; day: number | null; key: number; order?: number; upper?: number | null } | null>(null);
  // 열 때마다 새 key → 일정 창을 처음부터 다시 그린다 (이전 내용이 남지 않게)
  const setEdit = (v: { item: Item | null; day: number | null; order?: number; upper?: number | null } | null) => setEditState(v ? { ...v, key: Date.now() } : null);
  const [sending, setSending] = useState(false);
  const [askName, setAskName] = useState<null | ((n: string) => void)>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: any; map: any; layer: any } | null>(null);
  const markers = useRef(new Map<string, any>());
  // 지도에 보일 날: 'all' = 전체, 숫자 = 그날만, null = 날짜 미정(후보)만
  const [mapDay, setMapDay] = useState<'all' | number | null>('all');

  useEffect(() => setDraft(loadDraft(plan.id)), [plan.id]);

  const rows: Row[] = useMemo(
    () => (owner || !draft ? items.map((item) => ({ item, mark: null as Mark, fields: [] })) : (stagedView(items, draft.ops) as Row[])),
    [owner, draft, items]
  );
  const days = useMemo(() => [...Array.from({ length: plan.days }, (_, i) => i + 1), null] as (number | null)[], [plan.days]);
  const live = rows.filter((r) => r.mark !== 'remove');
  const withPlace = live.filter((r) => r.item.place);
  const nextOrder = useCallback((day: number | null) => Math.max(-1, ...rows.filter((r) => r.item.day === day).map((r) => r.item.order)) + 1, [rows]);

  /* ---------- 환율 (현지 통화로 적은 비용을 원화로 어림) ---------- */
  const [rates, setRates] = useState<Record<string, number | null>>({ KRW: 1 });
  const curs = useMemo(() => [...new Set([curOf(plan.currency), ...items.map((i) => curOf(i.cur))])].filter((c) => c !== 'KRW').sort().join(','), [plan.currency, items]);
  useEffect(() => {
    let alive = true;
    for (const c of curs.split(',').filter(Boolean))
      krwPer(c)
        .then((r: number) => alive && setRates((m) => ({ ...m, [c]: r })))
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [curs]);
  const money = (it: Pick<Item, 'cost' | 'cur'>) => (it.cost ? fmtWithKRW(it.cost, it.cur, rates[curOf(it.cur)]) : '');
  /** 그날 비용 합계: 환율을 다 알면 원화 하나로, 모르면 통화별로 */
  const costSum = (list: Item[]) => {
    const paid = list.filter((i) => i.cost);
    if (!paid.length) return '';
    const { total, known } = sumKRW(paid, rates);
    const foreign = paid.some((i) => curOf(i.cur) !== 'KRW');
    if (known) return `${foreign ? '≈ ' : ''}${fmtMoney(total, 'KRW')}`;
    const by = new Map<string, number>();
    for (const i of paid) by.set(curOf(i.cur), (by.get(curOf(i.cur)) || 0) + (i.cost ?? 0));
    return [...by].map(([c, n]) => fmtMoney(n, c)).join(' + ');
  };

  /* ---------- 날짜 접기 ---------- */
  const [closed, setClosed] = useState<Set<string>>(new Set());
  // 펼친 메모 (긴 메모는 두 줄만 보이고 눌러서 펼친다)
  const [openMemo, setOpenMemo] = useState<Set<string>>(new Set());
  useEffect(() => {
    let saved: unknown = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(foldKey(plan.id)) || 'null');
    } catch {}
    if (Array.isArray(saved)) setClosed(new Set(saved.map(String)));
    // 모바일은 첫 진입 때 하루(여행 중이면 오늘)만 펴 둔다
    else if (window.innerWidth < 720) {
      const open = todayDay(plan) ?? 1;
      setClosed(new Set(days.filter((d) => d !== open).map(dayKey)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id]);
  // 접힌 날짜 바꾸기 (지도 핀 등 오래된 클로저에서 불러도 최신 상태로)
  const updateFold = (fn: (s: Set<string>) => void) =>
    setClosed((prev) => {
      const s = new Set(prev);
      fn(s);
      try {
        sessionStorage.setItem(foldKey(plan.id), JSON.stringify([...s]));
      } catch {}
      return s;
    });
  const toggleDay = (day: number | null) => updateFold((s) => (s.has(dayKey(day)) ? s.delete(dayKey(day)) : s.add(dayKey(day))));
  const openDay = (day: number | null) => updateFold((s) => s.delete(dayKey(day)));
  const goDay = (day: number | null) => {
    openDay(day);
    requestAnimationFrame(() => document.getElementById(`day-${dayKey(day)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const jump = (g: PendingGroup) => {
    if (!showSugg) setShowSugg(true);
    openDay(g.day);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-sugg="${CSS.escape(g.key)}"]`);
      if (!el) return toast('일정에서 찾을 수 없는 제안이에요', '·');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    });
  };

  /* ---------- 거리: 연속한 두 장소 사이. 너무 먼 구간은 빼고 경고 ---------- */
  const route = useMemo(() => {
    const gap = new Map<string, number>(); // 앞 장소에서 온 거리 (정상 구간만)
    const cut = new Set<string>(); // 앞 장소와 선을 잇지 않는 일정
    const warn = new Set<string>(); // "멀리 떨어진 장소"
    const homes = [plan.coords, ...(plan.via || []).map((v) => v.coords)].filter(Boolean) as [number, number][];
    const away = (p: { lat: number; lng: number }) => (homes.length ? Math.min(...homes.map(([lat, lng]) => km(p, { lat, lng }))) : 0);
    let total = 0;
    // 여행지(목적지·들르는 도시)에서 먼 장소: 출국·귀국 공항 등. 지도 맞춤에서 뺀다 (화면이 한국까지 빠지지 않게)
    const outside = new Set(rows.filter((r) => r.item.place && homes.length && away(r.item.place) > FAR_KM).map((r) => r.item.id));
    for (const day of days) {
      if (day == null) continue;
      let prev: Item | null = null;
      for (const r of rows) {
        const it = r.item;
        if (it.day !== day || r.mark === 'remove' || !it.place) continue;
        if (prev) {
          const d = km(prev.place!, it.place);
          if (d > FAR_KM) {
            cut.add(it.id);
            // 목적지에서 더 먼 쪽이 잘못 고른 장소일 가능성이 크다
            if (!isFlight(prev) && !isFlight(it)) warn.add(homes.length && away(prev.place!) > away(it.place) ? prev.id : it.id);
          } else {
            gap.set(it.id, d);
            total += d;
          }
        }
        prev = it;
      }
    }
    return { gap, cut, warn, outside, total };
  }, [rows, days, plan.coords, plan.via]);

  /* ---------- 지도 ---------- */
  useEffect(() => {
    let alive = true;
    loadLeaflet()
      .then((L: any) => {
        if (!alive || !mapEl.current) return;
        const map = createMap(L, mapEl.current, { baseSwitch: true });
        const layer = L.layerGroup().addTo(map);
        mapRef.current = { L, map, layer };
        // 동네 여행은 처음부터 동네 크기로
        map.setView(plan.coords || [37.5665, 126.978], plan.coords ? (plan.scope === 'local' ? 15 : 11) : 5);
        mapEl.current.parentElement?.querySelector('.map-loading')?.remove();
        setFocus((f) => f); // 다시 그리기
        drawRef.current?.(true);
      })
      .catch(() => {
        const el = mapEl.current?.parentElement?.querySelector('.map-loading');
        if (el) el.textContent = '지도를 불러오지 못했어요';
      });
    return () => {
      alive = false;
      destroyMap(mapRef.current?.map);
      mapRef.current = null;
    };
    // 좌표 값이 같으면 지도를 다시 만들지 않는다 (새로 고칠 때마다 새 배열이 와서 보던 위치·확대가 초기화됐다)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.coords?.join(',')]);

  const drawRef = useRef<(fit: boolean) => void>(null);
  drawRef.current = (fit: boolean) => {
    const m = mapRef.current;
    if (!m) return;
    const { L, map, layer } = m;
    layer.clearLayers();
    markers.current.clear();
    const pts: [number, number][] = [];
    const spare: [number, number][] = []; // 맞춤에서 뺀 장소 (그것밖에 없으면 이걸로 맞춘다)
    // 날마다 첫·마지막 장소: 전날 마지막(묵은 곳) → 다음 날 첫 장소를 잇는다 (하코네 → 쿠사츠 같은 도시 이동)
    const ends = new Map<number, { first: [number, number]; last: [number, number]; lastTitle: string }>();
    for (const d of days) {
      if (d == null) continue;
      const l = rows.filter((r) => r.item.day === d && r.item.place && r.mark !== 'remove' && !route.warn.has(r.item.id));
      if (l.length) ends.set(d, { first: [l[0].item.place!.lat, l[0].item.place!.lng], last: [l[l.length - 1].item.place!.lat, l[l.length - 1].item.place!.lng], lastTitle: l[l.length - 1].item.title });
    }
    for (const day of days) {
      if (mapDay !== 'all' && day !== mapDay) continue;
      if (day != null && ends.has(day)) {
        const prevDay = [...ends.keys()].filter((k) => k < day).pop();
        const prev = prevDay != null ? ends.get(prevDay)! : null;
        const to = ends.get(day)!.first;
        const d = prev ? km({ lat: prev.last[0], lng: prev.last[1] }, { lat: to[0], lng: to[1] }) : 0;
        if (prev && d > 0.05 && d <= FAR_KM) {
          L.polyline([prev.last, to], { className: 'route-plan route-overnight', weight: 2.5, dashArray: '2 8', interactive: false, color: dayColor(day) }).addTo(layer);
          // 그날만 볼 때는 어디서 출발하는지(전날 마지막 장소)도 작게 보여 준다
          if (mapDay !== 'all') {
            L.circleMarker(prev.last, { radius: 6, weight: 2, color: dayColor(prevDay!), fillColor: '#fff', fillOpacity: 1 })
              .bindTooltip(`전날에서 출발 · ${prev.lastTitle}`, { direction: 'top', offset: [0, -6] })
              .addTo(layer);
            pts.push(prev.last);
          }
        }
      }
      const list = rows.filter((r) => r.item.day === day && r.item.place);
      // 먼 구간에서 선을 끊는다
      const lines: [number, number][][] = [[]];
      // 번호는 장소에만 (이동 줄은 핀 없이 선만, 도착지가 다른 장소와 겹치지 않으면 작은 점)
      const stopsOfDay = rows.filter((x) => x.item.day === day && x.item.kind !== 'move');
      list.forEach((r) => {
        const ll: [number, number] = [r.item.place!.lat, r.item.place!.lng];
        if (r.item.kind === 'move' && day != null) {
          if (r.mark !== 'remove') {
            if (route.cut.has(r.item.id)) lines.push([]);
            lines[lines.length - 1].push(ll);
            if (!route.warn.has(r.item.id) && !route.outside.has(r.item.id)) pts.push(ll);
            else spare.push(ll);
            const shared = stopsOfDay.some((x) => x.item.place && Math.abs(x.item.place.lat - ll[0]) < 1e-4 && Math.abs(x.item.place.lng - ll[1]) < 1e-4);
            if (!shared)
              L.circleMarker(ll, { radius: 5, weight: 2, color: dayColor(day), fillColor: '#fff', fillOpacity: 1 })
                .bindTooltip(`${GO[guessGo([r.item]) as Exclude<GoMode, ''>]?.icon || ''} ${r.item.place!.name}`, { direction: 'top', offset: [0, -6] })
                .addTo(layer);
          }
          return;
        }
        const n = stopsOfDay.indexOf(r) + 1;
        const mk = L.marker(ll, { icon: pinIcon(L, { label: day == null ? '?' : String(n), kind: `is-plan${r.mark ? ` is-${r.mark}` : ''}${focus === r.item.id ? ' is-active' : ''}` }), title: r.item.title })
          .addTo(layer)
          .bindTooltip(`${KINDS[r.item.kind].icon} ${r.item.title}`, { direction: 'top', offset: [0, -14] })
          .on('click', () => {
            setFocus(r.item.id);
            openDay(r.item.day);
            requestAnimationFrame(() => document.querySelector(`[data-item="${r.item.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          });
        mk.getElement()?.style.setProperty('--dc', dayColor(day));
        markers.current.set(r.item.id, mk);
        if (r.mark !== 'remove') {
          if (route.cut.has(r.item.id)) lines.push([]);
          lines[lines.length - 1].push(ll);
          // 멀리 떨어진 장소는 지도 맞춤에서 뺀다 (지도가 한없이 멀어지지 않게)
          if (!route.warn.has(r.item.id) && !route.outside.has(r.item.id)) pts.push(ll);
          else spare.push(ll);
        }
      });
      if (day != null) for (const line of lines) if (line.length > 1) L.polyline(line, { className: 'route-plan', weight: 2.5, interactive: false, color: dayColor(day) }).addTo(layer);
      // 추가 제안은 반투명 핀
      if (showSugg)
        for (const g of ghostsByDay.get(day) || []) {
          const it = g.primary.op.type === 'add' ? g.primary.op.item : null;
          if (!it?.place) continue;
          const mk = L.marker([it.place.lat, it.place.lng], { icon: pinIcon(L, { label: '+', kind: 'is-plan is-ghost' }), title: `제안: ${it.title}` })
            .addTo(layer)
            .bindTooltip(`제안 · ${KINDS[it.kind].icon} ${it.title}`, { direction: 'top', offset: [0, -14] })
            .on('click', () => jump(g));
          mk.getElement()?.style.setProperty('--dc', dayColor(day));
        }
    }
    if (fit && !pts.length) pts.push(...spare);
    if (fit && pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: plan.scope === 'local' ? 16 : 14, animate: false });
  };
  const fittedRef = useRef(false);
  useEffect(() => {
    drawRef.current?.(!fittedRef.current);
    if (mapRef.current && withPlace.length) fittedRef.current = true;
  }, [rows, focus, withPlace.length, groups, showSugg]);
  // 보일 날을 바꾸면 그날 장소에 맞춰 다시 맞춘다
  const firstFilter = useRef(true);
  useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false;
      return;
    }
    drawRef.current?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapDay]);
  /** 그날보다 앞선 날의 마지막 장소 (이동 줄 제외) — 다음 날 첫 장소의 출발지 */
  const lastStopBefore = (day: number) => {
    for (let d = day - 1; d >= 1; d--) {
      // 그날 마지막으로 도착한 곳 ('숙소로' 같은 이동 줄의 도착지 포함)
      const l = live.filter((r) => r.item.day === d && r.item.place);
      if (l.length) return l[l.length - 1].item;
    }
    return null;
  };
  // 지도에서 고를 수 있는 날 (장소가 있는 날만)
  const mapDays = useMemo(() => days.filter((d) => withPlace.some((r) => r.item.day === d)), [days, withPlace]);
  // 보던 날의 장소가 다 없어지면 전체로
  useEffect(() => {
    if (mapDay !== 'all' && !mapDays.includes(mapDay)) setMapDay('all');
  }, [mapDay, mapDays]);

  const focusItem = (id: string) => {
    setFocus(id);
    const it = rows.find((r) => r.item.id === id)?.item;
    const m = mapRef.current;
    if (!it?.place || !m) return toast('장소가 없는 일정이에요', '·');
    // 다른 날만 보고 있었으면 그 일정의 날로 바꾼다
    if (mapDay !== 'all' && mapDay !== it.day) setMapDay(it.day);
    m.map.flyTo([it.place.lat, it.place.lng], Math.max(m.map.getZoom(), 14), { duration: 0.8 });
  };

  /* ---------- 바꾸기 ---------- */
  const ensureName = () =>
    new Promise<string | null>((resolve) => {
      const n = myName();
      if (n) return resolve(n);
      setAskName(() => (name: string) => resolve(name || null));
    });

  /** 기장은 바로 반영, 승객은 바구니에. 반영(또는 담기)했으면 true */
  const commit = async (ops: Op[], msg?: string) => {
    if (!ops.length) return false;
    if (owner) {
      setBusy(true);
      const r = await applyDirect(plan.id, ops);
      setBusy(false);
      if (!r.ok) {
        toast(r.error, '!');
        return false;
      }
      broadcast(plan.id);
      router.refresh();
      toast(msg || '반영했어요', '✓');
      return true;
    }
    if (!(await ensureName())) return false;
    const d: Draft = draft ? { ...draft, ops: [...draft.ops] } : { baseVersion: plan.version, ops: [] };
    for (const op of ops) d.ops = stage(d.ops, op);
    const next = d.ops.length ? d : null;
    setDraft(next);
    saveDraft(plan.id, next);
    toast(next ? msg || '제안 바구니에 담았어요' : '바구니가 비었어요', '🧺');
    return true;
  };

  const view = (id: string) => rows.find((r) => r.item.id === id)?.item;
  const sameDay = (day: number | null) => live.filter((r) => r.item.day === day).map((r) => r.item);

  /** 이 순서대로 order를 0, 1, 2…로 다시 매기는 변경들 (order가 겹친 일정끼리는 중간값을 낼 수 없어서) */
  const seqOps = (seq: Item[]) => seq.map((x, i) => diffItem(x, { ...x, order: i })).filter(Boolean) as Op[];
  // order가 같거나 너무 붙어 있으면 중간값으로 자리를 잡을 수 없다 (승객 두 명이 같은 날 끝에 추가한 제안이 둘 다 반영되면 생긴다)
  const tight = (a?: Item, b?: Item) => !!a && !!b && b.order - a.order < 1e-6;

  const move = (id: string, dir: -1 | 1) => {
    const cur = view(id);
    if (!cur) return;
    const same = sameDay(cur.day);
    const i = same.findIndex((x) => x.id === id);
    const other = same[i + dir];
    if (!other) return;
    if (cur.order === other.order) {
      const seq = same.slice();
      [seq[i], seq[i + dir]] = [seq[i + dir], seq[i]];
      return commit(seqOps(seq), '순서를 바꿨어요');
    }
    commit([diffItem(cur, { ...cur, order: other.order }), diffItem(other, { ...other, order: cur.order })].filter(Boolean) as Op[], '순서를 바꿨어요');
  };

  /** 같은 날 다른 일정들(others) 사이 at 자리로 옮긴다: 앞뒤 order의 중간값 하나만 바꾼다 */
  const moveTo = (id: string, others: Item[], at: number) => {
    const cur = view(id);
    if (!cur) return;
    const a = others[at - 1];
    const b = others[at];
    if (tight(a, b)) {
      const seq = others.slice();
      seq.splice(at, 0, cur);
      return commit(seqOps(seq), '순서를 바꿨어요');
    }
    const order = a && b ? (a.order + b.order) / 2 : a ? a.order + 1 : b ? b.order - 1 : cur.order;
    const op = diffItem(cur, { ...cur, order });
    if (op) commit([op], '순서를 바꿨어요');
  };

  const remove = (id: string) => {
    const cur = view(id);
    if (!cur) return;
    if (owner && !confirm(`'${cur.title}'을(를) 지울까요?`)) return;
    commit([{ type: 'remove', id, before: items.find((x) => x.id === id) ?? cur }], owner ? '지웠어요' : undefined);
  };

  const undo = (id: string) => {
    if (!draft) return;
    const next = { ...draft, ops: draft.ops.filter((o) => (o.type === 'add' ? o.item.id : o.id) !== id) };
    const d = next.ops.length ? next : null;
    setDraft(d);
    saveDraft(plan.id, d);
  };

  /** 이 일정과 다음 일정 사이에 새 일정 */
  const addBelow = async (it: Item) => {
    const same = sameDay(it.day);
    const i = same.findIndex((x) => x.id === it.id);
    const nx = same[i + 1];
    if (tight(it, nx)) {
      // 겹친 order를 먼저 0, 1, 2…로 정리하고 그 사이에 넣는다
      if (!(await commit(seqOps(same), '순서 번호를 정리했어요'))) return;
      return setEdit({ item: null, day: it.day, order: i + 0.5, upper: i + 1 });
    }
    setEdit({ item: null, day: it.day, order: nx ? (it.order + nx.order) / 2 : it.order + 1, upper: nx ? nx.order : null });
  };

  /* 동선 최적화: 날마다 가장 짧은 순서로 → 기장은 바로, 승객은 바구니로 */
  const optimize = () => {
    const ops: Op[] = [];
    let before = 0;
    let after = 0;
    for (const day of days) {
      if (day == null) continue;
      const list = sameDay(day);
      const placed = list.filter((i) => i.place);
      if (placed.length < 3) continue;
      const stops = placed.map((i) => ({ id: i.id, coords: [i.place!.lat, i.place!.lng] as [number, number] }));
      const best = optimizeRoute(stops) as typeof stops;
      before += routeKm(stops);
      after += routeKm(best);
      // 장소 없는 일정은 제자리, 장소 있는 일정끼리만 순서를 바꾼다
      const slots = list.map((i) => i.order);
      let k = 0;
      const seq = list.map((i) => (i.place ? placed.find((p) => p.id === best[k++].id)! : i));
      seq.forEach((it, idx) => {
        const op = diffItem(it, { ...it, order: slots[idx] });
        if (op) ops.push(op);
      });
    }
    if (!ops.length) return toast('이미 가장 짧은 동선이에요', '✓');
    commit(ops, `동선을 ${(before - after).toFixed(1)}km 줄였어요 (${before.toFixed(1)} → ${after.toFixed(1)}km)`);
  };

  /** 그날 일정을 시간순으로: 시간 있는 일정끼리만 그 자리들 안에서 정렬하고, 시간 없는 일정(이동 구간 등)은 제자리 */
  const timeSorted = (day: number | null) => {
    const list = sameDay(day);
    const timed = list.filter((i) => i.time).sort((a, b) => a.time.localeCompare(b.time));
    let k = 0;
    const next = list.map((i) => (i.time ? timed[k++] : i));
    return { list, next, timed: timed.length };
  };
  const outOfOrder = (day: number | null) => {
    const { list, next, timed } = timeSorted(day);
    return timed > 1 && list.some((it, i) => it.id !== next[i].id);
  };
  // 정렬 직후 잠깐 "되돌리기": 정렬 전 order를 기억해 둔다
  const [sorted, setSorted] = useState<{ day: number | null; before: Record<string, number>; after: Record<string, number> } | null>(null);
  const sortTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sortByTime = async (day: number | null) => {
    const { list, next } = timeSorted(day);
    // order가 겹치면 자리 번호를 새로 매긴다
    const strict = list.every((it, i) => i === 0 || it.order > list[i - 1].order);
    const slots = strict ? list.map((i) => i.order) : list.map((_, i) => i);
    const ops = next.map((it, i) => diffItem(it, { ...it, order: slots[i] })).filter(Boolean) as Op[];
    if (!(await commit(ops, '시간순으로 정렬했어요'))) return;
    setSorted({ day, before: Object.fromEntries(list.map((i) => [i.id, i.order])), after: Object.fromEntries(next.map((it, i) => [it.id, slots[i]])) });
    clearTimeout(sortTimer.current);
    sortTimer.current = setTimeout(() => setSorted(null), 10_000);
  };
  const unsort = async () => {
    if (!sorted) return;
    // 화면이 아직 새로 고쳐지기 전이어도 되게, 정렬한 뒤의 order(after)를 기준으로 되돌린다
    const ops = Object.entries(sorted.before).flatMap(([id, order]) => {
      const cur = view(id);
      const op = cur ? diffItem({ ...cur, order: sorted.after[id] ?? cur.order }, { ...cur, order }) : null;
      return op ? [op] : [];
    });
    setSorted(null);
    clearTimeout(sortTimer.current);
    if (ops.length) await commit(ops, '정렬 전 순서로 되돌렸어요');
  };
  useEffect(() => () => clearTimeout(sortTimer.current), []);

  /* ---------- 끌어서 순서 바꾸기 (포인터 이벤트: 마우스·터치 같이) ---------- */
  const drag = useRef<{ id: string; el: HTMLElement; rows: HTMLElement[]; y0: number; s0: number; at: number; from: number; moved: boolean } | null>(null);
  const clearDrop = (d: NonNullable<typeof drag.current>) => d.rows.forEach((r) => r.classList.remove('drop-before', 'drop-after'));
  const onGripDown = (e: React.PointerEvent<HTMLElement>, id: string) => {
    if (e.button !== 0 || busy) return;
    const el = e.currentTarget.closest('li') as HTMLElement;
    const all = [...(el.parentElement?.querySelectorAll<HTMLElement>(':scope > li[data-item]:not(.is-remove)') ?? [])];
    if (all.length < 2) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const from = all.indexOf(el);
    drag.current = { id, el, rows: all, y0: e.clientY, s0: window.scrollY, at: from, from, moved: false };
  };
  const onGripMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    // 화면 끝 가까이 끌면 조금씩 스크롤
    if (e.clientY < 70) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
    const dy = e.clientY - d.y0 + (window.scrollY - d.s0);
    if (!d.moved && Math.abs(dy) < 5) return;
    if (!d.moved) {
      d.moved = true;
      d.el.classList.add('dragging');
    }
    d.el.style.transform = `translateY(${dy}px)`;
    const others = d.rows.filter((r) => r !== d.el);
    d.at = others.filter((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2 < e.clientY;
    }).length;
    clearDrop(d);
    if (d.at === d.from) return;
    if (d.at < others.length) others[d.at].classList.add('drop-before');
    else others[others.length - 1].classList.add('drop-after');
  };
  const onGripUp = (e: React.PointerEvent<HTMLElement>, cancel = false) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    clearDrop(d);
    d.el.classList.remove('dragging');
    d.el.style.transform = '';
    if (d.moved) {
      e.preventDefault();
      // 손을 뗀 뒤 따라오는 click이 줄 선택으로 번지지 않게
      const stop = (ev: Event) => ev.stopPropagation();
      window.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
    }
    if (cancel || !d.moved || d.at === d.from) return;
    const others = d.rows.filter((r) => r !== d.el).map((r) => view(r.dataset.item!)).filter(Boolean) as Item[];
    moveTo(d.id, others, d.at);
  };

  const conflicts = draft && !owner ? findConflicts(items, draft.ops) : [];
  const moved = draft ? plan.version - draft.baseVersion : 0;
  const hasSomeday = rows.some((r) => r.item.day == null);

  return (
    <section className="plan-route itinerary" id="itinerary">
      <div className="container">
        <header className="sec-head" data-reveal>
          <div>
            <p className="eyebrow">
              일정 · 가 볼 곳 · {live.filter((r) => r.item.kind !== 'move').length}곳{!owner ? ' · 고치면 제안이 돼요' : ''}
            </p>
            <h2>
              Places to <em>see</em>
            </h2>
          </div>
          <div className="route-tools">
            {route.total > 0 ? <span className="route-km mono">총 이동 {route.total.toFixed(1)}km</span> : null}
            {withPlace.length > 2 ? (
              <button type="button" className="btn btn--sm" onClick={optimize} disabled={busy}>
                ⟲ 동선 최적화
              </button>
            ) : null}
          </div>
        </header>
      </div>
      <div className="container">
        <SuggQueue groups={groups} items={items} plan={plan} owner={owner} mine={mineSet} ctl={ctl} show={showSugg} setShow={setShowSugg} jump={jump} />
      </div>
      {plan.days > 1 ? (
        <div className="container">
          <nav className="itin-jump" aria-label="날짜로 바로 가기">
            <span className="ij-lbl mono" aria-hidden="true">
              DAY
            </span>
            {days
              .filter((d) => d != null || hasSomeday)
              .map((d) => {
                const n = live.filter((r) => r.item.day === d).length;
                const dl = dayLabel(plan, d);
                return (
                  <button
                    key={dayKey(d)}
                    type="button"
                    className={`ij-chip${closed.has(dayKey(d)) ? '' : ' is-open'}`}
                    style={{ '--dc': dayColor(d) } as React.CSSProperties}
                    onClick={() => goDay(d)}
                    aria-label={`${dl.code} ${dl.text}로 가기${n ? ` · ${n}곳` : ''}`}
                  >
                    <span className="mono">{d == null ? '미정' : String(d).padStart(2, '0')}</span>
                  </button>
                );
              })}
          </nav>
        </div>
      ) : null}
      <div className="route-grid container">
        <div className="itin">
          {days.map((day) => {
            const list = rows.filter((r) => r.item.day === day);
            const dl = dayLabel(plan, day);
            const ghosts = showSugg ? ghostsByDay.get(day) || [] : [];
            if (day == null && !list.length && !ghosts.length)
              return (
                <div key="someday" className="itin-day cand">
                  <button type="button" className="itin-add" onClick={() => setEdit({ item: null, day: null })}>
                    + 날짜 미정 · 언젠가 가 볼 곳 적어 두기
                  </button>
                </div>
              );
            const liveList = list.filter((r) => r.mark !== 'remove');
            const cost = costSum(liveList.map((r) => r.item));
            // 그날 마지막 숙소 = 오늘 밤 묵는 곳
            const tonight = day == null ? undefined : [...liveList].reverse().find((r) => r.item.kind === 'stay')?.item;
            const isClosed = closed.has(dayKey(day));
            const bodyId = `day-body-${dayKey(day)}`;
            return (
              <div key={dayKey(day)} id={`day-${dayKey(day)}`} className={`itin-day${day == null ? ' cand' : ''}${isClosed ? ' is-closed' : ''}`} style={{ '--dc': dayColor(day) } as React.CSSProperties}>
                <h3 className="itin-day-head">
                  <button type="button" className="itin-fold" aria-expanded={!isClosed} aria-controls={bodyId} onClick={() => toggleDay(day)}>
                    <span className="mono">{dl.code}</span>
                    <b>{dl.text}</b>
                    <small className="faint">
                      {[liveList.some((r) => r.item.kind !== 'move') ? `${liveList.filter((r) => r.item.kind !== 'move').length}곳` : '', cost, tonight ? `🛏 ${tonight.title}` : ''].filter(Boolean).join(' · ')}
                    </small>
                    <span className="itin-chev" aria-hidden="true" />
                  </button>
                  {/* 같은 버튼이 "시간순"에서 "되돌리기"로 바뀐다 (키보드 포커스가 그대로 남게) */}
                  {(sorted && sorted.day === day) || (day != null && outOfOrder(day)) ? (
                    <button
                      key={`sort-${dayKey(day)}`}
                      type="button"
                      className={`time-sort${sorted && sorted.day === day ? ' is-undo' : ''}`}
                      onClick={() => (sorted && sorted.day === day ? unsort() : sortByTime(day))}
                      disabled={busy}
                    >
                      {sorted && sorted.day === day ? '↩ 되돌리기' : '⏱ 시간순'}
                    </button>
                  ) : null}
                </h3>
                <div id={bodyId} className="itin-body" hidden={isClosed}>
                  <ol className="route-list" role="list">
                    {(() => {
                      // 시간이 있는 추가 제안은 그 시간 자리에, 나머지는 그날 끝에 (우선순위 순)
                      const at = new Map<number, PendingGroup[]>();
                      const tail: PendingGroup[] = [];
                      for (const g of ghosts) {
                        const t = g.primary.op.type === 'add' ? g.primary.op.item.time : '';
                        const pos = t ? list.findIndex((r) => r.item.time && r.item.time > t) : -1;
                        if (pos < 0) tail.push(g);
                        else at.set(pos, [...(at.get(pos) || []), g]);
                      }
                      const ghost = (g: PendingGroup) => <GhostRow key={g.key} g={g} owner={owner} mine={mineSet} ctl={ctl} onFocus={() => setFocus(null)} />;
                      // 장소만 번호를 단다. 예전 '이동' 줄은 장소 사이 연결 줄로 보인다
                      const stopNo = new Map(list.filter((r) => r.item.kind !== 'move').map((r, k) => [r.item.id, k]));
                      /** 앞 장소 → 다음 장소 연결 줄: 가는 방법 · 구글 길찾기 (예전 이동 줄의 시각·요금은 작게) */
                      const legOf = (from: Item | null, moves: Row[], to: Row | null) => {
                        const live = moves.filter((m) => m.mark !== 'remove');
                        const dest = to?.item.place || [...live].reverse().find((m) => m.item.place)?.item.place || null;
                        if (!from && !moves.length) return null;
                        if (!moves.length && (!from?.place || !dest)) return null;
                        // 가는 방법은 도착 직전 구간 기준 (비행기로 내린 뒤 열차를 타면 열차)
                        const go: GoMode = to?.item.go || guessGo(live.slice(-1).map((m) => m.item));
                        const g = go ? GO[go as Exclude<GoMode, ''>] : null;
                        // 출발지: 앞 장소, 없으면(여행 첫 구간) 앞선 이동 줄의 도착지 (비행기 → 공항)
                        // (김포 → 비행기 → 하네다 → 열차 → 텐세이엔이면 길찾기는 하네다에서)
                        const origin = (live.length > 1 ? live[live.length - 2].item.place : null) || from?.place || null;
                        const km = to && to.mark !== 'remove' ? route.gap.get(to.item.id) : undefined;
                        const dir = origin && dest && go !== 'flight' ? googleDirections(origin, dest, g?.gmode) : null;
                        const first = moves[0]?.item;
                        const canMode = !!to && !(to.mark && !owner) && to.mark !== 'remove';
                        const nextGo = GO_ORDER[(GO_ORDER.indexOf(go) + 1) % GO_ORDER.length];
                        return (
                          <li key={`leg-${moves[0]?.item.id || ''}-${to?.item.id || 'end'}`} className={`ri-leg${moves.some((m) => m.mark) ? ` is-${moves.find((m) => m.mark)!.mark}` : ''}`} data-leg={first?.id || ''}>
                            <span className="leg-rail" aria-hidden="true" />
                            {canMode ? (
                              <button
                                type="button"
                                className="leg-mode"
                                onClick={() => {
                                  const op = diffItem(to!.item, { ...to!.item, go: nextGo });
                                  if (op) commit([op], nextGo ? `${GO[nextGo as Exclude<GoMode, ''>].label}로 바꿨어요` : '가는 방법을 비웠어요');
                                }}
                                aria-label={`가는 방법: ${g ? g.label : '정하지 않음'} (누르면 바꿔요)`}
                                title="눌러서 가는 방법 바꾸기"
                              >
                                {g ? g.icon : '·'}
                              </button>
                            ) : (
                              <span className="leg-mode" aria-hidden="true">
                                {g ? g.icon : '·'}
                              </span>
                            )}
                            <span className="leg-text">
                              {live.map((m) => (
                                <button key={m.item.id} type="button" className="leg-move" onClick={() => setEdit({ item: m.item, day: m.item.day })} title={m.item.memo || m.item.title}>
                                  {timeText(m.item) ? <span className="mono">{timeText(m.item)}</span> : null}
                                  <span className="leg-title">{m.item.title}</span>
                                  {m.item.tag ? <span className={`ri-tag t-${m.item.tag}`}>{TAGS[m.item.tag].icon}</span> : null}
                                  {m.item.cost ? <span className="mono faint">{money(m.item)}</span> : null}
                                </button>
                              ))}
                              {!to && dest ? <span className="leg-dest">→ {dest.name}</span> : null}
                              {!live.length && km != null && km >= 0.05 ? <span className="leg-km mono">{distanceLabel(km)}</span> : null}
                            </span>
                            {dir ? (
                              <a className="leg-dir" href={dir} target="_blank" rel="noopener noreferrer" aria-label={`${from?.title || ''}에서 ${to?.item.title || dest?.name || ''}까지 구글 길찾기`}>
                                길찾기
                              </a>
                            ) : null}
                            {owner && live.length === 1 ? (
                              <button type="button" className="ri-btn leg-del" onClick={() => remove(live[0].item.id)} aria-label={`${live[0].item.title} 지우기`}>
                                ✕
                              </button>
                            ) : null}
                          </li>
                        );
                      };
                      const rowOf = (r: Row, i: number) => {
                        const it = r.item;
                        const far = r.mark !== 'remove' && route.warn.has(it.id);
                        const li = liveList.indexOf(r);
                        const fixed = !!r.mark && !owner; // 바구니에서 고친 줄: 되돌리기·고치기만
                        const no = day == null ? '··' : String((stopNo.get(it.id) ?? i) + 1).padStart(2, '0');
                        const isMove = it.kind === 'move';
                        const tag = it.tag ? TAGS[it.tag] : null;
                        const badges = (
                          <>
                            {tag ? (
                              <span className={`ri-tag t-${it.tag}`}>
                                <span aria-hidden="true">{tag.icon}</span> {tag.label}
                              </span>
                            ) : null}
                            {r.mark ? <span className={`ri-badge ${r.mark}`}>{r.mark === 'add' ? '추가 예정' : r.mark === 'remove' ? '삭제 예정' : '수정 예정'}</span> : null}
                            {far ? (
                              <span className="ri-far" title={`앞뒤 일정과 ${FAR_KM}km 넘게 떨어져 있어요. 장소를 다시 골라 보세요. 총 이동 거리와 지도 선에서는 뺐어요.`}>
                                ⚠ 멀리 떨어진 장소 <small>· 거리·지도 선에서 뺐어요</small>
                              </span>
                            ) : null}
                          </>
                        );
                        return (
                          <li
                            key={it.id}
                            data-item={it.id}
                            className={`route-item${r.mark ? ` is-${r.mark}` : ''}${focus === it.id ? ' on' : ''}${isMove ? ' is-move' : ''}${it.kind === 'stay' ? ' is-stay' : ''}${tonight?.id === it.id ? ' is-tonight' : ''}${far ? ' is-far' : ''}`}
                            onClick={() => focusItem(it.id)}
                          >
                            {fixed || r.mark === 'remove' ? (
                              <span className="route-no mono">{no}</span>
                            ) : (
                              <button
                                type="button"
                                className="route-no ri-grip mono"
                                aria-label={`${it.title} 순서 옮기기 (끌거나 ↑↓ 키)`}
                                title="끌어서 순서 바꾸기"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => onGripDown(e, it.id)}
                                onPointerMove={onGripMove}
                                onPointerUp={(e) => onGripUp(e)}
                                onPointerCancel={(e) => onGripUp(e, true)}
                                onKeyDown={(e) => {
                                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    move(it.id, e.key === 'ArrowUp' ? -1 : 1);
                                  }
                                }}
                              >
                                <span className="ri-no">{no}</span>
                                <span className="ri-dots" aria-hidden="true" />
                              </button>
                            )}
                            {isMove ? (
                              <div className="ri-body">
                                {/* 이동: 제목이 먼저 (두 줄까지), 요금·메모는 아래 줄. 긴 경로 메모는 눌러서 펼친다 */}
                                <div className="ri-title ri-line">
                                  {timeText(it) ? <span className="ri-when mono">{timeText(it)}</span> : null}
                                  <strong>
                                    {KINDS.move.icon} {it.title}
                                  </strong>
                                </div>
                                {it.cost || it.memo ? (
                                  (() => {
                                    const first = it.memo.split('\n')[0];
                                    const long = it.memo.includes('\n') || it.memo.length > 48;
                                    const cost = it.cost ? <span className="ri-cost mono">{money(it)}</span> : null;
                                    return long ? (
                                      <details className="ri-more" onClick={(e) => e.stopPropagation()}>
                                        <summary>
                                          {cost}
                                          <span className="ri-memo faint">{first}</span>
                                        </summary>
                                        <p className="ri-memo-full">{it.memo}</p>
                                      </details>
                                    ) : (
                                      <div className="ri-sub">
                                        {cost}
                                        {it.memo ? <span className="ri-memo faint">{it.memo}</span> : null}
                                      </div>
                                    );
                                  })()
                                ) : null}
                                {tag || r.mark || far ? <div className="ri-flags">{badges}</div> : null}
                              </div>
                            ) : (
                              <div className="ri-body">
                                {tonight?.id === it.id ? <p className="ri-tonight">🛏 오늘 밤 묵는 곳</p> : null}
                                {/* 시각이 먼저, 이름은 짧게. 거리는 앞 연결 줄로 옮겼다 */}
                                <div className="ri-title">
                                  {timeText(it) ? <span className="ri-time mono">{timeText(it)}</span> : null}
                                  <strong>
                                    {KINDS[it.kind].icon} {it.title}
                                  </strong>{' '}
                                  {badges}
                                </div>
                                {(it.place && it.place.name !== it.title) || it.cost ? (
                                  <p className="ri-meta">{[it.place && it.place.name !== it.title ? `📍 ${it.place.name}` : '', money(it)].filter(Boolean).join(' · ')}</p>
                                ) : null}
                                {it.memo ? (
                                  (() => {
                                    const long = it.memo.includes('\n') || it.memo.length > 60;
                                    const open = openMemo.has(it.id);
                                    return (
                                      <p
                                        className={`ri-note${long ? ' is-long' : ''}${open ? ' is-open' : ''}`}
                                        onClick={
                                          long
                                            ? (e) => {
                                                e.stopPropagation();
                                                setOpenMemo((m) => {
                                                  const n = new Set(m);
                                                  if (n.has(it.id)) n.delete(it.id);
                                                  else n.add(it.id);
                                                  return n;
                                                });
                                              }
                                            : undefined
                                        }
                                        title={long ? (open ? '접기' : '메모 펼치기') : undefined}
                                      >
                                        {it.memo}
                                      </p>
                                    );
                                  })()
                                ) : null}
                              </div>
                            )}
                            <div className="ri-actions" onClick={(e) => e.stopPropagation()}>
                              {it.place && r.mark !== 'remove' ? (
                                <a className="ri-btn ri-gmap" href={googleMapsAt(it.place.lat, it.place.lng)} target="_blank" rel="noopener noreferrer" aria-label={`${it.title} Google 지도에서 보기`} title="Google 지도에서 보기">
                                  G
                                </a>
                              ) : null}
                              {fixed ? (
                                <>
                                  <button type="button" className="link-u" onClick={() => undo(it.id)}>
                                    되돌리기
                                  </button>
                                  {r.mark !== 'remove' ? (
                                    <button type="button" className="ri-btn" onClick={() => setEdit({ item: it, day: it.day })} aria-label="고치기">
                                      ✎
                                    </button>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  {li > 0 ? (
                                    <button type="button" className="ri-btn ri-up" onClick={() => move(it.id, -1)} aria-label="위로">
                                      ↑
                                    </button>
                                  ) : null}
                                  {li >= 0 && li < liveList.length - 1 ? (
                                    <button type="button" className="ri-btn ri-down" onClick={() => move(it.id, 1)} aria-label="아래로">
                                      ↓
                                    </button>
                                  ) : null}
                                  <button type="button" className="ri-btn" onClick={() => setEdit({ item: it, day: it.day })} aria-label="고치기">
                                    ✎
                                  </button>
                                  <button type="button" className="ri-btn" onClick={() => remove(it.id)} aria-label="지우기">
                                    ✕
                                  </button>
                                </>
                              )}
                            </div>
                            {r.mark !== 'remove' ? (
                              <button
                                type="button"
                                className="ri-below"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addBelow(it);
                                }}
                                aria-label={`${it.title} 아래에 일정 추가`}
                                title="이 아래에 추가"
                              >
                                +
                              </button>
                            ) : null}
                          </li>
                        );
                      };
                      // 첫 장소는 전날 마지막 장소(묵은 곳)에서 이어진다
                      let prev: Item | null = day == null ? null : lastStopBefore(day);
                      let pend: Row[] = [];
                      const out: React.ReactNode[] = [];
                      list.forEach((r, i) => {
                        out.push(...(at.get(i) || []).map(ghost));
                        if (r.item.kind === 'move' && day != null) {
                          pend.push(r);
                          return;
                        }
                        if (day != null) out.push(legOf(prev, pend, r));
                        out.push(rowOf(r, i));
                        const strips = showSugg ? stripsByItem.get(r.item.id) : undefined;
                        if (strips?.length) out.push(<SuggStrips key={`s-${r.item.id}`} groups={strips} items={items} owner={owner} mine={mineSet} ctl={ctl} />);
                        if (r.item.place && r.mark !== 'remove') prev = r.item;
                        pend = [];
                      });
                      if (pend.length) out.push(legOf(prev, pend, null));
                      out.push(...tail.map(ghost));
                      return out;
                    })()}
                  </ol>
                  <button type="button" className="itin-add" onClick={() => setEdit({ item: null, day })}>
                    + {day == null ? '후보 추가' : `${dl.code}에 일정 추가`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="route-map-wrap">
          <div className="route-map" ref={mapEl} aria-label="일정 지도" />
          <div className="map-loading mono">지도를 불러오는 중…</div>
          {mapDays.length > 1 ? (
            <div className="map-days" role="radiogroup" aria-label="지도에 보일 날">
              <button type="button" role="radio" aria-checked={mapDay === 'all'} onClick={() => (mapDay === 'all' ? drawRef.current?.(true) : setMapDay('all'))} title="모든 장소가 보이게">
                전체
              </button>
              {mapDays.map((d) => (
                <button key={dayKey(d)} type="button" role="radio" aria-checked={mapDay === d} onClick={() => setMapDay(mapDay === d ? 'all' : d)} style={{ '--dc': dayColor(d) } as React.CSSProperties}>
                  <i aria-hidden="true" />
                  {d == null ? '후보' : `DAY ${String(d).padStart(2, '0')}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* 제안 바구니 */}
      {!owner && draft && draft.ops.length ? (
        <div className="basket" role="region" aria-label="제안 바구니">
          <span className="basket-ico" aria-hidden="true">
            🧺
          </span>
          <div className="basket-text">
            <b>제안 바구니</b>
            <small className="mono">
              {opCounts(draft.ops)}
              {moved > 0 ? ` · 그 사이 계획이 ${moved}번 바뀜` : ''}
              {conflicts.length ? ` · ⚠ 겹치는 변경 ${conflicts.length}` : ''}
            </small>
          </div>
          <button
            type="button"
            className="btn btn--sm basket-clear"
            onClick={() => {
              if (!confirm('아직 보내지 않은 변경을 모두 버릴까요?')) return;
              setDraft(null);
              saveDraft(plan.id, null);
            }}
          >
            비우기
          </button>
          <button type="button" className="btn btn--sm btn--solid" onClick={() => setSending(true)}>
            제안 보내기 →
          </button>
        </div>
      ) : null}

      <ItemModal
        key={edit?.key ?? 0}
        open={!!edit}
        plan={plan}
        item={edit?.item ?? null}
        day={edit ? edit.day : 1}
        owner={owner}
        // "이 아래에 추가"면 그 자리 order로 (order prop을 모르는 일정 창이어도 같은 자리에 들어가게)
        nextOrder={(d) => (edit && !edit.item && edit.order != null && d === edit.day ? edit.order : nextOrder(d))}
        order={edit?.order}
        near={(() => {
          // 장소 검색은 그날 마지막으로 장소가 있는 일정 근처부터 (없으면 계획 목적지)
          const d = edit?.item?.day ?? edit?.day ?? null;
          const last = [...rows].reverse().find((r) => r.item.day === d && r.item.place && r.item.id !== edit?.item?.id && (edit?.order == null || r.item.order < edit.order));
          return last ? ([last.item.place!.lat, last.item.place!.lng] as [number, number]) : null;
        })()}
        onSaveNext={async (next) => {
          const out = placeNew(next);
          // 저장이 실패하면 false → 일정 창이 적은 내용을 그대로 둔다
          if (!(await commit([{ type: 'add', item: out }], owner ? '추가했어요 · 다음 일정을 적어 주세요' : undefined))) return false;
          // 이어서 적는 일정은 방금 넣은 일정 바로 아래로
          if (edit?.order != null && out.day === edit.day) setEditState((e) => (e ? { ...e, order: e.upper != null ? (out.order + e.upper) / 2 : out.order + 1 } : e));
          return true;
        }}
        onClose={() => setEdit(null)}
        onSave={(next) => {
          const cur = edit?.item;
          if (!cur) {
            const out = placeNew(next);
            setEdit(null);
            commit([{ type: 'add', item: out }], owner ? '추가했어요' : undefined);
          } else {
            setEdit(null);
            const op = diffItem(cur, next);
            if (op) commit([op], owner ? '고쳤어요' : undefined);
          }
        }}
      />

      <SendModal
        open={sending}
        plan={plan}
        items={items}
        draft={draft}
        onClose={() => setSending(false)}
        onSent={(no) => {
          setSending(false);
          setDraft(null);
          saveDraft(plan.id, null);
          rememberPlan(plan.id);
          broadcast(plan.id);
          toast(`제안 #${no}을 보냈어요. 일정 위에 반투명하게 보여요`, '📮');
          router.refresh();
          requestAnimationFrame(() => document.getElementById('itinerary')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }}
      />

      <NameModal
        open={!!askName}
        onClose={(name) => {
          const cb = askName;
          setAskName(null);
          cb?.(name);
        }}
      />
    </section>
  );

  /** 새 일정의 자리: "이 아래에 추가"면 그 자리, 창에서 날짜를 바꿨으면 그날 끝 */
  function placeNew(next: Item): Item {
    if (edit?.order != null && next.day === edit.day) return { ...next, order: edit.order };
    if (edit && next.day !== edit.day) return { ...next, order: nextOrder(next.day) };
    return next;
  }
}

function SendModal({ open, plan, items, draft, onClose, onSent }: { open: boolean; plan: Plan; items: Item[]; draft: Draft | null; onClose: () => void; onSent: (no: number) => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && draft) setTitle(describeOps(draft.ops, items));
  }, [open, draft, items]);
  if (!draft) return null;
  const conflicts = findConflicts(items, draft.ops);
  return (
    <Modal open={open} title="제안 보내기" onClose={onClose} wide>
      <form
        className="item-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await propose(plan.id, { authorName: myName() || '승객', title, message, baseVersion: draft.baseVersion, ops: draft.ops });
          setBusy(false);
          if (!r.ok) return toast(r.error, '!');
          onSent(r.data.no);
        }}
      >
        <label className="lbl">
          제목
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </label>
        <label className="lbl">
          하고 싶은 말 <span className="faint">(선택)</span>
          <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} placeholder="왜 이렇게 바꾸면 좋을지 적어 주면 기장이 판단하기 쉬워요" />
        </label>
        <p className="lbl-title">변경 {draft.ops.length}개</p>
        <div className="opcards">
          {draft.ops.map((op, i) => (
            <OpCard key={i} op={op} plan={plan} items={items} conflict={conflicts.find((c) => c.op === i)} />
          ))}
        </div>
        <p className="hint">보낸 뒤에는 기장이 수락해야 반영돼요. 그 전까지는 철회할 수 있어요.</p>
        <div className="modal-actions">
          <button type="submit" className="btn btn--solid" disabled={busy}>
            📮 {plan.ownerName}님에게 제안
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NameModal({ open, onClose }: { open: boolean; onClose: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <Modal open={open} title="어떻게 불러 드릴까요?" onClose={() => onClose('')}>
      <form
        className="item-form"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim().slice(0, 20);
          if (!n) return;
          try {
            localStorage.setItem('sdt:name', n);
          } catch {}
          onClose(n);
        }}
      >
        <p className="muted">제안에 이름이 붙어요. 기장이 누가 낸 제안인지 알 수 있게요.</p>
        <input className="inp" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 준호" autoFocus maxLength={20} />
        <div className="modal-actions">
          <button type="submit" className="btn btn--solid">
            좋아요
          </button>
        </div>
      </form>
    </Modal>
  );
}
