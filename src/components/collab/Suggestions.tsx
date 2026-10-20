'use client';
// 일정 위에 보이는 대기 중인 제안. 리뷰 화면으로 가지 않고 그 자리에서 하나씩 반영·거절한다.
//  - 대기열: 요청이 많으면 우선순위(여러 명이 원함 → 바로 반영 가능 → 오래 기다림 → 이른 날짜)대로
//  - 추가 제안: 그 날 일정 사이에 반투명 카드
//  - 수정·빼기 제안: 해당 일정 아래에 "바뀔 값" 줄
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, Plan } from '@/lib/types';
import { changes, fieldText, FIELD_LABEL, KINDS, type PendingGroup } from '@/lib/proposals';
import { decideOps, withdrawOp } from '@/app/actions';
import { ago, broadcast, dayLabel, toast, won } from './util';

/** 제안한 사람들 "지민 외 1명" */
export const whoOf = (g: PendingGroup) => {
  const names = [...new Set(g.ops.map((o) => o.authorName))];
  return names.length > 1 ? `${names[0]} 외 ${names.length - 1}명` : names[0];
};

/** 한 줄 설명 */
export function summaryOf(g: PendingGroup, items: Item[], plan: Plan) {
  const op = g.primary.op;
  if (op.type === 'add') {
    const it = op.item;
    return `${KINDS[it.kind].icon} '${it.title}' 추가 · ${dayLabel(plan, it.day).code}${it.time ? ` ${it.time}` : ''}`;
  }
  const cur = items.find((i) => i.id === g.target);
  const name = cur?.title ?? (op.type === 'remove' ? op.before.title : (op.before.title ?? '일정'));
  if (op.type === 'remove') return `'${name}' 빼기`;
  const ch = changes(op, items);
  if (!ch.length) return `'${name}' 순서 바꾸기`;
  return `'${name}' ${ch.map((c) => `${FIELD_LABEL[c.field]} ${fieldText(c.field, c.to)}`).join(', ')}`;
}

/** 반영·거절·철회. 기장은 decideOps, 승객은 자기 것만 withdrawOp */
export function useDecide(plan: Plan) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const done = (msg: string, icon: string) => {
    broadcast(plan.id);
    router.refresh();
    toast(msg, icon);
  };
  const decide = async (g: PendingGroup, decision: 'accept' | 'reject') => {
    if (decision === 'accept' && g.conflict?.reason === 'gone') return toast('이미 지워진 일정이라 반영할 수 없어요', '!');
    let force = false;
    if (decision === 'accept' && g.conflict) {
      if (!confirm('제안을 보낸 뒤에 이 일정이 바뀌었어요.\n\n제안대로 덮어쓸까요?')) return;
      force = true;
    }
    // 같은 걸 원한 제안이 여럿이면 대표 하나만 반영하고 나머지는 "다른 제안이 반영됨"으로 정리
    const list =
      decision === 'accept'
        ? [{ no: g.primary.no, index: g.primary.index, decision: 'accept' as const }, ...g.ops.slice(1).map((o) => ({ no: o.no, index: o.index, decision: 'supersede' as const }))]
        : g.ops.map((o) => ({ no: o.no, index: o.index, decision: 'reject' as const }));
    setBusy(g.key);
    const r = await decideOps(plan.id, list, force);
    setBusy(null);
    if (!r.ok) return toast(r.error, '!');
    done(decision === 'accept' ? '반영했어요' : '거절했어요', decision === 'accept' ? '✓' : '🙅');
  };
  /** 한 제안의 대기 중인 변경 모두 */
  const acceptAll = async (no: number, groups: PendingGroup[]) => {
    const mine = groups.filter((g) => g.primary.no === no);
    if (!mine.length) return;
    if (mine.some((g) => g.conflict) && !confirm('이 제안 중 그 사이 바뀐 일정이 있어요. 제안대로 덮어쓸까요?')) return;
    const list = mine.flatMap((g) => [{ no: g.primary.no, index: g.primary.index, decision: 'accept' as const }, ...g.ops.slice(1).map((o) => ({ no: o.no, index: o.index, decision: 'supersede' as const }))]);
    setBusy(`all:${no}`);
    const r = await decideOps(plan.id, list, true);
    setBusy(null);
    if (!r.ok) return toast(r.error, '!');
    done(`제안 #${no}의 ${r.data.accepted}개를 반영했어요`, '✓');
  };
  const withdraw = async (g: PendingGroup, mine: Set<number>) => {
    if (!confirm('이 제안을 철회할까요?')) return;
    setBusy(g.key);
    for (const o of g.ops.filter((x) => mine.has(x.no))) {
      const r = await withdrawOp(plan.id, o.no, o.index);
      if (!r.ok) {
        setBusy(null);
        return toast(r.error, '!');
      }
    }
    setBusy(null);
    done('철회했어요', '↩');
  };
  return { busy, decide, acceptAll, withdraw };
}

