// 협업 UI에서 쓰는 작은 도구
import type { Plan } from '@/lib/types';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** "DAY 01" + 날짜가 있으면 "11월 21일 (금)" */
export function dayLabel(plan: Pick<Plan, 'target'>, day: number | null) {
  if (day == null) return { code: 'SOMEDAY', text: '날짜 미정 · 언젠가 가 볼 곳' };
  const code = `DAY ${String(day).padStart(2, '0')}`;
  if (!plan.target) return { code, text: `${day}일차` };
  const d = new Date(plan.target + 'T00:00:00');
  d.setDate(d.getDate() + day - 1);
  return { code, text: `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})` };
}

/** 일차마다 다른 색 (첫날은 포인트 색) */
export const dayColor = (day: number | null) => (day == null ? 'var(--ink-3)' : day === 1 ? 'var(--accent)' : `oklch(0.64 0.15 calc(var(--hue) + ${(day - 1) * 67}))`);

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export function ago(t: number) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return '방금';
  if (s < 3600) return `${Math.round(s / 60)}분 전`;
  if (s < 86400) return `${Math.round(s / 3600)}시간 전`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}일 전`;
  const d = new Date(t);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const distanceLabel = (d: number) => (d < 1 ? `${Math.round(d * 100) * 10}m` : `${d < 10 ? d.toFixed(1) : Math.round(d)}km`);

export function toast(msg: string, icon = '✦') {
  import('@/blog/toast.js').then((m) => m.toast(msg, icon));
}

/** 다른 탭에 "이 계획이 바뀌었어요" 알리기 */
export function broadcast(id: string) {
  try {
    const bc = new BroadcastChannel('sdt');
    bc.postMessage({ id });
    bc.close();
  } catch {}
}
