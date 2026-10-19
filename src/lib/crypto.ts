// 주인 비밀번호는 원문을 저장하지 않고 PBKDF2(SHA-256)로 늘린 해시만 남긴다.
// 1단계에서는 브라우저가 검사하지만, 2단계에서는 같은 해시를 서버(Supabase RPC)가 검사한다.

export interface Secret {
  salt: string;
  hash: string;
  iter: number;
}

const ITER = 150_000;
const enc = new TextEncoder();

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array, iter: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, key, 256);
}

export async function makeSecret(password: string): Promise<Secret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: b64(salt), hash: b64(await derive(password, salt, ITER)), iter: ITER };
}

export async function checkSecret(password: string, s: Secret) {
  const got = new Uint8Array(await derive(password, unb64(s.salt), s.iter));
  const want = unb64(s.hash);
  // 길이가 같으면 끝까지 비교한다 (어디서 틀렸는지 시간으로 새지 않게)
  let diff = got.length ^ want.length;
  for (let i = 0; i < Math.min(got.length, want.length); i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

export async function sha256(s: string) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** 비밀번호 강도를 0~3으로. 막지는 않고 안내만 한다 */
export function strength(pw: string) {
  if (pw.length < 4) return 0;
  let kinds = 0;
  if (/[a-z]/.test(pw)) kinds++;
  if (/[A-Z]/.test(pw)) kinds++;
  if (/\d/.test(pw)) kinds++;
  if (/[^a-zA-Z\d]/.test(pw)) kinds++;
  if (pw.length >= 10 && kinds >= 2) return 3;
  if (pw.length >= 7 && kinds >= 2) return 2;
  return 1;
}