type Ctl = ReturnType<typeof useDecide>;

/** 카드·줄 오른쪽의 결정 버튼 */
export function SuggActions({ g, owner, mine, ctl }: { g: PendingGroup; owner: boolean; mine: Set<number>; ctl: Ctl }) {
  const busy = ctl.busy === g.key;
  if (owner)
    return (
      <span className="sg-acts" onClick={(e) => e.stopPropagation()}>
        {g.conflict?.reason !== 'gone' ? (
          <button type="button" className="sg-ok" disabled={busy} onClick={() => ctl.decide(g, 'accept')} aria-label={`반영: ${whoOf(g)}의 제안`}>
            ✓ 반영
          </button>
        ) : null}
        <button type="button" className="sg-no" disabled={busy} onClick={() => ctl.decide(g, 'reject')} aria-label={`거절: ${whoOf(g)}의 제안`}>
          ✕
        </button>
      </span>
    );
  if (g.ops.some((o) => mine.has(o.no)))
    return (
      <span className="sg-acts" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="link-u faint" disabled={busy} onClick={() => ctl.withdraw(g, mine)}>
          철회
        </button>
      </span>
    );
  return <span className="sg-wait faint">기장 검토 중</span>;
}

/** 누가 · 몇 명 · 언제 */
export function SuggWho({ g }: { g: PendingGroup }) {
  return (
    <span className="sg-who">
      <b>{whoOf(g)}</b>
      {g.support > 1 ? <span className="sg-support">🙋 {g.support}명이 원해요</span> : null}
      <span className="faint">{ago(g.since)}</span>
      {g.conflict ? <span className="sg-warn">{g.conflict.reason === 'gone' ? '⚠ 이미 지워진 일정' : '⚠ 그 사이 바뀜'}</span> : null}
    </span>
  );
}

/** 추가 제안: 그 날 일정 사이에 반투명 카드 */
export function GhostRow({ g, owner, mine, ctl, onFocus }: { g: PendingGroup; owner: boolean; mine: Set<number>; ctl: Ctl; onFocus: () => void }) {
  if (g.primary.op.type !== 'add') return null;
  const it = g.primary.op.item;
  return (
    <li className="route-item is-ghost" data-sugg={g.key} onClick={onFocus} aria-label={`제안: ${it.title}, ${whoOf(g)}`}>
      <span className="route-no mono" aria-hidden="true">
        ＋
      </span>
      <div className="ri-body">
        <div className="ri-title">
          <strong>
            {KINDS[it.kind].icon} {it.title}
          </strong>{' '}
          <span className="ri-badge add">추가 제안</span>
        </div>
        <p className="ri-meta mono">{[it.time, it.place && it.place.name !== it.title ? `📍 ${it.place.name}` : '', it.cost ? won(it.cost) : ''].filter(Boolean).join(' · ')}</p>
        {it.memo ? <p>{it.memo}</p> : null}
        {g.lead && g.primary.message ? <p className="sg-msg">💬 {g.primary.message}</p> : null}
        <SuggWho g={g} />
      </div>
      <div className="ri-actions sg-col">
        <SuggActions g={g} owner={owner} mine={mine} ctl={ctl} />
      </div>
    </li>
  );
}

