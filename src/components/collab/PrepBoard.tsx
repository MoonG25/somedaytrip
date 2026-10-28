'use client';
// 탑승 준비: 발권한 뒤 기장이 채울 것들. 작성 화면에서 뺀 예산·준비물·소개를 여기서 바로 고친다.
// 다 채우면 사라진다. 저장 모양(PlanInfo)은 작성 화면과 같아서 예전 계획에도 그대로 쓴다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BudgetItem, Item, Plan, PlanInfo } from '@/lib/types';
import { updatePlan } from '@/app/actions';
import Modal from './Modal';
import { BUDGET_SUGGEST, CHECK_SUGGEST } from '@/lib/suggest';
import { broadcast, toast } from './util';

// 숙소·렌터카는 보통 다 같이 낸다
const GROUP_DEFAULT = /숙소|호텔|료칸|에어비앤비|게스트|렌터카|주유|캠핑/;
const won = (n: number) => `₩${Math.round(n).toLocaleString('ko-KR')}`;

/** 화면용 값을 빼고 저장할 계획 정보만 */
export function infoOf(plan: Plan): PlanInfo {
  const { id: _i, slug: _s, version: _v, createdAt: _c, updatedAt: _u, sample: _x, copiedFrom: _f, ...info } = plan;
  return info;
}

type Task = 'places' | 'budget' | 'check' | 'why' | 'invite';

