// 제안 안의 변경 하나를 "diff 카드"로: 추가는 초록, 삭제는 빨강, 수정은 칸별로 전 → 후
// 일정 칸을 읽는 글(시간 범위·상태·통화 포함 비용)도 여기 둔다: 서버 화면(제안 상세)과 일정 화면이 같이 쓴다.
import type { Item, ItemField, Op, Plan } from '@/lib/types';
import { FIELD_LABEL, KINDS, TAGS, fieldText, type Conflict } from '@/lib/proposals';
import { fmtMoney } from '@/lib/money';
import { dayLabel } from './util';

/** "16:40–17:30" · "16:40" · "~17:30" */
export const timeText = (it: Partial<Pick<Item, 'time' | 'end'>>) => (it.time ? (it.end ? `${it.time}–${it.end}` : it.time) : it.end ? `~${it.end}` : '');

const CUR_NAME: Record<string, string> = { KRW: '원화', JPY: '엔화', USD: '달러', EUR: '유로', CNY: '위안', TWD: '대만 달러', THB: '바트', VND: '동', GBP: '파운드' };
export const curName = (v: unknown) => {
  const c = typeof v === 'string' && v ? v : 'KRW';
  return CUR_NAME[c] ? `${CUR_NAME[c]} ${c}` : c;
};

/** 비용 한 칸: 통화 기호까지 (¥1,300 · ₩16,500) */
export const costText = (cost: unknown, cur?: string) => (cost == null || cost === '' ? '—' : fmtMoney(Number(cost), cur));

type TagKey = keyof typeof TAGS;

/** 칸 값을 사람이 읽는 글로 (비용은 통화와 함께, 상태는 아이콘과 함께) */
export function valText(k: ItemField, v: unknown, cur?: string): string {
  if (k === 'cost') return costText(v, cur);
  if (k === 'cur') return curName(v);
  if (k === 'tag') return v && TAGS[v as TagKey] ? `${TAGS[v as TagKey].icon} ${TAGS[v as TagKey].label}` : '—';
  return fieldText(k, v);
}

/**
 * 수정 변경의 "전 → 후" 줄들. 시간·끝 시각은 "시간" 한 줄로, 비용·통화는 "비용" 한 줄로 묶는다.
 * 전 값은 지금 일정(없으면 제안 당시) 값
 */
export function changeRows(op: Op, items: Item[]): { key: string; label: string; from: string; to: string }[] {
  if (op.type !== 'update') return [];
  const cur = items.find((i) => i.id === op.id);
  const was: Partial<Item> = { ...op.before, ...(cur ?? {}) };
  const now: Partial<Item> = { ...was, ...op.after };
  const keys = (Object.keys(op.after) as ItemField[]).filter((k) => k !== 'order');
  const out: ReturnType<typeof changeRows> = [];
  let time = false;
  let cost = false;
  for (const k of keys) {
    if (k === 'time' || k === 'end') {
      if (time) continue;
      time = true;
      out.push({ key: 'time', label: FIELD_LABEL.time, from: timeText(was) || '—', to: timeText(now) || '—' });
    } else if (k === 'cost' || k === 'cur') {
      if (cost) continue;
      cost = true;
      // 비용 없이 통화만 바뀌면 통화 이름으로
      if (!was.cost && !now.cost) out.push({ key: 'cur', label: FIELD_LABEL.cur, from: curName(was.cur), to: curName(now.cur) });
      else out.push({ key: 'cost', label: FIELD_LABEL.cost, from: costText(was.cost, was.cur), to: costText(now.cost, now.cur) });
    } else out.push({ key: k, label: FIELD_LABEL[k], from: valText(k, was[k]), to: valText(k, now[k]) });
  }
  return out;
}

function text(plan: Pick<Plan, 'target'>, k: ItemField, v: unknown, cur?: string): string {
  if (k === 'day') return v == null ? '날짜 미정' : `${dayLabel(plan, Number(v)).code} · ${dayLabel(plan, Number(v)).text}`;
  if (k === 'cur') return curName(v);
  if (v == null || v === '') return '—';
  if (k === 'kind') return `${KINDS[v as Item['kind']].icon} ${KINDS[v as Item['kind']].label}`;
  if (k === 'place') return (v as Item['place'])!.name;
  return valText(k, v, cur);
}

function ItemBlock({ item, plan }: { item: Partial<Item>; plan: Pick<Plan, 'target'> }) {
  const k = item.kind ? KINDS[item.kind] : KINDS.etc;
  const when = item.day == null ? '날짜 미정' : dayLabel(plan, item.day).code;
  const tag = item.tag ? TAGS[item.tag] : null;
  return (
    <div className="oc-item">
      <b>
        {k.icon} {item.title} {item.en ? <span className="serif faint">{item.en}</span> : null}
        {tag ? (
          <span className={`ri-tag t-${item.tag}`}>
            <span aria-hidden="true">{tag.icon}</span> {tag.label}
          </span>
        ) : null}
      </b>
      <span className="mono">
        {when}
        {timeText(item) ? ` · ${timeText(item)}` : ''}
        {item.place ? ` · 📍 ${item.place.name}` : ''}
        {item.cost ? ` · ${costText(item.cost, item.cur)}` : ''}
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
    // 비용은 그때의 통화로 읽는다 (통화 칸을 같이 바꿨으면 바꾼 통화로)
    const curBefore = 'cur' in op.before ? op.before.cur : cur?.cur;
    const curAfter = 'cur' in op.after ? op.after.cur : curBefore;
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
                      <span className="was">{text(plan, k, op.before[k], curBefore)}</span>
                      <span className="arrow">→</span>
                      <span className="now">{text(plan, k, op.after[k], curAfter)}</span>
                      {hot && cur ? (
                        <small className="hot-note">
                          ⚠ 지금 계획에는 <b>{text(plan, k, cur[k], cur.cur)}</b>(으)로 바뀌어 있어요
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