/** 수정·빼기 제안: 해당 일정 아래 줄 */
export function SuggStrips({ groups, items, owner, mine, ctl }: { groups: PendingGroup[]; items: Item[]; owner: boolean; mine: Set<number>; ctl: Ctl }) {
  return (
    <li className="ri-suggs" aria-label="이 일정에 대한 제안">
      {groups.map((g) => {
        const op = g.primary.op;
        const ch = changes(op, items);
        return (
          <div key={g.key} className={`sg-strip ${op.type}`} data-sugg={g.key}>
            <div className="sg-main">
              {op.type === 'remove' ? (
                <span className="sg-what">
                  <span className="ri-badge remove">빼자</span> 이 일정을 빼자는 제안
                </span>
              ) : ch.length ? (
                <span className="sg-what">
                  <span className="ri-badge update">수정 제안</span>
                  {ch.map((c) => (
                    <span key={c.field} className="sg-chg">
                      {FIELD_LABEL[c.field]} <s>{fieldText(c.field, c.from)}</s> → <b>{fieldText(c.field, c.to)}</b>
                    </span>
                  ))}
                </span>
              ) : (
                <span className="sg-what">
                  <span className="ri-badge update">순서</span> 순서를 바꾸자는 제안
                </span>
              )}
              {g.lead && g.primary.message ? <span className="sg-msg">💬 {g.primary.message}</span> : null}
              <SuggWho g={g} />
            </div>
            <SuggActions g={g} owner={owner} mine={mine} ctl={ctl} />
          </div>
        );
      })}
    </li>
  );
}

/** 위쪽 대기열: 우선순위 순, 많으면 접는다 */
export function SuggQueue({
  groups,
  items,
  plan,
  owner,
  mine,
  ctl,
  show,
  setShow,
  jump,
}: {
  groups: PendingGroup[];
  items: Item[];
  plan: Plan;
  owner: boolean;
  mine: Set<number>;
  ctl: Ctl;
  show: boolean;
  setShow: (v: boolean) => void;
  jump: (g: PendingGroup) => void;
}) {
  const [all, setAll] = useState(false);
  if (!groups.length) return null;
  const LIMIT = 5;
  const list = all ? groups : groups.slice(0, LIMIT);
  // 같은 제안의 변경이 여러 개면 "제안 전체 반영"
  const perPr = new Map<number, number>();
  for (const g of groups) perPr.set(g.primary.no, (perPr.get(g.primary.no) || 0) + 1);
  return (
    <div className="sugg-queue" id="suggestions">
      <header className="sq-head">
        <div>
          <b>📮 대기 중인 제안 {groups.length}개</b>
          <small className="faint">{owner ? '여러 명이 원하는 것부터 · 일정 위에서 바로 반영해요' : `${plan.ownerName} 기장이 하나씩 반영해요`}</small>
        </div>
        <label className="switch sq-toggle">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <span className="switch-ui" aria-hidden="true" />
          일정에 표시
        </label>
      </header>
      <ol className="sq-list" role="list">
        {list.map((g) => (
          <li key={g.key} className={`sq-row ${g.type}`}>
            <button type="button" className="sq-text" onClick={() => jump(g)}>
              <span className={`sq-ico ${g.type}`} aria-hidden="true">
                {g.type === 'add' ? '＋' : g.type === 'remove' ? '−' : '✎'}
              </span>
              <span className="sq-sum">
                <b>{summaryOf(g, items, plan)}</b>
                <SuggWho g={g} />
              </span>
            </button>
            <SuggActions g={g} owner={owner} mine={mine} ctl={ctl} />
            {owner && (perPr.get(g.primary.no) || 0) > 1 && groups.find((x) => x.primary.no === g.primary.no) === g ? (
              <button type="button" className="sq-all link-u faint" disabled={ctl.busy === `all:${g.primary.no}`} onClick={() => ctl.acceptAll(g.primary.no, groups)}>
                제안 #{g.primary.no} 전체 반영 ({perPr.get(g.primary.no)})
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {groups.length > LIMIT ? (
        <button type="button" className="sq-more link-u" onClick={() => setAll(!all)}>
          {all ? '접기' : `${groups.length - LIMIT}개 더 보기`}
        </button>
      ) : null}
    </div>
  );
}
