// 장소 검색. 1단계는 키가 필요 없는 OSM Nominatim을 쓴다 (초당 1회 제한이라 줄을 세운다).
// 동네 가게까지 잘 찾으려면 2단계에서 카카오 로컬 API를 서버 함수 뒤에 붙인다.
import type { Place } from '../types';

let last = 0;
let queue: Promise<unknown> = Promise.resolve();
const cache = new Map<string, Place[]>();

export interface Near {
  lat: number;
  lng: number;
  /** 위도·경도 몇 도 안쪽을 먼저 찾을지 */
  span: number;
}

export function searchPlaces(q: string, near?: Near | null, signal?: AbortSignal): Promise<Place[]> {
  q = q.trim();
  if (q.length < 2) return Promise.resolve([]);
  const key = `${q}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)},${near.span}` : ''}`;
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);

  const run = async () => {
    if (signal?.aborted) return [];
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (signal?.aborted) return [];
    last = Date.now();
    const u = new URL('https://nominatim.openstreetmap.org/search');
    u.searchParams.set('q', q);
    u.searchParams.set('format', 'jsonv2');
    u.searchParams.set('limit', '8');
    u.searchParams.set('accept-language', 'ko');
    u.searchParams.set('addressdetails', '0');
    if (near) {
      const s = near.span;
      u.searchParams.set('viewbox', `${near.lng - s},${near.lat + s},${near.lng + s},${near.lat - s}`);
    }
    const r = await fetch(u, { signal });
    if (!r.ok) throw new Error(`검색 실패 (${r.status})`);
    const rows = (await r.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
    const places = rows.map((x) => {
      const parts = x.display_name.split(', ');
      return { name: x.name || parts[0], address: parts.slice(x.name ? 0 : 1, 4).join(', '), lat: +x.lat, lng: +x.lon };
    });
    cache.set(key, places);
    return places;
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

export async function reverse(lat: number, lng: number): Promise<Place> {
  const fallback = { name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
  try {
    const wait = last + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ko`);
    const x = await r.json();
    if (!x?.display_name) return fallback;
    const parts = String(x.display_name).split(', ');
    return { name: x.name || parts[0], address: parts.slice(0, 4).join(', '), lat, lng };
  } catch {
    return fallback;
  }
}
