import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FileUserStore } from '../src/server/users';
import { nickError } from '../src/lib/account';

describe('계정 (FileUserStore)', () => {
  let s: FileUserStore;
  beforeEach(() => {
    s = new FileUserStore(mkdtempSync(path.join(tmpdir(), 'sdt-u-')));
  });

  it('가입 · 이메일과 닉네임 중복은 대소문자·공백을 무시하고 막는다', async () => {
    const u = await s.signup('Moon@Example.com ', '문왕', 'password1');
    expect(u.email).toBe('moon@example.com');
    await expect(s.signup('moon@example.COM', '다른이름', 'password1')).rejects.toThrow(/이미 가입된 이메일/);
    await expect(s.signup('other@example.com', '문왕', 'password1')).rejects.toThrow(/이미 쓰는 닉네임/);
    await s.signup('a@b.co', 'Trip_1', 'password1');
    await expect(s.signup('c@b.co', 'trip_1', 'password1')).rejects.toThrow(/이미 쓰는 닉네임/);
    expect(await s.available({ email: 'MOON@example.com', nick: '새이름' })).toEqual({ email: false, nick: true });
  });

  it('규칙: 닉네임 2~12자·허용 글자·예약어, 비밀번호 8자', async () => {
    expect(nickError('a')).toMatch(/2~12/);
    expect(nickError('공백 있음')).toMatch(/한글·영문/);
    expect(nickError('기장')).toMatch(/쓸 수 없는/);
    expect(nickError('Admin')).toMatch(/쓸 수 없는/);
    await expect(s.signup('x@y.zz', '괜찮아', 'short')).rejects.toThrow(/8자/);
    await expect(s.signup('not-email', '괜찮아', 'password1')).rejects.toThrow(/이메일/);
  });

  it('로그인 · 세션 · 틀리면 같은 문장 · 10번 틀리면 잠김', async () => {
    const u = await s.signup('m@x.io', '문문', 'password1');
    await expect(s.login('nobody@x.io', 'password1')).rejects.toThrow('이메일 또는 비밀번호가 맞지 않아요');
    await expect(s.login('m@x.io', 'wrong-pass')).rejects.toThrow('이메일 또는 비밀번호가 맞지 않아요');
    const t = await s.createSession((await s.login('M@x.io', 'password1')).id);
    expect((await s.bySession(t))?.id).toBe(u.id);
    await s.logout(t);
    expect(await s.bySession(t)).toBeNull();
    for (let i = 0; i < 10; i++) await s.login('m@x.io', 'nope-nope').catch(() => {});
    await expect(s.login('m@x.io', 'password1')).rejects.toMatchObject({ code: 'locked' });
  });

  it('인증 링크·재설정 링크는 한 번만 · 재설정하면 다른 세션은 풀린다', async () => {
    const u = await s.signup('v@x.io', '인증', 'password1');
    const vt = await s.issueToken(u.id, 'verify');
    await s.verify(vt);
    expect((await s.get(u.id))!.verified).toBe(true);
    await expect(s.verify(vt)).rejects.toThrow(/이미 쓴/);
    const sess = await s.createSession(u.id);
    const rt = await s.issueToken(u.id, 'reset');
    await expect(s.verify(rt)).rejects.toThrow(); // 종류가 다르면 안 된다
    await s.resetPassword(rt, 'newpassword');
    expect(await s.bySession(sess)).toBeNull();
    await s.login('v@x.io', 'newpassword');
  });

  it('내 계획 연결: 기장은 내려가지 않는다 · 링크 바꾸기·삭제를 따라간다 · 알림은 5분에 한 통', async () => {
    const u = await s.signup('p@x.io', '기록', 'password1');
    await s.link(u.id, 'plan1', 'owner');
    await s.link(u.id, 'plan1', 'member');
    await s.link(u.id, 'plan2', 'member');
    expect((await s.links(u.id)).find((l) => l.planId === 'plan1')!.role).toBe('owner');
    expect(await s.owners('plan1')).toEqual([u.id]);
    await s.renamePlan('plan1', 'plan9');
    expect(await s.owners('plan9')).toEqual([u.id]);
    await s.forgetPlan('plan2');
    expect((await s.links(u.id)).map((l) => l.planId)).toEqual(['plan9']);
    expect(await s.mailable(u.id)).toBeNull(); // 인증 전
    await s.verify(await s.issueToken(u.id, 'verify'));
    expect(await s.mailable(u.id)).not.toBeNull();
    expect(await s.mailable(u.id)).toBeNull(); // 5분 안에 또는 안 보낸다
    await s.remove(u.id);
    expect(await s.owners('plan9')).toEqual([]);
  });
});
