// 쿠키: 계획별 주인 토큰(sdt_o_<id>)과 이 브라우저의 손님 id(sdt_uid). 둘 다 httpOnly라 페이지 스크립트가 읽을 수 없다.
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

export async function isOwner(id: string) {
  return repo().checkToken(id, await ownerToken(id));
}

/** remember=false면 브라우저를 닫을 때 지워지는 쿠키 */
export async function setOwnerToken(id: string, token: string, remember: boolean) {
  (await cookies()).set(ownerKey(id), token, { httpOnly: true, sameSite: 'lax', secure, path: '/', ...(remember ? { maxAge: YEAR } : {}) });
}

export async function clearOwnerToken(id: string) {
  (await cookies()).delete(ownerKey(id));
}

/** 이 브라우저의 손님 id. 제안 철회 같은 "내가 보낸 것" 확인에 쓴다 */
export async function visitorId(create = false) {
  const jar = await cookies();
  let v = jar.get('sdt_uid')?.value;
  if (!v && create) {
    v = uid(16);
    jar.set('sdt_uid', v, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: YEAR });
  }
  return v ?? null;
}
