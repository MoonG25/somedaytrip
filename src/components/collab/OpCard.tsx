// 제안 안의 변경 하나를 "diff 카드"로: 추가는 초록, 삭제는 빨강, 수정은 칸별로 전 → 후
import type { Item, ItemField, Op, Plan } from '@/lib/types';
import { FIELD_LABEL, KINDS, type Conflict } from '@/lib/proposals';
import { dayLabel, won } from './util';

function text(plan: Pick<Plan, 'target'>, k: ItemField, v: unknown): string {
  if (k === 'day') return v == null ? '날짜 미정' : `${dayLabel(plan, Number(v)).code} · ${dayLabel(plan, Number(v)).text}`;
  if (v == null || v === '') return '—';
  if (k === 'kind') return `${KINDS[v as Item['kind']].icon} ${KINDS[v as Item['kind']].label}`;
  if (k === 'place') return (v as Item['place'])!.name;
  if (k === 'cost') return won(Number(v));
  return String(v);
}

function ItemBlock({ item, plan }: { item: Partial<Item>; plan: Pick<Plan, 'target'> }) {
  const k = item.kind ? KINDS[item.kind] : KINDS.etc;
  const when = item.day == null ? '날짜 미정' : dayLabel(plan, item.day).code;
  return (
    <div className="oc-item">
      <b>
        {k.icon} {item.title} {item.en ? <span className="serif faint">{item.en}</span> : null}
      </b>
      <span className="mono">
        {when}
        {item.time ? ` · ${item.time}` : ''}
        {item.place ? ` · 📍 ${item.place.name}` : ''}
        {item.cost ? ` · ${won(item.cost)}` : ''}
      </span>
      {item.memo ? <p>{item.memo}</p> : null}
    </div>
  );
}

export default function OpCard({ op, plan, items, conflict, skipped }: { op: Op; plan: Pick<Plan, 'target'>; items: Item[]; conflict?: Conflict; skipped?: boolean }) {
  const head = { add: '+ ADD · 추가', update: '✎ EDIT · 수정', remove: '− REMOVE · 삭제' }[op.type];
  const flag = skipped ? '반영 안 됨' : conflict ? (conflict.reason === 'gone' ? '이미 지워진 일정' : '그 사이 바뀜') : '';
  let body: React.ReactNode;
  if (op.type === 'add') body = <ItemBlock item={op.item} plan={plan} />;
  else if (op.type === 'remove') body = <ItemBlock item={op.before} plan={plan} />;
  else {
    const cur = items.find((x) => x.id === op.id);
    const title = op.after.title ?? cur?.title ?? op.before.title ?? '일정';
    const keys = (Object.keys(op.after) as ItemField[]).filter((k) => k !== 'order');
    body = (
      <>
        <div className="oc-item">
          <b>
            {cur ? KINDS[cur.kind].icon : '✎'} {title}
          </b>
        </div>
        {keys.length ? (
          <table className="oc-diff">
            <tbody>
              {keys.map((k) => {
                const hot = conflict?.fields.includes(k);
                return (
                  <tr key={k} className={hot ? 'hot' : ''}>
                    <th>{FIELD_LABEL[k]}</th>
                    <td>
                      <span className="was">{text(plan, k, op.before[k])}</span>
                      <span className="arrow">→</span>
                      <span className="now">{text(plan, k, op.after[k])}</span>
                      {hot && cur ? (
                        <small className="hot-note">
                          ⚠ 지금 계획에는 <b>{text(plan, k, cur[k])}</b>(으)로 바뀌어 있어요
                        </small>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="oc-only">순서만 바꿨어요</p>
        )}
      </>
    );
  }
  return (
    <article className={`opcard ${op.type}${conflict ? ' has-conflict' : ''}${skipped ? ' is-skipped' : ''}`}>
      <header>
        <span className="mono">{head}</span>
        {flag ? <span className="oc-flag">{flag}</span> : null}
      </header>
      {body}
    </article>
  );
}
