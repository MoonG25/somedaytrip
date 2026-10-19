// 기장 비밀번호: 원문은 저장하지 않고 PBKDF2-SHA256(15만 회) 해시와 솔트만 남긴다. 서버에서만 쓴다.
import 'server-only';
import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);
const ITER = 150_000;

export interface Secret {
  salt: string;
  hash: string;
  iter: number;
}

export async function makeSecret(password: string): Promise<Secret> {
  const salt = randomBytes(16);
  const hash = await derive(password.normalize('NFC'), salt, ITER, 32, 'sha256');
  return { salt: salt.toString('base64'), hash: hash.toString('base64'), iter: ITER };
}

export async function checkSecret(password: string, s: Secret) {
  const got = await derive(password.normalize('NFC'), Buffer.from(s.salt, 'base64'), s.iter, 32, 'sha256');
  const want = Buffer.from(s.hash, 'base64');
  return got.length === want.length && timingSafeEqual(got, want);
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('base64');

// 헷갈리는 0/o/1/l은 뺀 32글자. 256으로 나눠 떨어져 치우침이 없다
const ALPHA = '23456789abcdefghijkmnpqrstuvwxyz';
export const uid = (n = 10) => Array.from(randomBytes(n), (b) => ALPHA[b % 32]).join('');
