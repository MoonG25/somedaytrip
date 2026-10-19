'use client';
// 일정 추가·수정 창. 장소는 검색(OSM)하거나 지도에서 직접 찍는다 (moon.log 계획 쓰기의 장소 고르기와 같은 방식)
import { useEffect, useRef, useState } from 'react';
import type { Item, Kind, Place, Plan } from '@/lib/types';
import { KINDS } from '@/lib/proposals';
import { reverse, nameOf, enOf } from '@/blog/geo.js';
import { loadLeaflet, createMap, destroyMap, pinIcon } from '@/blog/leaflet.js';
import Modal from './Modal';
import { dayLabel, toast } from './util';

type G = { lat: string; lon: string; display_name: string; name?: string; namedetails?: Record<string, string> };
type Hit = { name: string; en?: string; address?: string; lat: number; lng: number; kind: string };

function PlaceField({ value, onChange, near }: { value: Place | null; onChange: (p: Place | null) => void; near: [number, number] | null }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Hit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);

  // 서버가 카카오·Photon·OSM 결과를 합쳐 준다. 입력하는 동안 자동으로 찾는다
  const search = async (text = q) => {
    if (text.trim().length < 2) return setRes(null);
    setBusy(true);
    try {
      const u = new URLSearchParams({ q: text.trim(), mode: 'poi' });
      if (near) {
        u.set('lat', String(near[0]));
        u.set('lng', String(near[1]));
      }
      const r = await fetch(`/api/places?${u}`);
      const { hits } = (await r.json()) as { hits: Hit[] };
      setRes(hits);
    } catch {
      toast('검색하지 못했어요. 잠시 뒤 다시 해 주세요', '!');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const t = setTimeout(() => search(q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    if (!pick) return;
    let map: any;
    let marker: any;
    let alive = true;
    loadLeaflet().then((L: any) => {
      if (!alive || !mapEl.current) return;
      map = createMap(L, mapEl.current, { scrollWheelZoom: true });
      const c = value ? [value.lat, value.lng] : near;
      map.setView(c || [37.5665, 126.978], c ? 14 : 11);
      if (value) marker = L.marker([value.lat, value.lng], { icon: pinIcon(L, { label: '★', kind: 'is-plan' }) }).addTo(map);
      map.on('click', async (ev: any) => {
        const lat = +ev.latlng.lat.toFixed(5);
        const lng = +ev.latlng.lng.toFixed(5);
        marker?.remove();
        marker = L.marker([lat, lng], { icon: pinIcon(L, { label: '★', kind: 'is-plan' }) }).addTo(map);
        onChange({ name: '찾는 중…', lat, lng });
        try {
          const g = (await reverse([lat, lng])) as G;
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
      <div className="geo-search">
        <label className="field">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                search(q);
              }
            }}
            placeholder="장소 찾기 (예: 후시미 이나리, 망원시장)"
            aria-label="장소 검색"
          />
        </label>
        <button type="button" className="btn btn--sm" onClick={() => search(q)} disabled={busy}>
          {busy ? '찾는 중…' : '찾기'}
        </button>
      </div>
      {res ? (
        <ul className="geo-results" role="listbox">
          {res.length ? (
            res.map((h, i) => (
              <li key={i}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => {
                    onChange({ name: h.name, en: h.en || undefined, address: h.address, lat: +h.lat.toFixed(5), lng: +h.lng.toFixed(5) });
                    setRes(null);
                    setQ('');
                  }}
                >
                  <b>
                    {h.kind === 'region' ? '🗺️' : '📍'} {h.name} {h.en && h.en !== h.name ? <span className="serif faint">{h.en}</span> : null}
                  </b>
                  <span>{h.address}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="geo-loading">결과가 없어요. 영문으로 찾거나 지도에서 찍어 보세요.</li>
          )}
        </ul>
      ) : null}
      <button type="button" className="link-u faint pick-toggle" onClick={() => setPick((v) => !v)}>
        {pick ? '지도 닫기' : '🗺 지도에서 직접 찍기'}
      </button>
      {pick ? <div className="pick-map" ref={mapEl} /> : null}
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
  const set = (patch: Partial<Item>) => setD({ ...d, ...patch });
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
        <div className="grid2">
          <label className="lbl">
            무엇을
            <input className="inp" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="후시미 이나리 새벽 등산" autoFocus maxLength={80} />
          </label>
          <label className="lbl">
            영문 이름 <span className="faint">(선택)</span>
            <input className="inp" value={d.en} onChange={(e) => set({ en: e.target.value })} placeholder="Fushimi Inari" maxLength={80} />
          </label>
        </div>
        <div className="chips kind-chips" role="radiogroup" aria-label="종류">
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <button key={k} type="button" className="chip" role="radio" aria-checked={d.kind === k} aria-pressed={d.kind === k} onClick={() => set({ kind: k })}>
              {KINDS[k].icon} {KINDS[k].label}
            </button>
          ))}
        </div>
        <div className="grid2">
          <label className="lbl">
            날짜
            <select className="inp" value={d.day ?? ''} onChange={(e) => set({ day: e.target.value ? Number(e.target.value) : null })}>
              {Array.from({ length: plan.days }, (_, i) => (
                <option key={i} value={i + 1}>
                  {dayLabel(plan, i + 1).code} · {dayLabel(plan, i + 1).text}
                </option>
              ))}
              <option value="">날짜 미정 (언젠가 가 볼 곳)</option>
            </select>
          </label>
          <label className="lbl">
            시간 <span className="faint">(선택)</span>
            <input className="inp" type="time" value={d.time} onChange={(e) => set({ time: e.target.value })} />
          </label>
        </div>
        <div className="lbl">
          장소 <span className="faint">(선택)</span>
          <PlaceField value={d.place} near={plan.coords} onChange={(p) => setD((cur) => (cur ? { ...cur, place: p, en: cur.en || p?.en || '' } : cur))} />
        </div>
        <div className="grid2">
          <label className="lbl">
            예상 비용 <span className="faint">(원, 선택)</span>
            <span className="won">
              <input className="inp num" type="number" min={0} step={1000} value={d.cost ?? ''} onChange={(e) => set({ cost: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
              <span>원</span>
            </span>
          </label>
          <label className="lbl">
            메모 <span className="faint">(선택)</span>
            <input className="inp" value={d.memo} onChange={(e) => set({ memo: e.target.value })} placeholder="새벽 6시 반 출발" maxLength={400} />
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
