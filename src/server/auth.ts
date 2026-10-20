// 쿠키: 계획별 기장 토큰(sdt_o_<id>)과 이 브라우저의 승객 id(sdt_uid). 둘 다 httpOnly라 페이지 스크립트가 읽을 수 없다.
import 'server-only';
import { cookies } from 'next/headers';
import { repo } from './index';
import { uid } from './secret';

const YEAR = 60 * 60 * 24 * 365;
const ownerKey = (id: string) => `sdt_o_${id.replace(/[^a-z0-9-]/gi, '')}`;
const secure = process.env.NODE_ENV === 'production';

export async function ownerToken(id: string) {
  return (await cookies()).get(ownerKey(id))?.value ?? null;
}

/** 기장인지: 이 브라우저의 기장 토큰, 또는 로그인한 계정이 이 계획의 기장 */
export async function isOwner(id: string) {
  if (await repo().checkToken(id, await ownerToken(id))) return true;
  return accountOwns(id);
}

/** 로그인한 계정이 이 계획의 기장인지 (계획 비밀번호 없이 관리) */
export async function accountOwns(id: string) {
  const u = await currentUser();
  if (!u) return false;
  const { users } = await import('./index');
  return (await users().owners(id)).includes(u.id);
}

/** remember=false면 브라우저를 닫을 때 지워지는 쿠키 */
export async function setOwnerToken(id: string, token: string, remember: boolean) {
  (await cookies()).set(ownerKey(id), token, { httpOnly: true, sameSite: 'lax', secure, path: '/', ...(remember ? { maxAge: YEAR } : {}) });
}

export async function clearOwnerToken(id: string) {
  (await cookies()).delete(ownerKey(id));
}

/** 이 브라우저의 승객 id. 제안 철회 같은 "내가 보낸 것" 확인에 쓴다 */
export async function visitorId(create = false) {
  const jar = await cookies();
  let v = jar.get('sdt_uid')?.value;
  if (!v && create) {
    v = uid(16);
    jar.set('sdt_uid', v, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: YEAR });
  }
  return v ?? null;
}

// "내 계획" 목록 백업. 브라우저 저장소(localStorage)가 지워져도(사파리는 7일 안 오면 지운다)
// 서버가 내려준 쿠키는 1년 남는다. 계획을 볼 수 있는 id라서 httpOnly로 스크립트에서 숨긴다.
const MINE = 'sdt_mine';
const okId = (s: string) => /^[a-z0-9-]{1,60}$/i.test(s);

/** 쿠키에 남은 "내 계획" id들 + 기장 쿠키(sdt_o_<id>)가 있는 계획 id들 */
export async function savedMine() {
  const jar = await cookies();
  const fromList = (jar.get(MINE)?.value ?? '').split('.').filter(okId);
  const owned = jar
    .getAll()
    .filter((c) => c.name.startsWith('sdt_o_'))
    .map((c) => c.name.slice(6))
    .filter(okId);
  return [...fromList, ...owned];
}

export async function setSavedMine(ids: string[]) {
  const jar = await cookies();
  let v = '';
  for (const id of ids.filter(okId)) {
    if (v.length + id.length + 1 > 3000) break; // 쿠키 한 개 4KB 안으로
    v = v ? `${v}.${id}` : id;
  }
  if (v === (jar.get(MINE)?.value ?? '')) return; // 같으면 다시 쓰지 않는다
  if (v) jar.set(MINE, v, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: YEAR });
  else jar.delete(MINE);
}

/* ---------- 이메일 계정 세션 (선택 가입) ---------- */
// sdt_s: 세션 토큰 (httpOnly). sdt_authed: 로그인 상태 표시만 (머리말을 깜빡임 없이 그리려고 스크립트가 읽는다. 비밀 아님)
const SESSION = 'sdt_s';
const AUTHED = 'sdt_authed';

export async function sessionToken() {
  return (await cookies()).get(SESSION)?.value ?? null;
}

export async function setSession(token: string) {
  const jar = await cookies();
  const maxAge = 60 * 60 * 24 * 30;
  jar.set(SESSION, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge });
  jar.set(AUTHED, '1', { httpOnly: false, sameSite: 'lax', secure, path: '/', maxAge });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION);
  jar.delete(AUTHED);
}

/** 지금 로그인한 계정 (없으면 null) */
export async function currentUser() {
  const { users } = await import('./index');
  const u = await users().bySession(await sessionToken());
  if (!u && (await cookies()).get(AUTHED)) {
    // 세션이 끝났는데 표시만 남았으면 지운다 (서버 액션·라우트에서만 지울 수 있어서 실패는 무시)
    try {
      (await cookies()).delete(AUTHED);
    } catch {}
  }
  return u;
}

/** 이 브라우저(그리고 계정)로 낸 제안을 알아보는 id들. 계정은 'u:<id>' */
export async function authorIds() {
  const [u, v] = await Promise.all([currentUser(), visitorId()]);
  return [u ? `u:${u.id}` : null, v].filter(Boolean) as string[];
}
