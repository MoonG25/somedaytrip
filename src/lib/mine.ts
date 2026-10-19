// "내 계획": 이 브라우저가 만들었거나, 주인 인증했거나, 제안을 보냈거나, 링크로 열어 본 계획 id 목록
// 서버 쿠키(sdt_mine)에도 백업해서, 브라우저 저장소가 지워져도 홈에서 되살린다
import type { Bundle } from './types';

const KEY = 'sdt:mine';

export function readMine(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberPlan(id: string) {
  const before = readMine();
  writeMine([id, ...before.filter((x) => x !== id)]);
  if (!before.includes(id)) fetch('/api/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [id], keep: true }) }).catch(() => {});
}

/** 목록 통째로 다시 쓰기 (홈이 서버에서 확인한 목록으로 맞출 때) */
export function writeMine(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.slice(0, 100)));
    window.dispatchEvent(new Event('sdt:mine'));
  } catch {}
}

export function forgetPlan(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readMine().filter((x) => x !== id)));
  } catch {}
}

export type MineRow = { bundle: Pick<Bundle, 'plan' | 'items'>; owner: boolean; open: number };

/** 브라우저 목록 + 서버 쿠키 백업을 합친 "내 계획" */
export async function loadMine(): Promise<MineRow[]> {
  const r = await fetch('/api/mine', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: readMine() }) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()).rows;
}
