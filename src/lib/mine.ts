// "내 계획": 이 브라우저가 만들었거나, 주인 인증했거나, 제안을 보냈거나, 링크로 열어 본 계획 id 목록
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
  try {
    localStorage.setItem(KEY, JSON.stringify([id, ...readMine().filter((x) => x !== id)].slice(0, 100)));
  } catch {}
}

export function forgetPlan(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify(readMine().filter((x) => x !== id)));
  } catch {}
}
