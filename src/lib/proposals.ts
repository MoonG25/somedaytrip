// 제안(PR)의 순수 로직. 화면·저장소와 떨어져 있어서 테스트하기 쉽고, 2단계에서 서버 함수로 옮기기도 쉽다.
//
// 변경 하나(Op)는 "무엇을, 원래 어땠는데, 어떻게 바꾸자"를 담는다.
// 수락할 때 지금 계획과 비교해서, 그 사이 같은 칸을 누가 바꿨으면 충돌로 본다 (3-way 비교).
import type { Item, ItemField, Kind, Op } from './types';

export const KINDS: Record<Kind, { label: string; icon: string }> = {
  see: { label: '구경', icon: '📍' },
  eat: { label: '먹기', icon: '🍜' },
  cafe: { label: '카페', icon: '☕' },
  shop: { label: '쇼핑', icon: '🛍️' },
  move: { label: '이동', icon: '🚆' },
  stay: { label: '숙소', icon: '🛏️' },
  etc: { label: '기타', icon: '✨' },
};

export const FIELD_LABEL: Record<ItemField, string> = {
  day: '날짜',
  time: '시간',
  title: '이름',
  en: '영문 이름',
  kind: '종류',
  place: '장소',
  memo: '메모',
  cost: '비용',
  order: '순서',
};

const FIELDS = Object.keys(FIELD_LABEL) as ItemField[];

export const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 두 일정의 다른 칸만 뽑아 update 변경으로 만든다. 같으면 null */
export function diffItem(before: Item, after: Item): Op | null {
  const b: Partial<Item> = {};
  const a: Partial<Item> = {};
  for (const k of FIELDS) {
    if (!same(before[k], after[k])) {
      (b as Record<string, unknown>)[k] = before[k];
      (a as Record<string, unknown>)[k] = after[k];
    }
  }
  return Object.keys(a).length ? { type: 'update', id: before.id, before: b, after: a } : null;
}

export interface Conflict {
  op: number;
  reason: 'gone' | 'changed';
  fields: ItemField[];
}

// 순서는 누가 바꿔도 충돌로 치지 않는다 (나중에 반영한 쪽을 따른다)
const IGNORE: ItemField[] = ['order'];

/** 지금 일정(items)에 변경들을 반영할 수 있는지 본다 */
export function findConflicts(items: Item[], ops: Op[]): Conflict[] {
  const now = new Map(items.map((i) => [i.id, i]));
  const out: Conflict[] = [];
  ops.forEach((op, i) => {
    if (op.type === 'add') return;
    const cur = now.get(op.id);
    if (op.type === 'update') {
      if (!cur) return out.push({ op: i, reason: 'gone', fields: [] });
      // 내가 바꾸려는 칸을 그 사이 다른 사람이 다른 값으로 바꿨으면 충돌
      const fields = (Object.keys(op.after) as ItemField[]).filter(
        (k) => !IGNORE.includes(k) && !same(cur[k], op.before[k]) && !same(cur[k], op.after[k])
      );
      if (fields.length) out.push({ op: i, reason: 'changed', fields });
      return;
    }
    // 지우자는 제안: 이미 지워졌으면 그냥 통과. 그 사이 내용이 바뀌었으면 확인이 필요하다
    if (!cur) return;
    const fields = FIELDS.filter((k) => !IGNORE.includes(k) && !same(cur[k], op.before[k]));
    if (fields.length) out.push({ op: i, reason: 'changed', fields });
  });
  return out;
}

/** 변경들을 반영한 새 일정 목록. skip에 든 번호는 건너뛴다 */
export function applyOps(items: Item[], ops: Op[], skip: Set<number> = new Set()): Item[] {
  let list = items.map((i) => ({ ...i }));
  ops.forEach((op, i) => {
    if (skip.has(i)) return;
    if (op.type === 'add') {
      if (!list.some((x) => x.id === op.item.id)) list.push({ ...op.item });
    } else if (op.type === 'update') {
      list = list.map((x) => (x.id === op.id ? { ...x, ...op.after, id: x.id } : x));
    } else {
      list = list.filter((x) => x.id !== op.id);
    }
  });
  return sortItems(list);
}

export function sortItems(items: Item[]) {
  return items.slice().sort((a, b) => (a.day ?? 999) - (b.day ?? 999) || a.order - b.order);
}

/**
 * 승객이 고친 내용을 "제안 바구니"에 담는다. 같은 일정을 여러 번 고치면 하나로 합친다.
 * - 바구니에 추가해 둔 일정을 고치면 → 추가 내용 자체를 고친다
 * - 바구니에 추가해 둔 일정을 지우면 → 추가를 없던 일로
 * - 이미 고친 일정을 또 고치면 → 처음 값(before)은 유지하고 바뀐 값만 합친다. 원래대로 돌아오면 빠진다
 * - 고친 일정을 지우면 → 원래 모습(before)을 지우자는 제안으로
 */
