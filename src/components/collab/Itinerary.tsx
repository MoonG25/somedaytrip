'use client';
// 일정 · 가 볼 곳. moon.log 계획 상세의 "Places to see"(번호 목록 + 지도) 모양에 협업을 얹었다.
//  - 주인: 고치면 바로 반영 (서버 액션)
//  - 손님: 고친 내용이 "제안 바구니"(이 브라우저)에 모였다가, 제목을 붙여 한 번에 제안
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, Op, Plan } from '@/lib/types';
import { diffItem, describeOps, findConflicts, KINDS, opCounts, stage, stagedView, type Mark } from '@/lib/proposals';
import { optimizeRoute, routeKm } from '@/blog/plans-lib.js';
import { loadLeaflet, createMap, destroyMap, pinIcon } from '@/blog/leaflet.js';
import { applyDirect, propose } from '@/app/actions';
import { rememberPlan } from '@/lib/mine';
import ItemModal from './ItemModal';
import Modal from './Modal';
import OpCard from './OpCard';
import { broadcast, dayColor, dayLabel, distanceLabel, km, toast, won } from './util';

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

export default function Itinerary({ plan, items, owner }: { plan: Plan; items: Item[]; owner: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [edit, setEdit] = useState<{ item: Item | null; day: number | null } | null>(null);
  const [sending, setSending] = useState(false);
  const [askName, setAskName] = useState<null | ((n: string) => void)>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: any; map: any; layer: any } | null>(null);
  const markers = useRef(new Map<string, any>());

  useEffect(() => setDraft(loadDraft(plan.id)), [plan.id]);

  const rows: Row[] = useMemo(
    () => (owner || !draft ? items.map((item) => ({ item, mark: null as Mark, fields: [] })) : (stagedView(items, draft.ops) as Row[])),
    [owner, draft, items]
  );
  const days = useMemo(() => [...Array.from({ length: plan.days }, (_, i) => i + 1), null] as (number | null)[], [plan.days]);
  const live = rows.filter((r) => r.mark !== 'remove');
  const withPlace = live.filter((r) => r.item.place);
  const nextOrder = useCallback((day: number | null) => Math.max(-1, ...rows.filter((r) => r.item.day === day).map((r) => r.item.order)) + 1, [rows]);

  /* ---------- 지도 ---------- */
  useEffect(() => {
    let alive = true;
    loadLeaflet()
      .then((L: any) => {
        if (!alive || !mapEl.current) return;
        const map = createMap(L, mapEl.current);
        const layer = L.layerGroup().addTo(map);
        mapRef.current = { L, map, layer };
        map.setView(plan.coords || [37.5665, 126.978], plan.coords ? 11 : 5);
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
  }, [plan.coords]);

  const drawRef = useRef<(fit: boolean) => void>(null);
  drawRef.current = (fit: boolean) => {
    const m = mapRef.current;
    if (!m) return;
    const { L, map, layer } = m;
    layer.clearLayers();
    markers.current.clear();
    const pts: [number, number][] = [];
    for (const day of days) {
      const list = rows.filter((r) => r.item.day === day && r.item.place);
      const line: [number, number][] = [];
      list.forEach((r) => {
        const n = rows.filter((x) => x.item.day === day).indexOf(r) + 1;
        const ll: [number, number] = [r.item.place!.lat, r.item.place!.lng];
        const mk = L.marker(ll, { icon: pinIcon(L, { label: day == null ? '?' : String(n), kind: `is-plan${r.mark ? ` is-${r.mark}` : ''}${focus === r.item.id ? ' is-active' : ''}` }), title: r.item.title })
          .addTo(layer)
          .bindTooltip(`${KINDS[r.item.kind].icon} ${r.item.title}`, { direction: 'top', offset: [0, -14] })
          .on('click', () => {
            setFocus(r.item.id);
            document.querySelector(`[data-item="${r.item.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        mk.getElement()?.style.setProperty('--dc', dayColor(day));
        markers.current.set(r.item.id, mk);
        if (r.mark !== 'remove') {
          line.push(ll);
          pts.push(ll);
        }
      });
      if (day != null && line.length > 1) L.polyline(line, { className: 'route-plan', weight: 2.5, interactive: false, color: dayColor(day) }).addTo(layer);
    }
    if (fit && pts.length) map.fitBounds(pts, { padding: [50, 50], maxZoom: 14, animate: false });
  };
  const fittedRef = useRef(false);
  useEffect(() => {
    drawRef.current?.(!fittedRef.current);
    if (mapRef.current && withPlace.length) fittedRef.current = true;
  }, [rows, focus, withPlace.length]);

  const focusItem = (id: string) => {
    setFocus(id);
    const mk = markers.current.get(id);
    const m = mapRef.current;
    if (mk && m) m.map.flyTo(mk.getLatLng(), Math.max(m.map.getZoom(), 14), { duration: 0.8 });
    else toast('장소가 없는 일정이에요', '·');
  };

  /* ---------- 바꾸기 ---------- */
  const ensureName = () =>
    new Promise<string | null>((resolve) => {
      const n = myName();
      if (n) return resolve(n);
      setAskName(() => (name: string) => resolve(name || null));
    });

  const commit = async (ops: Op[], msg?: string) => {
    if (!ops.length) return;
    if (owner) {
      setBusy(true);
      const r = await applyDirect(plan.id, ops);
      setBusy(false);
      if (!r.ok) return toast(r.error, '!');
      broadcast(plan.id);
      router.refresh();
      toast(msg || '반영했어요', '✓');
      return;
    }
    if (!(await ensureName())) return;
    const d: Draft = draft ? { ...draft, ops: [...draft.ops] } : { baseVersion: plan.version, ops: [] };
    for (const op of ops) d.ops = stage(d.ops, op);
    const next = d.ops.length ? d : null;
    setDraft(next);
    saveDraft(plan.id, next);
    toast(next ? msg || '제안 바구니에 담았어요' : '바구니가 비었어요', '🧺');
  };

  const view = (id: string) => rows.find((r) => r.item.id === id)?.item;

  const move = (id: string, dir: -1 | 1) => {
    const cur = view(id);
    if (!cur) return;
    const same = live.filter((r) => r.item.day === cur.day).map((r) => r.item);
    const i = same.findIndex((x) => x.id === id);
    const other = same[i + dir];
    if (!other) return;
    commit([diffItem(cur, { ...cur, order: other.order }), diffItem(other, { ...other, order: cur.order })].filter(Boolean) as Op[], '순서를 바꿨어요');
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

  /* 동선 최적화: 날마다 가장 짧은 순서로 → 주인은 바로, 손님은 바구니로 */
  const optimize = () => {
    const ops: Op[] = [];
    let before = 0;
    let after = 0;
    for (const day of days) {
      if (day == null) continue;
      const list = live.filter((r) => r.item.day === day).map((r) => r.item);
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

  const totalKm = useMemo(() => {
    let s = 0;
    for (const day of days) {
      if (day == null) continue;
      const pts = live.filter((r) => r.item.day === day && r.item.place).map((r) => ({ coords: [r.item.place!.lat, r.item.place!.lng] }));
      s += routeKm(pts);
    }
    return s;
  }, [live, days]);

  const conflicts = draft && !owner ? findConflicts(items, draft.ops) : [];
  const moved = draft ? plan.version - draft.baseVersion : 0;

  return (
    <section className="plan-route itinerary" id="itinerary">
      <div className="container">
        <header className="sec-head" data-reveal>
          <div>
            <p className="eyebrow">
              일정 · 가 볼 곳 · {live.length}곳{!owner ? ' · 고치면 제안이 돼요' : ''}
            </p>
            <h2>
              Places to <em>see</em>
            </h2>
          </div>
          <div className="route-tools">
            {totalKm > 0 ? <span className="route-km mono">총 이동 {totalKm.toFixed(1)}km</span> : null}
            {withPlace.length > 2 ? (
              <button type="button" className="btn btn--sm" onClick={optimize} disabled={busy}>
                ⟲ 동선 최적화
              </button>
            ) : null}
          </div>
        </header>
      </div>
      <div className="route-grid container">
        <div className="itin">
          {days.map((day) => {
            const list = rows.filter((r) => r.item.day === day);
            const dl = dayLabel(plan, day);
            const cost = list.filter((r) => r.mark !== 'remove').reduce((s, r) => s + (r.item.cost ?? 0), 0);
            if (day == null && !list.length)
              return (
                <div key="someday" className="itin-day cand">
                  <button type="button" className="itin-add" onClick={() => setEdit({ item: null, day: null })}>
                    + 날짜 미정 · 언젠가 가 볼 곳 적어 두기
                  </button>
                </div>
              );
            let prev: Item | null = null;
            const liveList = list.filter((r) => r.mark !== 'remove');
            return (
              <div key={day ?? 'someday'} className={`itin-day${day == null ? ' cand' : ''}`} style={{ '--dc': dayColor(day) } as React.CSSProperties}>
                <h3 className="itin-day-head">
                  <span className="mono">{dl.code}</span>
                  <b>{dl.text}</b>
                  <small className="faint">
                    {liveList.length ? `${liveList.length}곳` : ''}
                    {cost ? ` · ${won(cost)}` : ''}
                  </small>
                </h3>
                <ol className="route-list" role="list">
                  {list.map((r, i) => {
                    const it = r.item;
                    const gap = prev?.place && it.place && r.mark !== 'remove' ? km(prev.place, it.place) : null;
                    if (r.mark !== 'remove') prev = it;
                    const li = liveList.indexOf(r);
                    return (
                      <li key={it.id} data-item={it.id} className={`route-item${r.mark ? ` is-${r.mark}` : ''}${focus === it.id ? ' on' : ''}`} onClick={() => focusItem(it.id)}>
                        <span className="route-no mono">{day == null ? '··' : String(i + 1).padStart(2, '0')}</span>
                        <div className="ri-body">
                          <div className="ri-title">
                            <strong>
                              {KINDS[it.kind].icon} {it.title}
                            </strong>{' '}
                            {it.en ? <span className="serif faint">{it.en}</span> : null}
                            {r.mark ? <span className={`ri-badge ${r.mark}`}>{r.mark === 'add' ? '추가 예정' : r.mark === 'remove' ? '삭제 예정' : '수정 예정'}</span> : null}
                          </div>
                          <p className="ri-meta mono">
                            {[it.time, it.place?.name, it.cost ? won(it.cost) : '', gap != null ? `↳ ${distanceLabel(gap)}` : ''].filter(Boolean).join(' · ')}
                          </p>
                          {it.memo ? <p>{it.memo}</p> : null}
                        </div>
                        <div className="ri-actions" onClick={(e) => e.stopPropagation()}>
                          {r.mark && !owner ? (
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
                                <button type="button" className="ri-btn" onClick={() => move(it.id, -1)} aria-label="위로">
                                  ↑
                                </button>
                              ) : null}
                              {li >= 0 && li < liveList.length - 1 ? (
                                <button type="button" className="ri-btn" onClick={() => move(it.id, 1)} aria-label="아래로">
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
                      </li>
                    );
                  })}
                </ol>
                <button type="button" className="itin-add" onClick={() => setEdit({ item: null, day })}>
                  + {day == null ? '후보 추가' : `${dl.code}에 일정 추가`}
                </button>
              </div>
            );
          })}
        </div>
        <div className="route-map-wrap">
          <div className="route-map" ref={mapEl} aria-label="일정 지도" />
          <div className="map-loading mono">지도를 불러오는 중…</div>
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
        open={!!edit}
        plan={plan}
        item={edit?.item ?? null}
        day={edit?.day ?? 1}
        owner={owner}
        nextOrder={nextOrder}
        onClose={() => setEdit(null)}
        onSave={(next) => {
          const cur = edit?.item;
          setEdit(null);
          if (!cur) commit([{ type: 'add', item: next }], owner ? '추가했어요' : undefined);
          else {
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
          toast('제안을 보냈어요. 주인이 수락하면 반영돼요', '📮');
          router.push(`/p/${plan.id}/pr/${no}`);
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
          const r = await propose(plan.id, { authorName: myName() || '손님', title, message, baseVersion: draft.baseVersion, ops: draft.ops });
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
          <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={1000} placeholder="왜 이렇게 바꾸면 좋을지 적어 주면 주인이 판단하기 쉬워요" />
        </label>
        <p className="lbl-title">변경 {draft.ops.length}개</p>
        <div className="opcards">
          {draft.ops.map((op, i) => (
            <OpCard key={i} op={op} plan={plan} items={items} conflict={conflicts.find((c) => c.op === i)} />
          ))}
        </div>
        <p className="hint">보낸 뒤에는 주인이 수락해야 반영돼요. 그 전까지는 철회할 수 있어요.</p>
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
        <p className="muted">제안에 이름이 붙어요. 주인이 누가 낸 제안인지 알 수 있게요.</p>
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
