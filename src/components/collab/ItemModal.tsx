'use client';
// 일정 추가·수정 창. 작성 화면과 같은 부품을 쓴다: DAY 칩, 시간 고르기, 자동완성 장소 검색, 금액 입력.
import { useEffect, useRef, useState } from 'react';
import type { Item, Kind, Place, Plan } from '@/lib/types';
import { KINDS } from '@/lib/proposals';
import { reverse, nameOf, enOf } from '@/blog/geo.js';
import { loadLeaflet, createMap, destroyMap, pinIcon } from '@/blog/leaflet.js';
import Modal from './Modal';
import { dayLabel, toast } from './util';

type Hit = { name: string; en?: string; address?: string; lat: number; lng: number; kind: string };

const manwon = (n: number) => {
  if (!n) return '';
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  if (!man) return `${n.toLocaleString('ko-KR')}원`;
  return `${man.toLocaleString('ko-KR')}만${rest ? ` ${rest.toLocaleString('ko-KR')}` : ''} 원`;
};

/** 장소: 입력하는 동안 찾고(↑↓ Enter), 안 나오면 지도에서 찍는다 */
function PlaceField({ value, onChange, near }: { value: Place | null; onChange: (p: Place | null) => void; near: [number, number] | null }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [msg, setMsg] = useState('');
  const [at, setAt] = useState(0);
  const [pick, setPick] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);

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

  const choose = (h: Hit) => {
    onChange({ name: h.name, en: h.en || undefined, address: h.address, lat: +h.lat.toFixed(5), lng: +h.lng.toFixed(5) });
    setQ('');
    setHits(null);
    setMsg('');
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
      <div className="ac">
        <label className="field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || !hits?.length) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setAt((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(hits[at]);
              }
            }}
            placeholder={value ? '다른 장소로 바꾸기' : '장소 찾기 (예: 후시미 이나리, 망원시장)'}
            aria-label="장소 검색"
            role="combobox"
            aria-expanded={!!(hits?.length || msg)}
            aria-controls={listId}
            aria-autocomplete="list"
          />
        </label>
        {hits?.length || msg ? (
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

/** 시간: 빠른 칩 + 시·분 고르기 (기본 시간 입력은 디자인과 안 맞아서) */
function TimePick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value ? value.split(':') : ['', ''];
  const set = (hh: string, mm: string) => onChange(hh ? `${hh}:${mm || '00'}` : '');
  return (
    <div className="time-pick">
      <div className="tp-selects">
        <select className="inp tp-sel" value={h} onChange={(e) => set(e.target.value, m)} aria-label="시">
          <option value="">시간 없음</option>
          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((x) => (
            <option key={x} value={x}>
              {Number(x) < 12 ? `오전 ${Number(x) || 12}시` : `오후 ${Number(x) - 12 || 12}시`}
            </option>
          ))}
        </select>
        <select className="inp tp-sel" value={m || '00'} onChange={(e) => set(h, e.target.value)} disabled={!h} aria-label="분">
          {['00', '10', '15', '20', '30', '40', '45', '50'].map((x) => (
            <option key={x} value={x}>
              {x}분
            </option>
          ))}
        </select>
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

export interface ItemModalProps {
  open: boolean;
  plan: Pick<Plan, 'target' | 'days' | 'coords'>;
  item: Item | null;
  day: number | null;
  owner: boolean;
  onClose: () => void;
  onSave: (item: Item) => void;
  nextOrder: (day: number | null) => number;
}

export default function ItemModal({ open, plan, item, day, owner, onClose, onSave, nextOrder }: ItemModalProps) {
  const [d, setD] = useState<Item | null>(null);
  useEffect(() => {
    if (!open) return;
    setD(
      item
        ? { ...item }
        : { id: Math.random().toString(36).slice(2, 10), day, time: '', title: '', en: '', kind: 'see', place: null, memo: '', cost: null, order: nextOrder(day) }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, day]);
  if (!d) return <Modal open={false} title="" onClose={onClose}>{null}</Modal>;
  const set = (patch: Partial<Item>) => setD((cur) => (cur ? { ...cur, ...patch } : cur));
  const days = [...Array.from({ length: plan.days }, (_, i) => i + 1), null] as (number | null)[];
  return (
    <Modal open={open} title={item ? '일정 고치기' : '일정 추가'} onClose={onClose} wide>
      <form
        className="item-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!d.title.trim()) return toast('무엇을 할지 적어 주세요', '!');
          // 새 일정은 저장하는 순간 새 id를 받는다 (직전에 고친 일정의 id가 남아 있으면 안 된다)
          const out = { ...d, id: item ? item.id : Math.random().toString(36).slice(2, 10), title: d.title.trim(), en: d.en.trim(), memo: d.memo.trim() };
          if (item && item.day !== out.day) out.order = nextOrder(out.day);
          onSave(out);
        }}
      >
        <label className="lbl">
          무엇을
          <input className="inp" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="예: 후시미 이나리 새벽 등산" autoFocus maxLength={80} />
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
          <TimePick value={d.time} onChange={(t) => set({ time: t })} />
        </div>
        <div className="lbl">
          장소 <span className="faint">(선택)</span>
          <PlaceField value={d.place} near={plan.coords} onChange={(p) => setD((cur) => (cur ? { ...cur, place: p, en: p?.en || cur.en } : cur))} />
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
            <span className="money">
              <input
                className="num"
                inputMode="numeric"
                value={d.cost ? d.cost.toLocaleString('ko-KR') : ''}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^\d]/g, ''));
                  set({ cost: n ? Math.min(1e10, n) : null });
                }}
                placeholder="0"
              />
              <span>원</span>
            </span>
            {d.cost ? <small className="faint money-hint">{manwon(d.cost)}</small> : null}
          </label>
          <label className="lbl">
            메모 <span className="faint">(선택)</span>
            <input className="inp" value={d.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="예: 새벽 6시 반 출발" maxLength={400} />
          </label>
        </div>
        {!owner ? <p className="hint">💡 바로 바뀌지 않고 <b>제안 바구니</b>에 담겨요. 다 고친 뒤 한 번에 제안하세요.</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn--solid">
            {owner ? '저장' : '바구니에 담기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
