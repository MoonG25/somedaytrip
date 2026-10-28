import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FileRepo } from '../src/server/repo';
import { cleanInfo, groupTotal } from '../src/lib/clean';
import type { Item } from '../src/lib/types';

const info = cleanInfo({ title: '테스트', place: '교토', placeEn: 'Kyoto', days: 2, ownerName: '기장', visibility: 'link' });
const item = (id: string, day: number | null = 1): Item => ({ id, day, time: '', title: id, en: '', kind: 'see', place: null, memo: '', cost: null, order: 0 });
const pr = (ops: any[], authorId = 'g') => ({ authorId, authorName: '승객', title: 't', message: '', baseVersion: 1, ops });

describe('FileRepo', () => {
  let r: FileRepo;
  beforeEach(() => {
    r = new FileRepo(mkdtempSync(path.join(tmpdir(), 'sdt-')));
  });

  it('처음 실행하면 예시 계획 8개가 전체 공개로 들어간다', async () => {
    const list = await r.listPublic();
    expect(list.length).toBe(8);
    expect(list.every((b) => b.plan.sample && b.plan.visibility === 'public')).toBe(true);
    expect(list.find((b) => b.plan.id === 'kyoto-autumn-plan')!.items.length).toBeGreaterThan(3);
  });

  it('화면에 넘기는 묶음에는 비밀번호 해시와 토큰이 없다', async () => {
    const { bundle } = await r.create(info, [], 'pass1234');
    const raw = JSON.stringify(await r.get(bundle.plan.id));
    expect(raw).not.toMatch(/secret|tokens|"hash"|salt/);
  });

  it('주소 이름(slug)을 영문 이름과 기간으로 만든다', async () => {
    const { bundle } = await r.create(info, [], 'pass1234');
    expect(bundle.plan.slug).toBe('kyoto-2days');
  });

  it('링크 공개 계획은 공개 목록에 없다', async () => {
    const { bundle } = await r.create(info, [], 'pass1234');
    expect((await r.listPublic()).some((b) => b.plan.id === bundle.plan.id)).toBe(false);
  });

  it('비밀번호를 맞혀야 기장 토큰을 준다 · 계획 전체로 20번 틀리면 잠긴다', async () => {
    const { bundle } = await r.create(info, [], 'pass1234');
    const id = bundle.plan.id;
    await expect(r.login(id, 'nope')).rejects.toMatchObject({ code: 'forbidden' });
    const t = await r.login(id, 'pass1234');
    expect(await r.checkToken(id, t)).toBe(true);
    for (let i = 0; i < 20; i++) await r.login(id, 'x').catch(() => {});
    await expect(r.login(id, 'pass1234')).rejects.toMatchObject({ code: 'locked' });
  });

  it('토큰 없이는 직접 수정·수락·정보 수정·체크를 못 한다', async () => {
    const { bundle } = await r.create(info, [], 'pass1234');
    const id = bundle.plan.id;
    await expect(r.applyDirect(id, 'fake', [{ type: 'add', item: item('a') }])).rejects.toMatchObject({ code: 'forbidden' });
    await expect(r.updateInfo(id, 'fake', info)).rejects.toMatchObject({ code: 'forbidden' });
    const p = await r.propose(id, pr([{ type: 'add', item: item('a') }]));
    await expect(r.decide(id, 'fake', p.no, 'accept', '')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('제안 → 수락하면 반영되고 버전이 오른다', async () => {
    const { bundle, token } = await r.create(info, [], 'pass1234');
    const id = bundle.plan.id;
    const p = await r.propose(id, pr([{ type: 'add', item: item('a') }]));
    expect((await r.get(id))!.items).toHaveLength(0);
    await r.decide(id, token, p.no, 'accept', '좋아');
    const b = (await r.get(id))!;
    expect(b.items.map((i) => i.id)).toEqual(['a']);
    expect(b.plan.version).toBe(2);
    expect(b.proposals[0]).toMatchObject({ status: 'accepted', note: '좋아' });
  });

  it('충돌이 있으면 수락을 막고, 겹치지 않는 것만 수락할 수 있다', async () => {
    const { bundle, token } = await r.create(info, [item('a'), item('b')], 'pass1234');
    const id = bundle.plan.id;
    const p = await r.propose(id, pr([
      { type: 'update', id: 'a', before: { time: '' }, after: { time: '10:00' } },
      { type: 'update', id: 'b', before: { memo: '' }, after: { memo: '승객 메모' } },
    ]));
    await r.applyDirect(id, token, [{ type: 'update', id: 'a', before: { time: '' }, after: { time: '09:00' } }]);
    await expect(r.decide(id, token, p.no, 'accept', '')).rejects.toMatchObject({ code: 'conflict' });
    expect(await r.decide(id, token, p.no, 'accept', '', true)).toMatchObject({ status: 'partial', skipped: [0] });
    const b = (await r.get(id))!;
    expect(b.items.find((i) => i.id === 'a')!.time).toBe('09:00');
    expect(b.items.find((i) => i.id === 'b')!.memo).toBe('승객 메모');
  });

  it('같은 사람이 10분에 5번 넘게 제안하면 막는다', async () => {
    const { bundle } = await r.create(info, [], 'pass1234');
    for (let i = 0; i < 5; i++) await r.propose(bundle.plan.id, pr([{ type: 'add', item: item('a' + i) }]));
    await expect(r.propose(bundle.plan.id, pr([{ type: 'add', item: item('z') }]))).rejects.toMatchObject({ code: 'limited' });
    await expect(r.propose(bundle.plan.id, pr([{ type: 'add', item: item('y') }], 'other'))).resolves.toBeTruthy();
  });

  it('제안한 사람만 철회 · 기장은 열린 제안을 한꺼번에 거절', async () => {
    const { bundle, token } = await r.create(info, [], 'pass1234');
    const id = bundle.plan.id;
    const p = await r.propose(id, pr([{ type: 'add', item: item('a') }]));
    await expect(r.withdraw(id, p.no, ['other'])).rejects.toMatchObject({ code: 'forbidden' });
    await r.withdraw(id, p.no, ['g']);
    await r.propose(id, pr([{ type: 'add', item: item('b') }], 'x'));
    await r.propose(id, pr([{ type: 'add', item: item('c') }], 'y'));
    expect(await r.rejectAllOpen(id, token, '')).toBe(2);
  });

  it('비밀번호를 바꾸면 다른 토큰은 풀린다', async () => {
    const { bundle, token } = await r.create(info, [], 'pass1234');
    const id = bundle.plan.id;
    const other = await r.login(id, 'pass1234');
    await r.changePassword(id, token, 'pass1234', 'newpass99');
    expect(await r.checkToken(id, other)).toBe(false);
    expect(await r.checkToken(id, token)).toBe(true);
  });

  it('기간을 줄이면 넘치는 일정은 날짜 미정으로 · 체크는 누구나', async () => {
    const { bundle, token } = await r.create({ ...info, checklist: [['여권', false]] }, [item('a', 1), item('b', 2)], 'pass1234');
    const id = bundle.plan.id;
    await r.updateInfo(id, token, { ...info, days: 1, checklist: [['여권', false]] });
    expect((await r.get(id))!.items.find((i) => i.id === 'b')!.day).toBeNull();
    await r.setCheck(id, 0, true);
    expect((await r.get(id))!.plan.checklist[0][1]).toBe(true);
  });

  it('브라우저에서 온 이상한 값은 서버가 다듬는다', async () => {
    const { bundle } = await r.create(cleanInfo({ title: 'x'.repeat(500), days: 999, months: [0, 13, 5, 5], scope: 'moon', visibility: 'everyone', iata: 'ab1c' }), [], 'pass1234');
    const p = bundle.plan;
    expect(p.title.length).toBe(60);
    expect(p.days).toBe(60);
    expect(p.months).toEqual([1, 5, 12]);
    expect(p.scope).toBe('abroad');
    expect(p.visibility).toBe('link');
    expect(p.iata).toBe('AB');
  });
});

describe('추가 id 겹침', () => {
  it('제안의 추가 일정 id가 기존 일정과 겹쳐도 수락하면 추가된다', async () => {
    const r = new FileRepo(mkdtempSync(path.join(tmpdir(), 'sdt-')));
    const { bundle, token } = await r.create(info, [item('a')], 'pass1234');
    const id = bundle.plan.id;
    const p = await r.propose(id, pr([
      { type: 'update', id: 'a', before: { time: '' }, after: { time: '09:00' } },
      { type: 'add', item: { ...item('a'), title: '새 일정', time: '15:00' } },
    ]));
    await r.decide(id, token, p.no, 'accept', '');
    const b = (await r.get(id))!;
    expect(b.items.map((i) => i.title).sort()).toEqual(['a', '새 일정']);
    expect(new Set(b.items.map((i) => i.id)).size).toBe(2);
  });
});

describe('인원 · 예산', () => {
  it('"다 같이" 항목은 인원으로 나눠 1인 예산을 만든다', () => {
    const i = cleanInfo({ title: 't', place: 'p', travelers: 2, budgetItems: [{ name: '항공', amount: 400000, per: 'person' }, { name: '숙소', amount: 600000, per: 'group' }] });
    expect(i.travelers).toBe(2);
    expect(i.budget).toEqual({ 항공: 400000, 숙소: 300000 });
    expect(groupTotal(i.budgetItems, i.travelers)).toBe(1400000);
  });
  it('예전 데이터(budget만)는 1인당 항목으로 읽는다', () => {
    const i = cleanInfo({ title: 't', place: 'p', budget: { 항공: 380000 } });
    expect(i.travelers).toBe(1);
    expect(i.budgetItems).toEqual([{ name: '항공', amount: 380000, per: 'person' }]);
  });
});

describe('지도 링크', () => {
  it('http(s)만 받고, 붙여 넣은 문장에서 주소만 뽑고, 종류로 이름을 붙인다', () => {
    const i = cleanInfo({
      title: 't',
      place: 'p',
      links: [
        { url: '구글맵에서 공유: https://maps.app.goo.gl/AbCd123 ' },
        { url: 'javascript:alert(1)' },
        { url: 'https://naver.me/xyz', label: '' },
        { url: 'https://blog.example.com/kyoto', label: '교토 정리 글' },
      ],
    });
    expect(i.links).toEqual([
      { url: 'https://maps.app.goo.gl/AbCd123', label: 'Google 지도' },
      { url: 'https://naver.me/xyz', label: '네이버 지도' },
      { url: 'https://blog.example.com/kyoto', label: '교토 정리 글' },
    ]);
  });
});

describe('링크 새로 만들기', () => {
  it('새 id로 옮기고 예전 id는 사라진다 · 제안·일정·기장 토큰은 그대로', async () => {
    const r = new FileRepo(mkdtempSync(path.join(tmpdir(), 'sdt-')));
    const { bundle, token } = await r.create(info, [item('a')], 'pass1234');
    await r.propose(bundle.plan.id, pr([{ type: 'add', item: item('b') }]));
    await expect(r.rekey(bundle.plan.id, 'fake')).rejects.toMatchObject({ code: 'forbidden' });
    const next = await r.rekey(bundle.plan.id, token);
    expect(next).not.toBe(bundle.plan.id);
    expect(await r.get(bundle.plan.id)).toBeNull();
    const b = (await r.get(next))!;
    expect(b.plan.id).toBe(next);
    expect(b.items.map((i) => i.id)).toEqual(['a']);
    expect(b.proposals).toHaveLength(1);
    expect(await r.checkToken(next, token)).toBe(true);
  });
});

describe('일정 위에서 하나씩 결정', () => {
  let r: FileRepo;
  beforeEach(() => {
    r = new FileRepo(mkdtempSync(path.join(tmpdir(), 'sdt-')));
  });
  it('변경 하나씩 반영·거절 · 모두 결정되면 제안 상태가 정해진다 · 같은 걸 원한 제안은 정리', async () => {
    const { bundle, token } = await r.create(info, [item('a')], 'pass1234');
    const id = bundle.plan.id;
    const p1 = await r.propose(id, pr([{ type: 'add', item: item('n1') }, { type: 'update', id: 'a', before: { memo: '' }, after: { memo: '우산' } }], 'x'));
    const p2 = await r.propose(id, pr([{ type: 'add', item: item('n2') }], 'y'));
    expect(await r.decideOps(id, token, [{ no: p1.no, index: 0, decision: 'accept' }, { no: p2.no, index: 0, decision: 'supersede' }])).toEqual({ accepted: 1, rejected: 0 });
    let b = (await r.get(id))!;
    expect(b.items.map((i) => i.id).sort()).toEqual(['a', 'n1']);
    expect(b.proposals.find((x) => x.no === p1.no)!.status).toBe('open');
    expect(b.proposals.find((x) => x.no === p2.no)!.status).toBe('accepted');
    await r.decideOps(id, token, [{ no: p1.no, index: 1, decision: 'reject' }]);
    b = (await r.get(id))!;
    const done = b.proposals.find((x) => x.no === p1.no)!;
    expect(done.status).toBe('partial');
    expect(done.ops.map((o) => o.state)).toEqual(['accepted', 'rejected']);
    expect(b.items.find((i) => i.id === 'a')!.memo).toBe('');
    await expect(r.decideOps(id, 'nope', [{ no: p1.no, index: 0, decision: 'accept' }])).rejects.toThrow();
  });
  it('그 사이 바뀐 칸은 막고, force면 덮어쓴다 · 승객은 자기 변경만 철회', async () => {
    const { bundle, token } = await r.create(info, [item('a')], 'pass1234');
    const id = bundle.plan.id;
    const p = await r.propose(id, pr([{ type: 'update', id: 'a', before: { time: '' }, after: { time: '11:00' } }, { type: 'add', item: item('n') }], 'x'));
    await r.applyDirect(id, token, [{ type: 'update', id: 'a', before: { time: '' }, after: { time: '09:00' } }]);
    await expect(r.decideOps(id, token, [{ no: p.no, index: 0, decision: 'accept' }])).rejects.toThrow(/겹치는/);
    await r.decideOps(id, token, [{ no: p.no, index: 0, decision: 'accept' }], true);
    expect((await r.get(id))!.items.find((i) => i.id === 'a')!.time).toBe('11:00');
    await expect(r.withdrawOp(id, p.no, 1, ['someone-else'])).rejects.toThrow();
    await r.withdrawOp(id, p.no, 1, ['x']);
    expect((await r.get(id))!.proposals[0].status).toBe('partial');
  });
});

describe('준비물 바로 고치기', () => {
  let r: FileRepo;
  beforeEach(() => {
    r = new FileRepo(mkdtempSync(path.join(tmpdir(), 'sdt-')));
  });
  it('모두의 체크리스트: 누구나 더하기·고치기·지우기·체크 · 같은 글자는 막고 · 번호가 어긋나도 글자로 찾는다', async () => {
    const { bundle } = await r.create({ ...info, checklist: [['여권', false]] }, [], 'pass1234');
    const id = bundle.plan.id;
    await r.editChecklist(id, { type: 'add', text: '  JR패스 교환 ' });
    await expect(r.editChecklist(id, { type: 'add', text: '여권' })).rejects.toThrow(/이미 있는/);
    await r.setCheck(id, 0, true);
    await r.editChecklist(id, { type: 'rename', index: 1, from: 'JR패스 교환', to: 'JR패스 교환하기' });
    expect((await r.get(id))!.plan.checklist).toEqual([['여권', true], ['JR패스 교환하기', false]]);
    // 다른 사람이 앞 항목을 지워 번호가 어긋난 경우: 글자로 찾아 체크·지우기
    await r.setCheck(id, 9, true, 'JR패스 교환하기');
    expect((await r.get(id))!.plan.checklist[1]).toEqual(['JR패스 교환하기', true]);
    await r.editChecklist(id, { type: 'remove', index: 5, text: 'JR패스 교환하기' });
    const b = (await r.get(id))!;
    expect(b.plan.checklist).toEqual([['여권', true]]);
    expect(b.plan.version).toBe(bundle.plan.version); // 일정 버전은 그대로
    await expect(r.setCheck(id, 3, true, '없는 항목')).rejects.toThrow(/지워진/);
  });
});

describe('계획 정보 저장은 체크리스트를 덮어쓰지 않는다', () => {
  it('기장이 예전 목록으로 정보를 저장해도 그사이 누군가 더한 준비물은 남는다', async () => {
    const r = new FileRepo(mkdtempSync(path.join(tmpdir(), 'sdt-')));
    const { bundle, token } = await r.create({ ...info, checklist: [['여권', false]] }, [], 'pass1234');
    const id = bundle.plan.id;
    await r.editChecklist(id, { type: 'add', text: '보조배터리' });
    await r.updateInfo(id, token, { ...info, title: '새 이름', checklist: [['여권', false]] });
    const p = (await r.get(id))!.plan;
    expect(p.title).toBe('새 이름');
    expect(p.checklist.map(([t]) => t)).toEqual(['여권', '보조배터리']);
  });
});
