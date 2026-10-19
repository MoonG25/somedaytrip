// Supabase 통합 테스트: DATABASE_URL이 있을 때만 돈다 (node --env-file=.env.local …)
import { afterAll, describe, expect, it } from 'vitest';
import { PgRepo } from '../src/server/pg-repo';
import { cleanInfo } from '../src/lib/clean';
import type { Item } from '../src/lib/types';

const url = process.env.DATABASE_URL;
const item = (id: string): Item => ({ id, day: 1, time: '', title: id, en: '', kind: 'see', place: null, memo: '', cost: null, order: 0 });

describe.skipIf(!url)('PgRepo (Supabase)', () => {
  const r = new PgRepo(url!);
  const made: { id: string; token: string }[] = [];
  afterAll(async () => {
    for (const m of made) await r.remove(m.id, m.token).catch(() => {});
  });

  it('동시에 제안 10개를 보내도 번호가 겹치지 않는다', async () => {
    const { bundle, token } = await r.create(cleanInfo({ title: '동시성', place: '테스트', ownerName: 't' }), [], 'pass1234');
    made.push({ id: bundle.plan.id, token });
    const prs = await Promise.all(Array.from({ length: 10 }, (_, i) => r.propose(bundle.plan.id, { authorId: 'u' + i, authorName: 'u', title: 't', message: '', baseVersion: 1, ops: [{ type: 'add', item: item('x' + i) }] })));
    expect(new Set(prs.map((p) => p.no)).size).toBe(10);
  });

  it('동시에 수락해도 모든 추가가 남고 버전이 정확히 오른다', async () => {
    const { bundle, token } = await r.create(cleanInfo({ title: '동시 수락', place: '테스트', ownerName: 't' }), [], 'pass1234');
    made.push({ id: bundle.plan.id, token });
    const id = bundle.plan.id;
    const prs = [];
    for (let i = 0; i < 6; i++) prs.push(await r.propose(id, { authorId: 'a' + i, authorName: 'a', title: 't', message: '', baseVersion: 1, ops: [{ type: 'add', item: item('y' + i) }] }));
    await Promise.all(prs.map((p) => r.decide(id, token, p.no, 'accept', '')));
    const b = (await r.get(id))!;
    expect(b.items.length).toBe(6);
    expect(b.plan.version).toBe(7);
    expect(b.proposals.every((p) => p.status === 'accepted')).toBe(true);
  });

  it('링크 새로 만들기: 제안·기록·비밀이 새 id로 따라간다 (ON UPDATE CASCADE)', async () => {
    const { bundle, token } = await r.create(cleanInfo({ title: '링크 교체', place: '테스트', ownerName: 't' }), [item('k1')], 'pass1234');
    await r.propose(bundle.plan.id, { authorId: 'z', authorName: 'z', title: 't', message: '', baseVersion: 1, ops: [{ type: 'add', item: item('k2') }] });
    const next = await r.rekey(bundle.plan.id, token);
    made.push({ id: next, token });
    expect(await r.get(bundle.plan.id)).toBeNull();
    const b = (await r.get(next))!;
    expect(b.proposals).toHaveLength(1);
    expect(b.history.length).toBeGreaterThanOrEqual(3);
    expect(await r.checkToken(next, token)).toBe(true);
  });

  it('비밀번호 해시는 묶음에 없고, 틀린 횟수는 저장된다', async () => {
    const { bundle, token } = await r.create(cleanInfo({ title: '보안', place: '테스트', ownerName: 't' }), [], 'pass1234');
    made.push({ id: bundle.plan.id, token });
    expect(JSON.stringify(await r.get(bundle.plan.id))).not.toMatch(/salt|"hash"|tokens/);
    for (let i = 0; i < 20; i++) await r.login(bundle.plan.id, 'x').catch(() => {});
    await expect(r.login(bundle.plan.id, 'pass1234')).rejects.toMatchObject({ code: 'locked' });
  });
});
