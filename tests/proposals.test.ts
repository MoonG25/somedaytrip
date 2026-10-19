import { describe, expect, it } from 'vitest';
import type { Item, Op } from '../src/lib/types';
import { applyOps, diffItem, findConflicts, stage, stagedView } from '../src/lib/proposals';

const mk = (id: string, o: Partial<Item> = {}): Item => ({ id, day: 1, time: '', title: id, en: '', kind: 'see', place: null, memo: '', cost: null, order: 0, ...o });

describe('diffItem', () => {
  it('바뀐 칸만 담는다', () => {
    const a = mk('a', { time: '10:00' });
    expect(diffItem(a, { ...a, time: '11:00' })).toEqual({ type: 'update', id: 'a', before: { time: '10:00' }, after: { time: '11:00' } });
    expect(diffItem(a, { ...a })).toBeNull();
  });
});

describe('findConflicts / applyOps', () => {
  const base = [mk('a', { time: '10:00', memo: 'x' }), mk('b', { order: 1 })];

  it('겹치지 않으면 충돌 없음, 다른 칸 변경은 합쳐진다', () => {
    const op: Op = { type: 'update', id: 'a', before: { time: '10:00' }, after: { time: '11:00' } };
    const now = [{ ...base[0], memo: '주인이 바꿈' }, base[1]];
    expect(findConflicts(now, [op])).toEqual([]);
    expect(applyOps(now, [op])[0]).toMatchObject({ time: '11:00', memo: '주인이 바꿈' });
  });

  it('같은 칸을 다른 값으로 바꿨으면 충돌', () => {
    const op: Op = { type: 'update', id: 'a', before: { time: '10:00' }, after: { time: '11:00' } };
    const now = [{ ...base[0], time: '09:00' }, base[1]];
    expect(findConflicts(now, [op])).toEqual([{ op: 0, reason: 'changed', fields: ['time'] }]);
  });

  it('같은 값으로 바꿨으면 충돌 아님', () => {
    const op: Op = { type: 'update', id: 'a', before: { time: '10:00' }, after: { time: '11:00' } };
    expect(findConflicts([{ ...base[0], time: '11:00' }], [op])).toEqual([]);
  });

  it('지워진 일정을 고치자는 제안은 gone', () => {
    const op: Op = { type: 'update', id: 'a', before: { time: '10:00' }, after: { time: '11:00' } };
    expect(findConflicts([base[1]], [op])[0].reason).toBe('gone');
  });

  it('순서 변경은 충돌로 치지 않는다', () => {
    const op: Op = { type: 'update', id: 'b', before: { order: 1 }, after: { order: 5 } };
    expect(findConflicts([base[0], { ...base[1], order: 3 }], [op])).toEqual([]);
  });

  it('지우자는 제안: 이미 없으면 통과, 내용이 바뀌었으면 충돌', () => {
    const op: Op = { type: 'remove', id: 'a', before: base[0] };
    expect(findConflicts([base[1]], [op])).toEqual([]);
    expect(findConflicts([{ ...base[0], memo: 'y' }], [op])[0].fields).toEqual(['memo']);
  });

  it('skip에 든 변경은 건너뛴다', () => {
    const ops: Op[] = [
      { type: 'add', item: mk('c', { order: 2 }) },
      { type: 'remove', id: 'a', before: base[0] },
    ];
    expect(applyOps(base, ops, new Set([1])).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(applyOps(base, ops).map((i) => i.id)).toEqual(['b', 'c']);
  });
});

describe('stage (제안 바구니)', () => {
  const a = mk('a', { time: '10:00', title: 'A' });

  it('추가한 걸 고치면 추가 내용이 바뀌고, 지우면 사라진다', () => {
    const c = mk('c');
    let ops = stage([], { type: 'add', item: c });
    ops = stage(ops, { type: 'update', id: 'c', before: { title: 'c' }, after: { title: 'C!' } });
    expect(ops).toEqual([{ type: 'add', item: { ...c, title: 'C!' } }]);
    expect(stage(ops, { type: 'remove', id: 'c', before: { ...c, title: 'C!' } })).toEqual([]);
  });

  it('같은 일정을 두 번 고치면 처음 값을 유지하고 합친다', () => {
    let ops = stage([], { type: 'update', id: 'a', before: { time: '10:00' }, after: { time: '11:00' } });
    ops = stage(ops, { type: 'update', id: 'a', before: { time: '11:00', title: 'A' }, after: { time: '12:00', title: 'AA' } });
    expect(ops).toEqual([{ type: 'update', id: 'a', before: { time: '10:00', title: 'A' }, after: { time: '12:00', title: 'AA' } }]);
  });

  it('원래 값으로 되돌리면 변경이 빠진다', () => {
    let ops = stage([], { type: 'update', id: 'a', before: { time: '10:00' }, after: { time: '11:00' } });
    ops = stage(ops, { type: 'update', id: 'a', before: { time: '11:00' }, after: { time: '10:00' } });
    expect(ops).toEqual([]);
  });

  it('고친 일정을 지우면 원래 모습을 지우자는 제안이 된다', () => {
    let ops = stage([], { type: 'update', id: 'a', before: { time: '10:00' }, after: { time: '11:00' } });
    ops = stage(ops, { type: 'remove', id: 'a', before: { ...a, time: '11:00' } });
    expect(ops).toEqual([{ type: 'remove', id: 'a', before: a }]);
  });

  it('stagedView는 지울 예정인 일정도 표시해 둔다', () => {
    const ops: Op[] = [{ type: 'remove', id: 'a', before: a }, { type: 'add', item: mk('n', { order: 9 }) }];
    expect(stagedView([a], ops).map((r) => [r.item.id, r.mark])).toEqual([
      ['a', 'remove'],
      ['n', 'add'],
    ]);
  });
});