export function stage(ops: Op[], op: Op): Op[] {
  const out = ops.slice();
  if (op.type === 'add') return [...out, op];

  const ai = out.findIndex((o) => o.type === 'add' && o.item.id === op.id);
  if (ai >= 0) {
    const add = out[ai] as Extract<Op, { type: 'add' }>;
    if (op.type === 'update') out[ai] = { type: 'add', item: { ...add.item, ...op.after, id: add.item.id } };
    else out.splice(ai, 1);
    return out;
  }

  const ui = out.findIndex((o) => o.type === 'update' && o.id === op.id);
  if (ui >= 0) {
    const prev = out[ui] as Extract<Op, { type: 'update' }>;
    if (op.type === 'update') {
      const before: Record<string, unknown> = { ...op.before, ...prev.before };
      const after: Record<string, unknown> = { ...prev.after, ...op.after };
      for (const k of Object.keys(after)) {
        if (same(before[k], after[k])) {
          delete before[k];
          delete after[k];
        }
      }
      if (Object.keys(after).length) out[ui] = { type: 'update', id: op.id, before, after };
      else out.splice(ui, 1);
    } else {
      out[ui] = { type: 'remove', id: op.id, before: { ...op.before, ...prev.before } as Item };
    }
    return out;
  }

  // 지웠던 걸 다시 지우는 일은 없지만, 혹시 있으면 한 번만
  if (op.type === 'remove' && out.some((o) => o.type === 'remove' && o.id === op.id)) return out;
  return [...out, op];
}

export type Mark = 'add' | 'update' | 'remove' | null;

/** 바구니를 반영해 보이는 목록. 지울 예정인 일정도 줄 그어 보여 주려고 남겨 둔다 */
export function stagedView(items: Item[], ops: Op[]): { item: Item; mark: Mark; fields: ItemField[] }[] {
  const removed = new Set(ops.filter((o) => o.type === 'remove').map((o) => o.id));
  const updated = new Map(ops.filter((o) => o.type === 'update').map((o) => [o.id, Object.keys(o.after) as ItemField[]]));
  const added = new Set(ops.filter((o) => o.type === 'add').map((o) => o.item.id));
  const applied = applyOps(items, ops.filter((o) => o.type !== 'remove'));
  return applied.map((item) => ({
    item,
    mark: removed.has(item.id) ? 'remove' : added.has(item.id) ? 'add' : updated.has(item.id) ? 'update' : null,
    fields: updated.get(item.id) ?? [],
  }));
}

export function opTitle(op: Op) {
  return op.type === 'add' ? op.item.title : op.type === 'remove' ? op.before.title : (op.after.title ?? op.before.title);
}

/** "추가 2 · 수정 1 · 삭제 1" */
export function opCounts(ops: Op[]) {
  const c = { add: 0, update: 0, remove: 0 };
  for (const o of ops) c[o.type]++;
  return [c.add && `추가 ${c.add}`, c.update && `수정 ${c.update}`, c.remove && `삭제 ${c.remove}`].filter(Boolean).join(' · ');
}

/** 기록에 남길 한 줄 요약 */
export function describeOps(ops: Op[], items: Item[]) {
  const name = (id: string) => items.find((i) => i.id === id)?.title;
  const parts = ops.slice(0, 3).map((o) => {
    if (o.type === 'add') return `'${o.item.title}' 추가`;
    if (o.type === 'remove') return `'${o.before.title}' 삭제`;
    const t = o.after.title ?? name(o.id) ?? o.before.title ?? '일정';
    return `'${t}' ${(Object.keys(o.after) as ItemField[]).map((k) => FIELD_LABEL[k]).join('·')} 수정`;
  });
  return parts.join(', ') + (ops.length > 3 ? ` 외 ${ops.length - 3}건` : '');
}

/** 칸 값을 사람이 읽는 글로 */
export function fieldText(k: ItemField, v: unknown): string {
  if (k === 'day' && v == null) return '날짜 미정';
  if (v == null || v === '') return '—';
  if (k === 'day') return `${v}일차`;
  if (k === 'kind') return `${KINDS[v as Item['kind']].icon} ${KINDS[v as Item['kind']].label}`;
  if (k === 'place') return (v as Item['place'])!.name;
  if (k === 'cost') return `${Number(v).toLocaleString('ko-KR')}원`;
  return String(v);
}
