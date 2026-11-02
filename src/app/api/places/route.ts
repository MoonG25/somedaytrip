// 장소 검색: 여러 곳의 결과를 합친다.
//  - 카카오 로컬 (KAKAO_REST_API_KEY가 있으면): 한국 가게·동네는 이게 가장 정확하다. 무료 (하루 쿼터 넉넉)
//  - Photon (komoot, OSM): 자동완성·오타에 강하다. 키 없음
//  - Nominatim (OSM): 한국어 이름이 잘 붙는다. 키 없음, 초당 1회
// mode=dest면 도시·동네 같은 "지역", mode=poi면 가게·명소까지.
// 결과는 서버 메모리에 잠깐 캐시하고, 응답에는 키가 절대 들어가지 않는다.
import { NextResponse } from 'next/server';
import { findCities } from '@/blog/cities.js';
import { allow, clientIp } from '@/server/limit';
import { inKorea, jpBias, km, lookupJp, mergeHits, pickJp, rankHits, type Hit } from '@/lib/place-rank';
import { JP_AREAS } from '@/data/jp-ko';

export const runtime = 'nodejs';

const UA = 'SomedayTrip/0.2 (+https://somedaytrip.vercel.app)';
const cache = new Map<string, { at: number; hits: Hit[]; far: boolean }>();
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
async function osm(q: string, mode: string, lat?: number, lng?: number, wait = false): Promise<Hit[]> {
  // 초당 1회 규칙: 너무 붙어 오면 이번엔 건너뛴다 (Photon·카카오 결과로 충분).
  // 사전 명소 조회(wait)는 Nominatim이 사실상 유일한 출처라 차례를 기다린다 (건너뛰면 결과가 비어 버린다)
  const gap = 1000 - (Date.now() - lastOsm);
  if (gap > 0) {
    if (!wait) return [];
    lastOsm = Date.now() + gap;
    await new Promise((r) => setTimeout(r, gap));
  } else lastOsm = Date.now();
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
  // 결과가 있으면 1시간, 비었으면 1분만 (이름 추천이 먼저 보낸 검색이 '없음'을 오래 남기지 않게)
  if (c && Date.now() - c.at < (c.hits.length ? 3600_000 : 60_000)) return NextResponse.json(c.far ? { hits: c.hits, far: true } : { hits: c.hits });
  const near = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;

  // 목적지는 한글 이름표에서 먼저 (오픈스트리트맵에 외국 도시 한글 이름이 빠진 경우가 많다)
  const listed: Hit[] = mode === 'dest' ? findCities(q) : [];
  // 일본 명소를 한글로 치면 현지 이름으로도 찾는다 (Nominatim은 초당 1회라 현지 이름 쪽에 쓴다)
  // 계획이 일본 근처일 때만 (국내 계획에서 '평화공원'이 히로시마로 고정되지 않게). 기준 지점이 없으면 지금처럼
  const nearJapan = !near || (!inKorea(near) && near.lat >= 24 && near.lat <= 46 && near.lng >= 122.5 && near.lng <= 146);
  const jp = mode === 'poi' && nearJapan ? lookupJp(q) : [];
  const ok = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [k, p, o, ...local] = await Promise.all([
    ok(kakao(q, lat, lng)),
    ok(photon(q, mode, lat, lng)),
    jp.length ? Promise.resolve([] as Hit[]) : ok(osm(q, mode, lat, lng)),
    ...jp.map((x, i) => {
      const b = jpBias(x, near);
      return Promise.all([i === 0 ? ok(osm(x.q, 'poi', b?.lat, b?.lng, true)) : Promise.resolve([] as Hit[]), ok(photon(x.q, 'poi', b?.lat, b?.lng))]).then(([a, c]) => [...a, ...c]);
    }),
  ]);
  // 사전 명소는 한글 이름을 붙여 맨 앞에
  const pins = jp.map((x, i) => pickJp(x, local[i], near)).filter((h): h is Hit => !!h);
  // 동네가 정해진 명소를 못 찾았으면 그 동네 밖의 비슷한 이름은 버린다 ('야스라기테이' → 아이치현 '安らぎ')
  const area = !pins.length ? jp.map((x) => x.area && JP_AREAS[x.area]).find(Boolean) : undefined;
  const inArea = (h: Hit) => !area || km({ lat: area[0], lng: area[1] }, h) <= area[2] * 3;
  // 순서: 카카오(한국 가게) → Nominatim(한국어 이름) → Photon
  const merged = mergeHits([...pins, ...listed, ...k, ...o, ...p, ...local.flat()].filter(inArea), mode);
  const at = merged.findIndex((h) => !pins.some((x) => x.name === h.name && x.lat === h.lat && x.lng === h.lng));
  const pinned = at < 0 ? merged.length : at;
  const { hits: ranked, far } = rankHits(merged, mode === 'poi' ? near : undefined, mode, pinned);
  const hits = ranked.slice(0, 8);
  cache.set(key, { at: Date.now(), hits, far });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return NextResponse.json(far ? { hits, far: true } : { hits }, { headers: { 'Cache-Control': hits.length ? 'public, s-maxage=3600' : 'public, s-maxage=60' } });
}