export default function PrepBoard({ plan, items, proposals, onShare }: { plan: Plan; items: Item[]; proposals: number; onShare: () => void }) {
  const router = useRouter();
  const [modal, setModal] = useState<Task | null>(null);
  const tasks: { key: Task; icon: string; label: string; hint: string; done: boolean }[] = [
    { key: 'places', icon: '📍', label: '가 볼 곳', hint: items.length ? `${items.length}곳` : '일정에 추가', done: items.length > 0 },
    { key: 'budget', icon: '💰', label: '예산', hint: plan.budgetItems.length ? `${plan.budgetItems.length}개 항목` : '1인당·다 같이', done: plan.budgetItems.length > 0 },
    { key: 'check', icon: '🧳', label: '준비물', hint: plan.checklist.length ? `${plan.checklist.length}개` : '할 일 목록', done: plan.checklist.length > 0 },
    { key: 'why', icon: '✍️', label: '한 줄 소개', hint: plan.why ? '적었어요' : '왜 가고 싶은지', done: !!plan.why },
    { key: 'invite', icon: '🙌', label: '친구 초대', hint: proposals ? `제안 ${proposals}개` : '링크 보내기', done: proposals > 0 },
  ];
  const done = tasks.filter((t) => t.done).length;
  if (done === tasks.length) return null;

  const save = async (patch: Partial<PlanInfo>, msg: string) => {
    const r = await updatePlan(plan.id, { ...infoOf(plan), ...patch });
    if (!r.ok) {
      toast(r.error, '!');
      return false;
    }
    broadcast(plan.id);
    router.refresh();
    toast(msg, '✓');
    setModal(null);
    return true;
  };

  const open = (k: Task) => {
    if (k === 'invite') return onShare();
    if (k === 'places') {
      const el = document.getElementById('itinerary');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setModal(k);
  };

  return (
    <section className="container prep-board" aria-label="탑승 준비">
      <div className="pf-card">
        <header className="pf-head">
          <div>
            <p className="eyebrow">Pre-flight · 탑승 준비</p>
            <b>
              {done}/{tasks.length} 준비됐어요
            </b>
          </div>
          <span className="pf-bar" aria-hidden="true">
            <i style={{ width: `${(done / tasks.length) * 100}%` }} />
          </span>
        </header>
        <ul className="pf-tasks" role="list">
          {tasks.map((t) => (
            <li key={t.key}>
              <button type="button" className={`pf-task${t.done ? ' done' : ''}`} onClick={() => open(t.key)} data-task={t.key}>
                <span className="pf-ico" aria-hidden="true">
                  {t.done ? '✓' : t.icon}
                </span>
                <span className="pf-txt">
                  <b>{t.label}</b>
                  <small>{t.hint}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {modal === 'budget' ? <BudgetModal plan={plan} onClose={() => setModal(null)} onSave={save} /> : null}
      {modal === 'check' ? <CheckModal plan={plan} onClose={() => setModal(null)} onSave={save} /> : null}
      {modal === 'why' ? <WhyModal plan={plan} onClose={() => setModal(null)} onSave={save} /> : null}
    </section>
  );
}

type SaveFn = (patch: Partial<PlanInfo>, msg: string) => Promise<boolean>;

function BudgetModal({ plan, onClose, onSave }: { plan: Plan; onClose: () => void; onSave: SaveFn }) {
  const [ppl, setPpl] = useState(Math.max(1, plan.travelers || 1));
  const [rows, setRows] = useState<BudgetItem[]>(() =>
    plan.budgetItems.length ? plan.budgetItems.map((b) => ({ ...b })) : Object.entries(plan.budget || {}).map(([name, amount]) => ({ name, amount, per: 'person' as const }))
  );
  const [busy, setBusy] = useState(false);
  const share = (b: BudgetItem) => (b.per === 'group' ? b.amount / ppl : b.amount);
  const per = rows.reduce((s, b) => s + share(b), 0);
  const all = rows.reduce((s, b) => s + (b.per === 'group' ? b.amount : b.amount * ppl), 0);
  const set = (i: number, patch: Partial<BudgetItem>) => setRows((r) => r.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const add = (name = '') => setRows((r) => [...r, { name, amount: 0, per: GROUP_DEFAULT.test(name) ? 'group' : 'person' }]);
  const unused = (BUDGET_SUGGEST[plan.scope] || []).filter((n) => !rows.some((b) => b.name === n));
  return (
    <Modal open title="예산" onClose={onClose} wide>
      <div className="item-form pf-form">
        <div className="pf-ppl">
          <span>몇 명이서?</span>
          <div className="days-pick">
          <div className="stepper">
            <button type="button" onClick={() => setPpl((n) => Math.max(1, n - 1))} aria-label="한 명 줄이기">
              −
            </button>
            <output>{ppl}명</output>
            <button type="button" onClick={() => setPpl((n) => Math.min(50, n + 1))} aria-label="한 명 늘리기">
              +
            </button>
          </div>
          </div>
        </div>
        <ul className="pf-rows" role="list">
          {rows.map((b, i) => (
            <li key={i} className="pf-row">
              <input className="inp" value={b.name} maxLength={20} placeholder="항목 (예: 항공)" aria-label="예산 항목 이름" onChange={(e) => set(i, { name: e.target.value })} />
              <button type="button" className="b-per" aria-pressed={b.per === 'group'} onClick={() => set(i, { per: b.per === 'group' ? 'person' : 'group' })} title="1인당 / 다 같이">
                {b.per === 'group' ? '다 같이' : '1인당'}
              </button>
              <span className="money">
                <input
                  className="num"
                  inputMode="numeric"
                  aria-label="금액"
                  value={b.amount ? b.amount.toLocaleString('ko-KR') : ''}
                  placeholder="0"
                  onChange={(e) => set(i, { amount: Math.min(1e10, Number(e.target.value.replace(/[^\d]/g, '')) || 0) })}
                />
                <span>원</span>
              </span>
              <button type="button" className="icon-btn" aria-label={`${b.name || '항목'} 지우기`} onClick={() => setRows((r) => r.filter((_, k) => k !== i))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="chips">
          {unused.map((n) => (
            <button key={n} type="button" className="chip" onClick={() => add(n)}>
              + {n}
            </button>
          ))}
          <button type="button" className="chip" onClick={() => add()}>
            + 직접 추가
          </button>
        </div>
        <p className="pf-total">
          1인 <b className="num">{won(per)}</b>
          {ppl > 1 ? (
            <>
              {' '}
              · {ppl}명 전체 <b className="num">{won(all)}</b>
            </>
          ) : null}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave({ travelers: ppl, budgetItems: rows.filter((b) => b.name.trim()).map((b) => ({ ...b, name: b.name.trim() })) }, '예산을 저장했어요');
              setBusy(false);
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CheckModal({ plan, onClose, onSave }: { plan: Plan; onClose: () => void; onSave: SaveFn }) {
  const [list, setList] = useState<[string, boolean][]>(() => plan.checklist.map(([t, d]) => [t, d]));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const add = (t: string) => {
    const v = t.trim().slice(0, 80);
    if (!v || list.some(([x]) => x === v)) return;
    setList((l) => [...l, [v, false]].slice(0, 60) as [string, boolean][]);
    setText('');
  };
  const unused = (CHECK_SUGGEST[plan.scope] || []).filter((n) => !list.some(([x]) => x === n));
  return (
    <Modal open title="준비물 · 할 일" onClose={onClose}>
      <div className="item-form pf-form">
        {list.length ? (
          <ul className="pf-checks" role="list">
            {list.map(([t, d], i) => (
              <li key={t}>
                <span className={d ? 'faint' : ''}>{d ? '✓ ' : '· '}{t}</span>
                <button type="button" className="icon-btn" aria-label={`${t} 지우기`} onClick={() => setList((l) => l.filter((_, k) => k !== i))}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          className="inp"
          value={text}
          maxLength={80}
          placeholder="준비할 것 적고 Enter"
          aria-label="준비할 것 추가"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add(text);
            }
          }}
        />
        <div className="chips">
          {unused.map((n) => (
            <button key={n} type="button" className="chip" onClick={() => add(n)}>
              + {n}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const all = text.trim() && !list.some(([x]) => x === text.trim()) ? [...list, [text.trim(), false] as [string, boolean]] : list;
              await onSave({ checklist: all }, '준비물을 저장했어요');
              setBusy(false);
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}

function WhyModal({ plan, onClose, onSave }: { plan: Plan; onClose: () => void; onSave: SaveFn }) {
  const [why, setWhy] = useState(plan.why);
  const [intro, setIntro] = useState(plan.intro);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open title="한 줄 소개" onClose={onClose}>
      <div className="item-form pf-form">
        <label className="lbl">
          왜 가고 싶어요? <span className="faint">계획 첫머리에 큰 글씨로 나와요</span>
          <input className="inp" value={why} maxLength={200} placeholder="눈 쌓인 밤길을 걷다가 노천온천에 들어가고 싶다." onChange={(e) => setWhy(e.target.value)} autoFocus />
        </label>
        <label className="lbl">
          더 하고 싶은 이야기 <span className="faint">선택</span>
          <textarea className="textarea" rows={4} value={intro} maxLength={6000} placeholder="누구랑, 어떤 여행이 되면 좋을지." onChange={(e) => setIntro(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className="btn btn--solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave({ why: why.trim(), intro: intro.trim() }, '소개를 저장했어요');
              setBusy(false);
            }}
          >
            저장
          </button>
        </div>
      </div>
    </Modal>
  );
}
