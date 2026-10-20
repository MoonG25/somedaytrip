'use server';
// 이메일 계정 (선택 가입): 가입·로그인·인증·비밀번호 찾기·설정·탈퇴. 모든 검사는 서버에서 다시 한다.
import { headers } from 'next/headers';
import { after } from 'next/server';
import { users, RepoError, isRepoError } from '@/server';
import { clearSession, currentUser, sessionToken, setSession } from '@/server/auth';
import { allow } from '@/server/limit';
import { link, mailReady, sendMail } from '@/server/mail';
import type { User } from '@/server/users';

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (isRepoError(e)) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    return { ok: false, error: '처리하지 못했어요. 잠시 뒤 다시 해 주세요' };
  }
}

const ip = async () => ((await headers()).get('x-forwarded-for') || 'local').split(',')[0].trim();
const limit = async (key: string, max: number, ms: number, msg = '너무 자주 시도했어요. 잠시 뒤에 다시 해 주세요') => {
  if (!allow(`${key}:${await ip()}`, max, ms)) throw new RepoError(msg, 'limited');
};

async function sendVerify(u: User) {
  const t = await users().issueToken(u.id, 'verify');
  await sendMail(u.email, '이메일 주소를 확인해 주세요', [`${u.nick}님, 섬데트에 오신 걸 환영해요.`, '아래 버튼을 누르면 이메일 인증이 끝나요. 인증하면 새 제안 알림과 비밀번호 찾기를 쓸 수 있어요.', '링크는 3일 동안 쓸 수 있어요.'], {
    label: '이메일 인증하기',
    url: link(`/verify?t=${t}`),
  });
}

/** 지금 로그인한 계정 (머리말 메뉴용) */
export async function whoami() {
  return run(async () => {
    const u = await currentUser();
    return u ? { nick: u.nick, email: u.email, verified: u.verified } : null;
  });
}

/** 이메일·닉네임 중복 확인 (가입 화면에서 입력할 때) */
export async function checkAvailable(input: { email?: string; nick?: string }) {
  return run(async () => {
    await limit('avail', 40, 60_000);
    return users().available({ email: input.email == null ? undefined : String(input.email), nick: input.nick == null ? undefined : String(input.nick) });
  });
}

export async function signup(input: { email: string; nick: string; password: string; agree: boolean }) {
  return run(async () => {
    if (!input.agree) throw new RepoError('개인정보 수집·이용에 동의해 주세요', 'invalid');
    await limit('signup', 5, 600_000);
    const u = await users().signup(String(input.email ?? ''), String(input.nick ?? ''), String(input.password ?? ''));
    await setSession(await users().createSession(u.id));
    after(() => sendVerify(u).catch((e) => console.error('[mail]', e)));
    return { nick: u.nick, mail: mailReady() };
  });
}

export async function signin(input: { email: string; password: string }) {
  return run(async () => {
    await limit('signin', 10, 600_000, '로그인을 여러 번 시도했어요. 10분 뒤에 다시 해 주세요');
    const u = await users().login(String(input.email ?? ''), String(input.password ?? ''));
    await setSession(await users().createSession(u.id));
    return { nick: u.nick };
  });
}

export async function signout() {
  return run(async () => {
    const t = await sessionToken();
    if (t) await users().logout(t);
    await clearSession();
    return null;
  });
}

export async function resendVerify() {
  return run(async () => {
    const u = await currentUser();
    if (!u) throw new RepoError('로그인이 필요해요', 'forbidden');
    if (u.verified) return { sent: false };
    if (!mailReady()) throw new RepoError('지금은 메일을 보낼 수 없어요. 준비되면 알려 드릴게요', 'invalid');
    await limit(`verify:${u.id}`, 3, 600_000);
    await sendVerify(u);
    return { sent: true };
  });
}

/** 비밀번호 찾기: 가입 여부와 상관없이 같은 답 (누가 가입했는지 떠보지 못하게) */
export async function forgot(email: string) {
  return run(async () => {
    await limit('forgot', 3, 600_000);
    if (!mailReady()) throw new RepoError('지금은 메일을 보낼 수 없어요. 잠시 뒤에 다시 해 주세요', 'invalid');
    const u = await users().byEmail(String(email ?? ''));
    if (u) {
      const t = await users().issueToken(u.id, 'reset');
      after(() =>
        sendMail(u.email, '비밀번호 재설정', [`${u.nick}님, 비밀번호를 다시 정하는 링크예요.`, '요청한 적이 없다면 이 메일은 무시하세요. 링크는 1시간 동안 쓸 수 있어요.'], {
          label: '비밀번호 다시 정하기',
          url: link(`/reset?t=${t}`),
        }).catch((e) => console.error('[mail]', e))
      );
    }
    return null;
  });
}

export async function resetPassword(token: string, password: string) {
  return run(async () => {
    await limit('reset', 10, 600_000);
    const id = await users().resetPassword(String(token ?? ''), String(password ?? ''));
    await setSession(await users().createSession(id));
    return null;
  });
}

export async function setNotify(on: boolean) {
  return run(async () => {
    const u = await currentUser();
    if (!u) throw new RepoError('로그인이 필요해요', 'forbidden');
    await users().setNotify(u.id, !!on);
    return null;
  });
}

/** 계정 비밀번호 바꾸기: 다른 기기 로그인은 풀리고 이 기기는 새 세션 */
export async function changeAccountPassword(current: string, next: string) {
  return run(async () => {
    const u = await currentUser();
    if (!u) throw new RepoError('로그인이 필요해요', 'forbidden');
    await users().changePassword(u.id, String(current ?? ''), String(next ?? ''));
    await setSession(await users().createSession(u.id));
    return null;
  });
}

/** 탈퇴: 비밀번호를 한 번 더 확인한다. 계획 자체는 남는다 (계정 연결만 지워진다) */
export async function deleteAccount(password: string) {
  return run(async () => {
    const u = await currentUser();
    if (!u) throw new RepoError('로그인이 필요해요', 'forbidden');
    await limit(`delete:${u.id}`, 5, 600_000);
    await users().login(u.email, String(password ?? ''));
    await users().remove(u.id);
    await clearSession();
    return null;
  });
}
