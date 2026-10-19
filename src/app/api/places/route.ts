// 장소 검색: 여러 곳의 결과를 합친다.
//  - 카카오 로컬 (KAKAO_REST_API_KEY가 있으면): 한국 가게·동네는 이게 가장 정확하다. 무료 (하루 쿼터 넉넉)
//  - Photon (komoot, OSM): 자동완성·오타에 강하다. 키 없음
//  - Nominatim (OSM): 한국어 이름이 잘 붙는다. 키 없음, 초당 1회
// mode=dest면 도시·동네 같은 "지역", mode=poi면 가게·명소까지.
// 결과는 서버 메모리에 잠깐 캐시하고, 응답에는 키가 절대 들어가지 않는다.
import { NextResponse } from 'next/server';
import { findCities } from '@/blog/cities.js';
import { allow, clientIp } from '@/server/limit';

export const runtime = 'nodejs';

type Hit = {
  name: string;
  en?: string;
  address?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  lat: number;
  lng: number;
  kind: 'region' | 'poi';
  source: 'kakao' | 'photon' | 'osm' | 'list';
};

const UA = 'SomedayTrip/0.2 (+https://somedaytrip.vercel.app)';
const cache = new Map<string, { at: number; hits: Hit[] }>();
const REGION = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood', 'borough', 'district', 'county', 'state', 'province', 'region', 'country', 'island', 'municipality', 'locality']);

async function kakao(q: string, lat?: number, lng?: number): Promise<Hit[]> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return [];
  const u = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  u.searchParams.set('query', q);
  u.searchParams.set('size', '8');
  if (lat != null && lng != null) {
    u.searchParams.set('y', String(lat));
    u.searchParams.set('x', String(lng));
  }
  const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(3000) });
  if (!r.ok) return [];
  const d = (await r.json()) as { documents: { place_name: string; road_address_name: string; address_name: string; x: string; y: string; category_name: string }[] };
  return d.documents.map((x) => ({
    name: x.place_name,
    address: x.road_address_name || x.address_name,
    country: '대한민국',
    countryCode: 'KR',
    city: (x.address_name || '').split(' ').slice(0, 2).join(' '),
    lat: +x.y,
    lng: +x.x,
    kind: 'poi' as const,
    source: 'kakao' as const,
  }));
}

async function photon(q: string, mode: string, lat?: number, lng?: number): Promise<Hit[]> {
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '8');
  if (lat != null && lng != null && mode === 'poi') {
    u.searchParams.set('lat', String(lat));
    u.searchParams.set('lon', String(lng));
  }
  if (mode === 'dest') for (const l of ['city', 'district', 'locality', 'county', 'state', 'country']) u.searchParams.append('layer', l);
  const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(3500) });
  if (!r.ok) return [];
  const d = (await r.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }[] };
  return d.features
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties;
      const region = REGION.has(p.type) || REGION.has(p.osm_value);
      return {
        name: p.name,
        address: [p.street && `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}`, p.district, p.city, p.state, p.country].filter(Boolean).join(', '),
        country: p.country,
        countryCode: p.countrycode?.toUpperCase(),
        city: p.city || (region ? p.name : undefined),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        kind: region ? ('region' as const) : ('poi' as const),
        source: 'photon' as const,
      };
    });
}

let lastOsm = 0;
async function osm(q: string, mode: string, lat?: number, lng?: number): Promise<Hit[]> {
  // 초당 1회 규칙: 너무 붙어 오면 이번엔 건너뛴다 (Photon·카카오 결과로 충분)
  if (Date.now() - lastOsm < 1000) return [];
  lastOsm = Date.now();
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('limit', '6');
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('namedetails', '1');
  u.searchParams.set('accept-language', 'ko');
  if (mode === 'dest') u.searchParams.set('featureType', 'settlement');
  if (lat != null && lng != null && mode === 'poi') u.searchParams.set('viewbox', `${lng - 0.5},${lat + 0.5},${lng + 0.5},${lat - 0.5}`);
  const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(3500) });
  if (!r.ok) return [];
  const d = (await r.json()) as { name: string; display_name: string; lat: string; lon: string; addresstype?: string; type?: string; address?: Record<string, string>; namedetails?: Record<string, string> }[];
  return d.map((g) => {
    const region = REGION.has(g.addresstype || '') || REGION.has(g.type || '');
    const a = g.address || {};
    return {
      name: g.namedetails?.['name:ko'] || g.name || g.display_name.split(',')[0],
      en: g.namedetails?.['name:en'],
      address: g.display_name.split(', ').slice(1, 5).join(', '),
      country: a.country,
      countryCode: a.country_code?.toUpperCase(),
      city: a.city || a.town || a.village || a.county,
      lat: +g.lat,
      lng: +g.lon,
      kind: region ? ('region' as const) : ('poi' as const),
      source: 'osm' as const,
    };
  });
}

const dist = (a: Hit, b: Hit) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180)) * 111;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const mode = url.searchParams.get('mode') === 'dest' ? 'dest' : 'poi';
  const lat = url.searchParams.has('lat') ? Number(url.searchParams.get('lat')) : undefined;
  const lng = url.searchParams.has('lng') ? Number(url.searchParams.get('lng')) : undefined;
  if (q.length < 2) return NextResponse.json({ hits: [] });
  // 한 사람이 1분에 40번까지 (자동완성으로 치기엔 넉넉하고, 남용은 막는다)
  if (!allow(`places:${clientIp(req)}`, 40, 60_000)) return NextResponse.json({ hits: [], limited: true }, { status: 429, headers: { 'Retry-After': '30' } });
  const key = `${mode}|${q}|${lat?.toFixed(1)}|${lng?.toFixed(1)}`;
  const c = cache.get(key);
  if (c && Date.now() - c.at < 3600_000) return NextResponse.json({ hits: c.hits });

  // 목적지는 한글 이름표에서 먼저 (오픈스트리트맵에 외국 도시 한글 이름이 빠진 경우가 많다)
  const listed: Hit[] = mode === 'dest' ? findCities(q) : [];
  const results = await Promise.allSettled([kakao(q, lat, lng), photon(q, mode, lat, lng), osm(q, mode, lat, lng)]);
  const [k, p, o] = results.map((r) => (r.status === 'fulfilled' ? r.value : []));
  // 순서: 카카오(한국 가게) → Nominatim(한국어 이름) → Photon. 가까운 같은 곳은 하나로 (한국어 이름·영문 이름을 합친다)
  const out: Hit[] = [];
  for (const h of [...listed, ...k, ...o, ...p]) {
    if (mode === 'dest' && h.kind !== 'region' && h.source !== 'kakao' && h.source !== 'list') continue;
    const same = out.find((x) => dist(x, h) < (h.kind === 'region' ? 8 : 0.15) || (x.name === h.name && dist(x, h) < 2));
    if (same) {
      same.en ||= h.en || (h.source === 'photon' && /^[\x00-\x7FÀ-ɏ\s'.-]+$/.test(h.name) ? h.name : undefined);
      same.countryCode ||= h.countryCode;
      same.country ||= h.country;
      continue;
    }
    out.push({ ...h });
  }
  const hits = out.slice(0, 8);
  cache.set(key, { at: Date.now(), hits });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return NextResponse.json({ hits }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
}
