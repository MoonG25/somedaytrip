// 이 브라우저의 "나". 손님 닉네임, 주인 토큰, 제안 바구니를 기억한다.
// 주인 토큰은 잃어버려도 괜찮다. 비밀번호만 알면 언제든 다시 주인 인증을 받을 수 있다.
import type { Me, Op } from '../types';
import { uid } from './util';

const ls = localStorage;
const ss = sessionStorage;

function get<T>(s: Storage, k: string, fallback: T): T {
  try {
    const v = s.getItem(k);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function set(s: Storage, k: string, v: unknown) {
  try {
    if (v == null) s.removeItem(k);
    else s.setItem(k, JSON.stringify(v));
  } catch {
    /* 저장 공간이 막힌 브라우저 */
  }
}

// ---- 손님 닉네임 ----
export function me(): Me | null {
  return get<Me | null>(ls, 'sdt:me', null);
}
export function setMyName(name: string): Me {
  const m = { id: me()?.id ?? uid(12), name: name.trim().slice(0, 20) };
  set(ls, 'sdt:me', m);
  return m;
}

// ---- 주인 토큰 ----
// "이 브라우저에서 기억"을 고르면 localStorage(브라우저를 닫아도 유지), 아니면 sessionStorage(이 탭만)
export function ownerToken(planId: string): string | null {
  return get<string | null>(ss, `sdt:owner:${planId}`, null) ?? get<string | null>(ls, `sdt:owner:${planId}`, null);
}
export function saveOwnerToken(planId: string, token: string, remember: boolean) {
  set(remember ? ls : ss, `sdt:owner:${planId}`, token);
  set(remember ? ss : ls, `sdt:owner:${planId}`, null);
}
export function clearOwnerToken(planId: string) {
  set(ls, `sdt:owner:${planId}`, null);
  set(ss, `sdt:owner:${planId}`, null);
}

// 주인이 손님 화면을 미리 볼 때 (이 탭에서만)
export function viewAsGuest(planId: string) {
  return get(ss, `sdt:guestview:${planId}`, false);
}
export function setViewAsGuest(planId: string, on: boolean) {
  set(ss, `sdt:guestview:${planId}`, on || null);
}

// ---- 제안 바구니 (아직 보내지 않은 변경) ----
export interface Draft {
  baseVersion: number;
  ops: Op[];
}
export function loadDraft(planId: string): Draft | null {
  return get<Draft | null>(ls, `sdt:draft:${planId}`, null);
}
export function saveDraft(planId: string, d: Draft | null) {
  set(ls, `sdt:draft:${planId}`, d && d.ops.length ? d : null);
}
