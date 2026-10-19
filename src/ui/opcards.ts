// 제안 안의 변경을 "diff 카드"로 보여 준다. 추가는 초록, 삭제는 빨강, 수정은 칸별로 전 → 후.
import type { Item, ItemField, Op, Plan } from '../types';
import { FIELD_LABEL, fieldText, type Conflict } from '../lib/proposals';
import { dayLabel, esc, KINDS, won } from '../lib/util';

function itemBlock(item: Partial<Item>, plan: Plan) {
  const k = item.kind ? KINDS[item.kind] : KINDS.etc;
  const when = item.day == null ? '날짜 미정' : dayLabel(plan.when, item.day);
  return `
    <div class="oc-item">
      <b>${k.icon} ${esc(item.title)}</b>
      <span>${esc(when)}${item.time ? ` · ${esc(item.time)}` : ''}${item.place ? ` · 📍 ${esc(item.place.name)}` : ''}${item.cost ? ` · ${won(item.cost)}` : ''}</span>
      ${item.memo ? `<p>${esc(item.memo)}</p>` : ''}
    </div>`;
}

export function opCard(op: Op, i: number, plan: Plan, items: Item[], conflict?: Conflict, skipped = false) {
  const cls = `opcard ${op.type}${conflict ? ' has-conflict' : ''}${skipped ? ' is-skipped' : ''}`;
  const head = { add: '＋ 추가', update: '✎ 수정', remove: '－ 삭제' }[op.type];
  const flag = skipped ? `<span class="oc-flag">반영 안 됨</span>` : conflict ? `<span class="oc-flag warn">${conflict.reason === 'gone' ? '이미 지워진 일정' : '그 사이 바뀜'}</span>` : '';
  let body = '';
  if (op.type === 'add') body = itemBlock(op.item, plan);
  else if (op.type === 'remove') body = itemBlock(op.before, plan);
  else {
    const cur = items.find((x) => x.id === op.id);
    const title = op.after.title ?? cur?.title ?? op.before.title ?? '일정';
    const rows = (Object.keys(op.after) as ItemField[])
      .filter((k) => k !== 'order')
      .map((k) => {
        const hot = conflict?.fields.includes(k);
        return `<tr class="${hot ? 'hot' : ''}">
          <th>${FIELD_LABEL[k]}</th>
          <td><span class="was">${esc(k === 'day' ? dayText(plan, op.before[k]) : fieldText(k, op.before[k]))}</span><span class="arrow">→</span><span class="now">${esc(k === 'day' ? dayText(plan, op.after[k]) : fieldText(k, op.after[k]))}</span></td>
        </tr>${hot && cur ? `<tr class="hot-note"><td colspan="2">⚠️ 지금 계획에는 <b>${esc(k === 'day' ? dayText(plan, cur[k]) : fieldText(k, cur[k]))}</b>(으)로 바뀌어 있어요</td></tr>` : ''}`;
      })
      .join('');
    const onlyOrder = Object.keys(op.after).every((k) => k === 'order');
    body = `<div class="oc-item"><b>${cur ? KINDS[cur.kind].icon : '✎'} ${esc(title)}</b></div>
      ${onlyOrder ? '<p class="muted small">순서만 바꿨어요</p>' : `<table class="oc-diff">${rows}</table>`}`;
  }
  return `<article class="${cls}" data-op="${i}"><header><span class="oc-type">${head}</span>${flag}</header>${body}</article>`;
}

function dayText(plan: Plan, v: unknown) {
  return v == null ? '날짜 미정' : dayLabel(plan.when, Number(v));
}
