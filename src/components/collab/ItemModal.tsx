'use client';
// 일정 추가·수정 창. 작성 화면과 같은 부품을 쓴다: DAY 칩, 시간 고르기, 자동완성 장소 검색, 금액 입력.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Item, ItemTag, Kind, Place, Plan } from '@/lib/types';
import { KINDS, TAGS } from '@/lib/proposals';
import { curOf, fmtMoney, toKRW } from '@/lib/money';
import { reverse, nameOf, enOf } from '@/blog/geo.js';
import { loadLeaflet, createMap, destroyMap, pinIcon } from '@/blog/leaflet.js';
import { krwPer } from '@/blog/live.js';
import Modal from './Modal';
import { dayLabel, km, toast } from './util';

type Hit = { name: string; en?: string; address?: string; lat: number; lng: number; kind: string };

const manwon = (n: number) => {
  if (!n) return '';
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  if (!man) return `${n.toLocaleString('ko-KR')}원`;
  return `${man.toLocaleString('ko-KR')}만${rest ? ` ${rest.toLocaleString('ko-KR')}` : ''} 원`;
};

// 이보다 멀면 고르기 전에 한 번 묻는다 (동명 장소가 다른 도시에서 잡히는 일이 잦다)
const FAR_KM = 300;

/** 장소: 입력하는 동안 찾고(↑↓ Enter), 안 나오면 지도에서 찍는다 */
function PlaceField({
  value,
  onChange,
  near,
  anchors,
}: {
  value: Place | null;
  onChange: (p: Place | null) => void;
  near: [number, number] | null;
  /** 여행지 기준점들. 고른 장소가 모두에서 FAR_KM보다 멀면 확인을 받는다 */
  anchors: [number, number][];
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [msg, setMsg] = useState('');
  const [at, setAt] = useState(0);
  const [open, setOpen] = useState(false);
  const [far, setFar] = useState<{ hit: Hit; dist: number } | null>(null);
  const [pick, setPick] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const boxEl = useRef<HTMLDivElement>(null);
  const inputEl = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits(null);
      setMsg('');
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setMsg('찾는 중…');
      try {
        const u = new URLSearchParams({ q: q.trim(), mode: 'poi' });
        if (near) {
          u.set('lat', String(near[0]));
          u.set('lng', String(near[1]));
        }
        const r = await fetch(`/api/places?${u}`, { signal: ctrl.signal });
        if (r.status === 429) return setMsg('검색을 너무 자주 했어요. 30초 뒤에 다시 찾아 주세요.');
        const { hits: h } = (await r.json()) as { hits: Hit[] };
        setHits(h);
        setAt(0);
        setMsg(h.length ? '' : '결과가 없어요. 영문으로 찾거나 지도에서 직접 찍어 보세요.');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setMsg('검색하지 못했어요. 잠시 뒤 다시 해 주세요.');
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, near]);

  // 목록 바깥을 누르면 닫는다 (저장 버튼을 덮지 않게)
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!boxEl.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [open]);

  const take = (h: Hit) => {
    onChange({ name: h.name, en: h.en || undefined, address: h.address, lat: +h.lat.toFixed(5), lng: +h.lng.toFixed(5) });
    setQ('');
    setHits(null);
    setMsg('');
    setFar(null);
    setOpen(false);
  };
  const choose = (h: Hit) => {
    const dist = anchors.length ? Math.min(...anchors.map(([lat, lng]) => km({ lat, lng }, h))) : 0;
    if (dist > FAR_KM) {
      setFar({ hit: h, dist });
      setOpen(false);
      return;
    }
    take(h);
  };
  const retry = () => {
    setFar(null);
    inputEl.current?.focus();
    if (hits?.length) setOpen(true);
  };

  useEffect(() => {
    if (!pick) return;
    let map: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let marker: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    let alive = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadLeaflet().then((L: any) => {
      if (!alive || !mapEl.current) return;
      map = createMap(L, mapEl.current, { scrollWheelZoom: true });
      const c = value ? [value.lat, value.lng] : near;
      map.setView(c || [37.5665, 126.978], c ? 14 : 11);
      if (value) marker = L.marker([value.lat, value.lng], { icon: pinIcon(L, { label: '★', kind: 'is-plan' }) }).addTo(map);
      map.on('click', async (ev: { latlng: { lat: number; lng: number } }) => {
        const lat = +ev.latlng.lat.toFixed(5);
        const lng = +ev.latlng.lng.toFixed(5);
        marker?.remove();
        marker = L.marker([lat, lng], { icon: pinIcon(L, { label: '★', kind: 'is-plan' }) }).addTo(map);
        onChange({ name: '찾는 중…', lat, lng });
        try {
          const g = await reverse([lat, lng]);
          if (alive) onChange({ name: nameOf(g), en: enOf(g) || undefined, address: g.display_name?.split(', ').slice(0, 4).join(', '), lat, lng });
        } catch {
          if (alive) onChange({ name: `${lat}, ${lng}`, lat, lng });
        }
      });
    });
    return () => {
      alive = false;
      destroyMap(map);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick]);

  const listId = 'item-place-list';
  const shown = open && !!(hits?.length || msg);
  return (
    <div className="place-field">
      {value ? (
        <div className="place-chosen">
          <span>📍</span>
          <span>
            <b>{value.name}</b>
            {value.address ? <small>{value.address}</small> : null}
          </span>
          <button type="button" className="icon-btn" onClick={() => onChange(null)} aria-label="장소 지우기">
            ✕
          </button>
        </div>
      ) : null}
      <div className="ac" ref={boxEl}>
        <label className="field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputEl}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              // 지난 검색어의 결과를 잘못 누르지 않게 바로 비운다
              setHits(null);
              setFar(null);
              setOpen(true);
            }}
            onFocus={() => q.trim().length >= 2 && setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              // Esc는 목록(또는 먼 장소 확인)만 닫고 창은 그대로 둔다
              if (e.key === 'Escape' && (shown || far)) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setFar(null);
                return;
              }
              if (!hits?.length) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (!open) return setOpen(true);
                setAt((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
              } else if (e.key === 'Enter' && open) {
                e.preventDefault();
                choose(hits[at]);
              }
            }}
            placeholder={value ? '다른 장소로 바꾸기' : '장소 찾기 (예: 후시미 이나리, 망원시장)'}
            aria-label="장소 검색"
            role="combobox"
            aria-expanded={shown}
            aria-controls={listId}
            aria-autocomplete="list"
          />
        </label>
        {shown ? (
          <ul className="ac-list" id={listId} role="listbox">
            {msg ? <li className="ac-msg">{msg}</li> : null}
            {hits?.map((h, i) => (
              <li key={i} role="option" aria-selected={i === at} data-i={i} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(h)}>
                <span className="ac-ico">{h.kind === 'region' ? '🗺️' : '📍'}</span>
                <span className="ac-txt">
                  <b>
                    {h.name} {h.en && h.en !== h.name ? <span className="serif faint">{h.en}</span> : null}
                  </b>
                  <small>{h.address}</small>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {far ? (
        <div className="far-warn" role="alert">
          <p>
            <b>{far.hit.name}</b>
            {far.hit.address ? <small>{far.hit.address}</small> : null}
            <span>여행지에서 약 {Math.round(far.dist).toLocaleString('ko-KR')}km 떨어진 곳이에요</span>
          </p>
          <div className="far-actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={retry}>
              다시 찾기
            </button>
            <button type="button" className="btn btn--solid btn--sm" onClick={() => take(far.hit)}>
              그래도 이 장소
            </button>
          </div>
        </div>
      ) : null}
      <button type="button" className="link-u faint pick-toggle" onClick={() => setPick((v) => !v)}>
        {pick ? '지도 닫기' : '🗺 검색에 안 나오면 지도에서 직접 찍기'}
      </button>
      {pick ? <div className="pick-map" ref={mapEl} /> : null}
    </div>
  );
}

const QUICK_TIMES: [string, string][] = [
  ['아침', '09:00'],
  ['점심', '12:00'],
  ['오후', '15:00'],
  ['저녁', '18:30'],
  ['밤', '21:00'],
];
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const hourText = (x: string) => (Number(x) < 12 ? `오전 ${Number(x) || 12}시` : `오후 ${Number(x) - 12 || 12}시`);

/** 시·분 고르기 한 쌍. 분은 00–59 아무거나 */
function HM({ value, onChange, label, none }: { value: string; onChange: (v: string) => void; label: string; none: string }) {
  const [h, m] = value ? value.split(':') : ['', ''];
  const set = (hh: string, mm: string) => onChange(hh ? `${hh}:${mm || '00'}` : '');
  return (
    <div className="tp-selects">
      <select className="inp tp-sel tp-h" value={h} onChange={(e) => set(e.target.value, m)} aria-label={`${label}시`}>
        <option value="">{none}</option>
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {hourText(x)}
          </option>
        ))}
      </select>
      <select className="inp tp-sel tp-m" value={m || '00'} onChange={(e) => set(h, e.target.value)} disabled={!h} aria-label={`${label}분`}>
        {MINUTES.map((x) => (
          <option key={x} value={x}>
            {x}분
          </option>
        ))}
      </select>
    </div>
  );
}

