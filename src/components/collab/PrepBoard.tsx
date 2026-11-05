'use client';
// 탑승 준비: 발권한 뒤 기장이 채울 것들. 예산·준비물은 계획 화면에서 바로, 소개는 창에서 고친다.
// 다 채우면 사라진다. 저장 모양(PlanInfo)은 작성 화면과 같아서 예전 계획에도 그대로 쓴다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, Plan, PlanInfo } from '@/lib/types';
import { updatePlan } from '@/app/actions';
import Modal from './Modal';
import { broadcast, toast } from './util';

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
    if (k === 'budget') {
      // 예산은 계획 화면의 예상 경비에서 바로 고친다
      const box = document.getElementById('budget');
      box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => box?.querySelector<HTMLInputElement>('.bb-add input')?.focus({ preventScroll: true }), 450);
      return;
    }
    if (k === 'check') {
      // 준비물은 모두의 체크리스트: 계획 화면의 체크리스트에서 바로 더한다 (전체를 덮어쓰는 창은 쓰지 않는다)
      const box = document.querySelector<HTMLElement>('.prep-check');
      box?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => box?.querySelector<HTMLInputElement>('.ck-add input')?.focus({ preventScroll: true }), 450);
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
      {modal === 'why' ? <WhyModal plan={plan} onClose={() => setModal(null)} onSave={save} /> : null}
    </section>
  );
}

type SaveFn = (patch: Partial<PlanInfo>, msg: string) => Promise<boolean>;

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
