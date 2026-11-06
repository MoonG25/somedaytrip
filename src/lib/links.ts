// 지도·참고 링크: 붙여 넣은 주소가 어떤 지도인지 알아보고 이름·아이콘을 붙인다
export type LinkKind = 'google' | 'naver' | 'kakao' | 'web';

export interface PlanLink {
  label: string;
  url: string;
}

export function linkKind(url: string): LinkKind {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'maps.app.goo.gl' || (h === 'goo.gl' && u.pathname.startsWith('/maps')) || h === 'maps.google.com' || (/^google\.[a-z.]+$/.test(h) && u.pathname.startsWith('/maps'))) return 'google';
    if (h === 'naver.me' || h === 'map.naver.com' || h === 'm.map.naver.com') return 'naver';
    if (h === 'kko.to' || h === 'map.kakao.com' || h === 'place.map.kakao.com' || h === 'm.map.kakao.com') return 'kakao';
  } catch {}
  return 'web';
}

export const LINK_META: Record<LinkKind, { label: string; icon: string }> = {
  google: { label: 'Google 지도', icon: '🗺️' },
  naver: { label: '네이버 지도', icon: '🟢' },
  kakao: { label: '카카오맵', icon: '🟡' },
  web: { label: '링크', icon: '🔗' },
};

export function defaultLabel(url: string) {
  const k = linkKind(url);
  if (k !== 'web') return LINK_META[k].label;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '링크';
  }
}

/** http(s)만. 앞뒤 공백·붙여 넣을 때 딸려 온 글자를 정리한다 (예: "구글맵 공유: https://…") */
export function normalizeUrl(raw: string): string | null {
  const m = String(raw ?? '').match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** 장소 좌표 → 구글맵에서 그 위치 열기 */
export const googleMapsAt = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** 두 장소 사이 구글 길찾기 (키 없이 여는 주소). mode: walking · transit · driving, 없으면 구글이 고른다 */
export function googleDirections(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode?: string) {
  const p = (x: { lat: number; lng: number }) => `${x.lat.toFixed(6)},${x.lng.toFixed(6)}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${p(from)}&destination=${p(to)}${mode ? `&travelmode=${mode}` : ''}`;
}