/** 시간: 시작(필수 아님) – 끝(선택) + 빠른 칩 (기본 시간 입력은 디자인과 안 맞아서) */
function TimePick({ value, end, onChange, onEnd }: { value: string; end: string; onChange: (v: string) => void; onEnd: (v: string) => void }) {
  return (
    <div className="time-pick">
      <div className="tp-range">
        <HM value={value} onChange={onChange} label="" none="시간 없음" />
        <span className="tp-end">
          <span className="tp-dash" aria-hidden="true">
            끝
          </span>
          <HM value={end} onChange={onEnd} label="끝 " none="없음" />
        </span>
      </div>
      <div className="chips tp-quick">
        {QUICK_TIMES.map(([label, t]) => (
          <button key={t} type="button" className="chip" aria-pressed={value === t} onClick={() => onChange(value === t ? '' : t)}>
            {label} <span className="mono faint">{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// 소수점을 쓰지 않는 통화 (money.ts와 같게)
const WHOLE = new Set(['KRW', 'JPY', 'VND', 'IDR', 'TWD']);
const CUR_UNIT: Record<string, string> = { KRW: '원', JPY: '엔', USD: '달러', EUR: '유로', CNY: '위안', TWD: '대만달러', HKD: '홍콩달러', THB: '바트', VND: '동', GBP: '파운드' };
const unitOf = (c: string) => CUR_UNIT[c] ?? c;
const withCommas = (s: string) => {
  const [i, f] = s.split('.');
  return (i ? Number(i).toLocaleString('ko-KR') : f != null ? '0' : '') + (f != null ? `.${f}` : '');
};

/** 비용: 금액 + 통화(원화 ↔ 계획 통화). 현지 통화면 원화 환산을 아래에 */
function CostField({ cost, cur, curs, onChange }: { cost: number | null; cur: string; curs: string[]; onChange: (cost: number | null, cur: string) => void }) {
  const c = curOf(cur);
  const [text, setText] = useState(cost ? String(cost) : '');
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    if (c === 'KRW') return;
    let alive = true;
    setRate(null);
    krwPer(c)
      .then((r: number) => alive && setRate(r))
      .catch(() => alive && setRate(null));
    return () => {
      alive = false;
    };
  }, [c]);
  const put = (raw: string, nc: string) => {
    const whole = WHOLE.has(nc);
    let s = raw.replace(/[^\d.]/g, '');
    if (whole) s = s.split('.')[0];
    else {
      const [i, ...f] = s.split('.');
      s = f.length ? `${i}.${f.join('').slice(0, 2)}` : i;
    }
    s = s.replace(/^0+(?=\d)/, '');
    setText(s);
    const n = Number(s);
    onChange(n ? Math.min(1e10, n) : null, nc === 'KRW' ? '' : nc);
  };
  const krw = cost && c !== 'KRW' ? toKRW(cost, c, rate) : null;
  return (
    <>
      <span className={`money${curs.length > 1 ? ' has-cur' : ''}`}>
        <input
          className="num"
          inputMode={WHOLE.has(c) ? 'numeric' : 'decimal'}
          value={withCommas(text)}
          onChange={(e) => put(e.target.value, c)}
          placeholder="0"
          aria-label="예상 비용"
        />
        {curs.length > 1 ? (
          <span className="cur-pick" role="radiogroup" aria-label="통화">
            {curs.map((x) => (
              <button key={x} type="button" role="radio" aria-checked={c === x} onClick={() => put(text, x)}>
                {unitOf(x)}
              </button>
            ))}
          </span>
        ) : (
          <span>{unitOf(c)}</span>
        )}
      </span>
      {cost ? (
        c === 'KRW' ? (
          <small className="faint money-hint">{manwon(cost)}</small>
        ) : krw != null ? (
          <small className="faint money-hint">≈ {fmtMoney(krw, 'KRW')}</small>
        ) : null
      ) : null}
    </>
  );
}

// 이름 앞에 시각을 적으면 시간 칸으로 옮긴다: "13:07 점심", "16:40-17:30 체크인"
const LEAD_TIME = /^\s*(\d{1,2}):([0-5]\d)(?:\s*[-–~→]\s*(\d{1,2}):([0-5]\d))?\s+(\S[\s\S]*)$/;
const hhmm = (h: string, m: string) => (Number(h) < 24 ? `${h.padStart(2, '0')}:${m}` : null);

export interface ItemModalProps {
  open: boolean;
  plan: Pick<Plan, 'target' | 'days' | 'coords' | 'currency' | 'via'>;
  item: Item | null;
  day: number | null;
  owner: boolean;
  onClose: () => void;
  onSave: (item: Item) => void;
  /** "저장하고 다음 일정": 저장하되 창은 닫지 않는다 (새 일정만). 없으면 버튼을 숨긴다 */
  onSaveNext?: (item: Item) => void;
  nextOrder: (day: number | null) => number;
  /** 장소 검색을 이 근처로 (그날 앞 일정의 장소 등). 없으면 계획 목적지 */
  near?: [number, number] | null;
  /** 이 일정 바로 아래에 넣기 (새 일정의 order를 정할 때 nextOrder 대신) */
  order?: number;
}

const newId = () => Math.random().toString(36).slice(2, 10);

export default function ItemModal({ open, plan, item, day, owner, onClose, onSave, onSaveNext, nextOrder, near, order }: ItemModalProps) {
  const planCur = plan.currency && plan.currency !== 'KRW' ? curOf(plan.currency) : '';
  const blank = (dd: number | null, ord: number): Item => ({
    id: newId(),
    day: dd,
    time: '',
    end: '',
    tag: '',
    cur: planCur,
    title: '',
    en: '',
    kind: 'see',
    place: null,
    memo: '',
    cost: null,
    order: ord,
  });
  const [d, setD] = useState<Item | null>(null);
  // 저장하고 다음: 폼을 새로 그리고, 직전에 넣은 일정의 날·order를 기억한다
  const [round, setRound] = useState(0);
  const last = useRef<{ day: number | null; order: number } | null>(null);
  const titleEl = useRef<HTMLInputElement>(null);
  const memoEl = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) return;
    last.current = null;
    setD(item ? { ...item } : blank(day, order ?? nextOrder(day)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, day]);
  // 메모 칸은 내용에 맞춰 늘어난다
  useLayoutEffect(() => {
    const el = memoEl.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [d?.memo, round]);
  if (!d) return <Modal open={false} title="" onClose={onClose}>{null}</Modal>;
  const set = (patch: Partial<Item>) => setD((cur) => (cur ? { ...cur, ...patch } : cur));
  const days = [...Array.from({ length: plan.days }, (_, i) => i + 1), null] as (number | null)[];
  const canNext = !item && !!onSaveNext;
  const anchors = [near, plan.coords, ...(plan.via ?? []).map((v) => v.coords)].filter((x): x is [number, number] => !!x);
  // 기존 통화가 지금 계획 통화와 다르면(계획 통화를 바꾼 뒤) 그것도 고를 수 있게
  const curs = [...new Set(['KRW', planCur, curOf(d.cur)].filter(Boolean))];

  /** 저장할 일정으로 다듬는다. 이름이 없으면 null */
  const build = (): Item | null => {
    if (!d.title.trim()) {
      toast('무엇을 할지 적어 주세요', '!');
      titleEl.current?.focus();
      return null;
    }
    // 새 일정은 저장하는 순간 새 id를 받는다 (직전에 고친 일정의 id가 남아 있으면 안 된다)
    const out: Item = { ...d, id: item ? item.id : newId(), title: d.title.trim(), en: d.en.trim(), memo: d.memo.trim() };
    if (item) {
      if (item.day !== out.day) out.order = nextOrder(out.day);
    } else if (last.current && last.current.day === out.day) {
      // 연속으로 넣을 때 순서가 겹치지 않게
      out.order = order != null ? last.current.order + 1 : Math.max(last.current.order + 1, nextOrder(out.day));
    } else if (out.day !== day || order == null) {
      out.order = nextOrder(out.day);
    } else out.order = order;
    return out;
  };
  const saveNext = () => {
    const out = build();
    if (!out || !onSaveNext) return;
    onSaveNext(out);
    last.current = { day: out.day, order: out.order };
    setD(blank(out.day, out.order + 1));
    setRound((r) => r + 1);
  };

  return (
    <Modal open={open} title={item ? '일정 고치기' : '일정 추가'} onClose={onClose} wide>
      <form
        key={round}
        className="item-form"
        onSubmit={(e) => {
          e.preventDefault();
          const out = build();
          if (out) onSave(out);
        }}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter: 저장하고 다음 (없으면 그냥 저장)
          if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (canNext) saveNext();
          else e.currentTarget.requestSubmit();
        }}
      >
        <label className="lbl">
          무엇을
          <input
            ref={titleEl}
            className="inp"
            value={d.title}
            onChange={(e) => {
              const v = e.target.value;
              const m = v.match(LEAD_TIME);
              const t = m && hhmm(m[1], m[2]);
              const en = m && m[3] ? hhmm(m[3], m[4]) : null;
              if (m && t && (!m[3] || en)) set({ title: m[5], time: t, ...(en ? { end: en } : {}) });
              else set({ title: v });
            }}
            placeholder="예: 후시미 이나리 새벽 등산"
            autoFocus
            maxLength={80}
          />
          {!item ? <small className="faint title-hint">시각부터 적으면 시간 칸에 들어가요 · 예: 13:07 점심</small> : null}
        </label>
        <div className="chips kind-chips" role="radiogroup" aria-label="종류">
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <button key={k} type="button" className="chip" role="radio" aria-checked={d.kind === k} onClick={() => set({ kind: k })}>
              {KINDS[k].icon} {KINDS[k].label}
            </button>
          ))}
        </div>
        <div className="lbl">
          언제
          <div className="chips day-chips" role="radiogroup" aria-label="날짜">
            {days.map((n) => (
              <button key={n ?? 'none'} type="button" className="chip" role="radio" aria-checked={d.day === n} onClick={() => set({ day: n })}>
                {n == null ? (
                  '날짜 미정'
                ) : (
                  <>
                    <b className="mono">{dayLabel(plan, n).code}</b>
                    {plan.target ? <span className="faint">{dayLabel(plan, n).text}</span> : null}
                  </>
                )}
              </button>
            ))}
          </div>
          <TimePick value={d.time} end={d.end || ''} onChange={(t) => set({ time: t })} onEnd={(t) => set({ end: t })} />
        </div>
        <div className="lbl">
          장소 <span className="faint">(선택)</span>
          <PlaceField
            value={d.place}
            near={near ?? plan.coords}
            anchors={anchors}
            onChange={(p) => setD((cur) => (cur ? { ...cur, place: p, en: p?.en || cur.en } : cur))}
          />
          <details className="adv en-adv">
            <summary>
              <span>영문 이름</span>
              <span className="adv-sum mono">{d.en || '장소를 고르면 자동으로'}</span>
            </summary>
            <input className="inp" value={d.en} onChange={(e) => set({ en: e.target.value })} placeholder="Fushimi Inari" maxLength={80} aria-label="영문 이름" />
          </details>
        </div>
        <div className="grid2">
          <label className="lbl">
            예상 비용 <span className="faint">(1인 기준, 선택)</span>
            <CostField cost={d.cost} cur={d.cur || ''} curs={curs} onChange={(cost, cur) => set({ cost, cur })} />
          </label>
          <div className="lbl">
            상태 <span className="faint">(선택)</span>
            <div className="chips tag-chips" role="radiogroup" aria-label="상태">
              {([['', { label: '없음', icon: '' }], ...Object.entries(TAGS)] as [ItemTag, { label: string; icon: string }][]).map(([k, t]) => (
                <button key={k || 'none'} type="button" className="chip" role="radio" aria-checked={(d.tag || '') === k} onClick={() => set({ tag: k })}>
                  {t.icon ? <span aria-hidden="true">{t.icon}</span> : null}
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="lbl">
          메모 <span className="faint">(선택)</span>
          <textarea
            ref={memoEl}
            className="textarea memo-ta"
            rows={2}
            value={d.memo}
            onChange={(e) => set({ memo: e.target.value })}
            placeholder="예: 새벽 6시 반 출발"
            maxLength={400}
          />
        </label>
        {!owner ? <p className="hint">💡 바로 바뀌지 않고 <b>제안 바구니</b>에 담겨요. 다 고친 뒤 한 번에 제안하세요.</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            취소
          </button>
          {canNext ? (
            <button type="button" className="btn btn--ghost save-next" onClick={saveNext} title="Ctrl+Enter">
              {owner ? '저장하고 다음 일정' : '담고 다음 일정'}
            </button>
          ) : null}
          <button type="submit" className="btn btn--solid">
            {owner ? '저장' : '바구니에 담기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
