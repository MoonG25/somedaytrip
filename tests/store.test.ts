import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStore, StoreError } from '../src/lib/store';
import type { PlanInput } from '../src/types';

class Mem implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const input: PlanInput = { title: '테스트', emoji: '🧳', scope: 'local', place: null, when: { mode: 'someday', days: 2 }, memo: '', ownerName: '주인' };
const item = (id: string, day: number | null = 1) => ({ id, day, time: '', title: id, kind: 'see' as const, place: null, memo: '', cost: null, order: 0 });

describe('LocalStore', () => {
  let s: LocalStore;
  beforeEach(() => (s = new LocalStore(new Mem())));

  it('화면에 넘기는 묶음에는 비밀번호 해시와 토큰이 없다', async () => {
    const { bundle } = await s.create(input, 'pass1234');
    const raw = JSON.stringify(bundle);
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('tokens');
  });

  it('비밀번호를 맞혀야 주인 토큰을 준다', async () => {
    const { bundle } = await s.create(input, 'pass1234');
    await expect(s.login(bundle.plan.id, 'nope')).rejects.toMatchObject({ code: 'forbidden' });
    const t = await s.login(bundle.plan.id, 'pass1234');
    expect(await s.checkToken(bundle.plan.id, t)).toBe(true);
    expect(await s.checkToken(bundle.plan.id, 'fake')).toBe(false);
  });

  it('5번 틀리면 잠긴다', async () => {
    const { bundle } = await s.create(input, 'pass1234');
    for (let i = 0; i < 5; i++) await s.login(bundle.plan.id, 'x').catch(() => {});
    await expect(s.login(bundle.plan.id, 'pass1234')).rejects.toMatchObject({ code: 'locked' });
  });

  it('토큰 없이는 직접 수정·수락을 못 한다', async () => {
    const { bundle } = await s.create(input, 'pass1234');
    await expect(s.applyDirect(bundle.plan.id, 'fake', [{ type: 'add', item: item('a') }], 'x')).rejects.toBeInstanceOf(StoreError);
    const pr = await s.propose(bundle.plan.id, { authorId: 'g', authorName: '손님', title: 't', message: '', baseVersion: 1, ops: [{ type: 'add', item: item('a') }] });
    await expect(s.decide(bundle.plan.id, 'fake', pr.no, 'accept', '')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('제안 → 수락하면 반영되고 버전이 오른다', async () => {
    const { bundle, token } = await s.create(input, 'pass1234');
    const pr = await s.propose(bundle.plan.id, { authorId: 'g', authorName: '손님', title: 't', message: '', baseVersion: 1, ops: [{ type: 'add', item: item('a') }] });
    expect((await s.get(bundle.plan.id))!.items).toHaveLength(0);
    await s.decide(bundle.plan.id, token, pr.no, 'accept', '좋아');
    const b = (await s.get(bundle.plan.id))!;
    expect(b.items.map((i) => i.id)).toEqual(['a']);
    expect(b.plan.version).toBe(2);
    expect(b.proposals[0]).toMatchObject({ status: 'accepted', note: '좋아' });
    await expect(s.decide(bundle.plan.id, token, pr.no, 'reject', '')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('충돌이 있으면 수락을 막고, 겹치지 않는 것만 수락할 수 있다', async () => {
    const { bundle, token } = await s.create(input, 'pass1234', [item('a'), item('b')]);
    const id = bundle.plan.id;
    const pr = await s.propose(id, {
      authorId: 'g', authorName: '손님', title: 't', message: '', baseVersion: 1,
      ops: [
        { type: 'update', id: 'a', before: { time: '' }, after: { time: '10:00' } },
        { type: 'update', id: 'b', before: { memo: '' }, after: { memo: '손님 메모' } },
      ],
    });
    await s.applyDirect(id, token, [{ type: 'update', id: 'a', before: { time: '' }, after: { time: '09:00' } }], '주인');
    await expect(s.decide(id, token, pr.no, 'accept', '')).rejects.toMatchObject({ code: 'conflict' });
    const done = await s.decide(id, token, pr.no, 'accept', '', true);
    expect(done).toMatchObject({ status: 'partial', skipped: [0] });
    const b = (await s.get(id))!;
    expect(b.items.find((i) => i.id === 'a')!.time).toBe('09:00');
    expect(b.items.find((i) => i.id === 'b')!.memo).toBe('손님 메모');
  });

  it('제안한 사람만 철회할 수 있다', async () => {
    const { bundle } = await s.create(input, 'pass1234');
    const pr = await s.propose(bundle.plan.id, { authorId: 'g', authorName: '손님', title: 't', message: '', baseVersion: 1, ops: [{ type: 'add', item: item('a') }] });
    await expect(s.withdraw(bundle.plan.id, pr.no, 'other')).rejects.toMatchObject({ code: 'forbidden' });
    await s.withdraw(bundle.plan.id, pr.no, 'g');
    expect((await s.get(bundle.plan.id))!.proposals[0].status).toBe('withdrawn');
  });

  it('비밀번호를 바꾸면 다른 토큰은 풀린다', async () => {
    const { bundle, token } = await s.create(input, 'pass1234');
    const other = await s.login(bundle.plan.id, 'pass1234');
    await s.changePassword(bundle.plan.id, token, 'pass1234', 'newpass99');
    expect(await s.checkToken(bundle.plan.id, other)).toBe(false);
    expect(await s.checkToken(bundle.plan.id, token)).toBe(true);
    await expect(s.login(bundle.plan.id, 'pass1234')).rejects.toBeTruthy();
    expect(await s.login(bundle.plan.id, 'newpass99')).toBeTruthy();
  });

  it('일수를 줄이면 넘치는 일정은 날짜 미정으로', async () => {
    const { bundle, token } = await s.create(input, 'pass1234', [item('a', 1), item('b', 2)]);
    await s.updatePlan(bundle.plan.id, token, { when: { mode: 'someday', days: 1 } });
    const b = (await s.get(bundle.plan.id))!;
    expect(b.items.find((i) => i.id === 'b')!.day).toBeNull();
  });
});
