import { describe, expect, it } from 'vitest';
import { inKorea, km, lookupJp, mergeHits, normKo, pickJp, rankHits, type Hit } from '../src/lib/place-rank';
import { JP_AREAS, JP_PLACES } from '../src/data/jp-ko';
import { CITIES, findCities } from '../src/blog/cities.js';

const hit = (name: string, lat: number, lng: number, source: Hit['source'] = 'photon', extra: Partial<Hit> = {}): Hit => ({ name, lat, lng, kind: 'poi', source, ...extra });
const TOKYO = { lat: 35.6812, lng: 139.7671 };

describe('거리', () => {
  it('대원 거리 (km)', () => {
    expect(km(TOKYO, TOKYO)).toBe(0);
    // 도쿄역 ↔ 서울시청 약 1,150km
    expect(km(TOKYO, { lat: 37.5665, lng: 126.978 })).toBeGreaterThan(1100);
    expect(km(TOKYO, { lat: 37.5665, lng: 126.978 })).toBeLessThan(1200);
  });
});

describe('정렬 · 먼 결과 빼기', () => {
  // 시뮬레이션에서 나온 실제 사례: 도쿄 계획에서 "뷔페"
  const bonghwa = hit('봉화 뷔페식당', 36.8932, 128.7324, 'kakao');
  const cheonan = hit('천안 치킨', 36.8151, 127.1139, 'kakao');
  const shinjuku = hit('新宿 ビュッフェ', 35.6909, 139.7003, 'photon');
  const yokohama = hit('横浜 ビュッフェ', 35.4437, 139.638, 'osm');

  it('가까운 결과가 있으면 먼 결과(한국 가게)는 뺀다', () => {
    const r = rankHits([bonghwa, cheonan, yokohama, shinjuku], TOKYO, 'poi');
    expect(r.far).toBe(false);
    expect(r.hits.map((h) => h.name)).toEqual(['新宿 ビュッフェ', '横浜 ビュッフェ']);
  });

  it('같은 거리권이면 들어온 순서(품질 순)를 지킨다', () => {
    const a = hit('A', 35.6855, 139.77, 'kakao');
    const b = hit('B', 35.685, 139.768, 'photon'); // B가 더 가깝지만 같은 1km 권
    expect(rankHits([a, b], TOKYO, 'poi').hits.map((h) => h.name)).toEqual(['A', 'B']);
  });

  it('먼 결과만 있으면 빈 결과 + far', () => {
    const paris = hit('Buffet Paris', 48.8566, 2.3522, 'photon');
    expect(rankHits([paris], TOKYO, 'poi')).toEqual({ hits: [], far: true });
    expect(rankHits([paris, yokohama], TOKYO, 'poi').hits).toEqual([yokohama]);
  });

  it('해외 계획에서 한국 결과는 공항·항구·역만 남는다 (도쿄 계획의 "야식"·"김포")', () => {
    expect(rankHits([cheonan], TOKYO, 'poi')).toEqual({ hits: [], far: true });
    const city = hit('김포', 37.599, 126.779, 'osm', { countryCode: 'KR' });
    const road = hit('김포대교', 37.616, 126.797, 'photon');
    const gimpo = hit('김포국제공항', 37.5587, 126.7945, 'osm', { en: 'Gimpo International Airport' });
    expect(rankHits([city, road, gimpo], TOKYO, 'poi').hits).toEqual([gimpo]);
  });

  it('한국 계획이면 한국 결과는 그대로, 거리 순', () => {
    const home = { lat: 36.8, lng: 127.1 }; // 천안 근처
    expect(rankHits([bonghwa, cheonan], home, 'poi').hits.map((h) => h.name)).toEqual(['천안 치킨', '봉화 뷔페식당']);
  });

  it('한국 땅 판정: 쓰시마·후쿠오카는 아니다', () => {
    expect([inKorea({ lat: 35.18, lng: 129.08 }), inKorea({ lat: 33.5, lng: 126.53 }), inKorea({ lat: 37.48, lng: 130.9 })]).toEqual([true, true, true]);
    expect([inKorea({ lat: 34.4, lng: 129.33 }), inKorea({ lat: 33.59, lng: 130.4 }), inKorea(TOKYO)]).toEqual([false, false, false]);
  });

  it('기준 지점이 없으면 그대로', () => {
    expect(rankHits([bonghwa, shinjuku], undefined, 'poi').hits).toEqual([bonghwa, shinjuku]);
  });

  it('목적지 검색은 먼 결과를 빼지 않는다', () => {
    expect(rankHits([bonghwa, shinjuku], TOKYO, 'dest').hits.map((h) => h.name)).toEqual(['新宿 ビュッフェ', '봉화 뷔페식당']);
  });

  it('사전 명소(앞에 고정)는 멀어도 남는다', () => {
    const pin = hit('센소지', 35.7148, 139.7967, 'osm');
    const r = rankHits([pin, cheonan], { lat: 37.5665, lng: 126.978 }, 'poi', 1);
    expect(r.hits.map((h) => h.name)).toEqual(['센소지', '천안 치킨']);
  });
});

describe('합치기', () => {
  it('가까운 같은 곳은 하나로, 영문 이름은 Photon 결과에서', () => {
    const out = mergeHits([hit('센소지', 35.7148, 139.7967, 'osm'), hit('Senso-ji', 35.71481, 139.79671, 'photon', { countryCode: 'JP' })], 'poi');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: '센소지', en: 'Senso-ji', countryCode: 'JP' });
  });
  it('목적지 검색에서는 가게를 뺀다', () => {
    expect(mergeHits([hit('카페', 35, 139), { ...hit('도쿄', 35.68, 139.76), kind: 'region' }], 'dest').map((h) => h.name)).toEqual(['도쿄']);
  });
});

describe('일본 명소 한글 사전', () => {
  it('150곳 이상, 동네 이름이 맞다', () => {
    expect(JP_PLACES.length).toBeGreaterThanOrEqual(150);
    for (const p of JP_PLACES) {
      expect(p.ko && p.q && p.en).toBeTruthy();
      if (p.area) expect(JP_AREAS[p.area]).toBeTruthy();
    }
  });

  it('꼭 있어야 하는 곳', () => {
    const must = ['텐세이엔', '하츠하나 소바', '텐잔 토지쿄', '타마다레 폭포', '다이토칸', '시라하타노유', '네츠노유', '사이노카와라', '오타키노유', '유바타케', '고자노유', '지조노유', '고센지', '치요노유', '센소지', '나카미세', '스카이트리', '소라마치', '아키하바라', '시부야 스카이', '츠키지 장외시장', '긴자', '롯폰기힐스', '도쿄 시티뷰', '케야키자카', '곤파치 니시아자부', '도쿄 미드타운', '하라주쿠', '캣스트리트', '메이지신궁', '신주쿠교엔', '하네다공항', '나리타공항', '마루시마 만쥬', '마츠무라 만쥬', '야스라기테이'];
    for (const m of must) expect(lookupJp(m).length, m).toBeGreaterThan(0);
    expect(lookupJp('텐잔')[0].q).toBe('天山湯治郷');
    expect(lookupJp('사이노카와라')[0].q).toBe('西の河原露天風呂');
    expect(lookupJp('하츠하나')[0].q).toBe('はつ花');
  });

  it('별칭: 띄어쓰기 · 온천 · 절 · 역 · 쓰/츠', () => {
    expect(lookupJp('텐잔 온천')[0].q).toBe('天山湯治郷');
    expect(lookupJp('텐세이엔온천')[0].q).toBe('箱根湯本 天成園');
    expect(lookupJp('센소지 절')[0].q).toBe('浅草寺');
    expect(lookupJp('고센지절')[0].q).toBe('光泉寺');
    expect(lookupJp('아키하바라역')[0].q).toBe('秋葉原');
    expect(lookupJp('네쓰노유')[0].q).toBe('熱乃湯');
    expect(lookupJp('하네다 공항')[0].q).toBe('羽田空港');
    expect(normKo('쓰키지 · 시장')).toBe('츠키지시장');
  });

  it('앞글자로도 찾지만, 너무 넓으면 안 고른다', () => {
    expect(lookupJp('유바')[0].q).toBe('湯畑');
    expect(lookupJp('도쿄')).toEqual([]);
    expect(lookupJp('뷔페')).toEqual([]);
    expect(lookupJp('a')).toEqual([]);
    expect(lookupJp('Tokyo')).toEqual([]);
  });

  it('현지 결과 중 그 동네 것을 골라 한글 이름을 붙인다', () => {
    const p = lookupJp('텐잔')[0];
    const elsewhere = hit('天山湯治郷', 33.59, 130.4, 'photon', { countryCode: 'JP' }); // 후쿠오카 (엉뚱한 곳)
    const right = hit('天山湯治郷', 35.2275, 139.0937, 'osm', { countryCode: 'JP' });
    expect(pickJp(p, [elsewhere, right])).toMatchObject({ name: '텐잔 토지쿄', en: 'Tenzan Tohji-kyo', lat: 35.2275 });
    expect(pickJp(p, [elsewhere])).toBeNull();
  });

  it('동네가 없는 곳은 기준 지점에서 가까운 것', () => {
    const p = lookupJp('야스라기테이')[0];
    const far = hit('安らぎ亭', 33.59, 130.4, 'photon', { countryCode: 'JP' });
    const near = hit('安らぎ亭', 36.62, 138.59, 'photon', { countryCode: 'JP' });
    expect(pickJp(p, [far, near], { lat: 36.62, lng: 138.6 })?.lat).toBe(36.62);
    expect(pickJp(p, [hit('安らぎ荘', 36.62, 138.59, 'photon', { countryCode: 'JP' })])).toBeNull(); // 이름이 다르면 안 고른다
  });
});

describe('목적지 한글 이름표', () => {
  it('쿠사츠 등 일본 소도시 · 온천 마을', () => {
    for (const q of ['쿠사츠', '구사쓰', '쿠사츠 온천', '하코네', '닛코', '가마쿠라', '가와구치코', '가루이자와', '아타미', '이즈', '다카야마', '시라카와고', '가나자와', '유후인', '구로카와', '기노사키', '아리마', '미야지마', '이세']) {
      const r = findCities(q);
      expect(r.length, q).toBeGreaterThan(0);
      expect(r[0].countryCode, q).toBe('JP');
    }
    expect(findCities('쿠사츠')[0]).toMatchObject({ name: '쿠사츠', countryCode: 'JP', kind: 'region', source: 'list' });
  });
  it('형식: [한글, 영문, 국가 코드, 위도, 경도]', () => {
    for (const c of CITIES) {
      expect(c).toHaveLength(5);
      expect(c[2]).toMatch(/^[A-Z]{2}$/);
      expect(Math.abs(c[3])).toBeLessThanOrEqual(90);
      expect(Math.abs(c[4])).toBeLessThanOrEqual(180);
    }
    // 일본 도시는 일본 안에 있다
    for (const c of CITIES.filter((x) => x[2] === 'JP')) {
      expect(c[3]).toBeGreaterThan(24);
      expect(c[3]).toBeLessThan(46);
      expect(c[4]).toBeGreaterThan(122);
      expect(c[4]).toBeLessThan(146);
    }
  });
});

describe('리뷰 고침: 사전 명소 고르기', () => {
  it('이름이 맞고 동네 중심에서 가까운 것을 고른다 (天成源 히라쓰카를 고르지 않음)', async () => {
    const { pickJp, lookupJp } = await import('../src/lib/place-rank');
    const p = lookupJp('텐세이엔')[0];
    expect(p).toBeTruthy();
    const hiratsuka = { name: '天成源', lat: 35.3554, lng: 139.2698, kind: 'poi', source: 'osm', countryCode: 'JP' } as never;
    const yumoto = { name: '箱根湯本温泉 天成園', lat: 35.2318, lng: 139.1028, kind: 'poi', source: 'photon', countryCode: 'JP' } as never;
    expect(pickJp(p, [hiratsuka])).toBeNull();
    const station = { name: '箱根湯本駅', lat: 35.2326, lng: 139.1052, kind: 'poi', source: 'osm', countryCode: 'JP' } as never;
    expect(pickJp(p, [station])).toBeNull(); // 동네 이름만 맞는 역은 고르지 않는다
    const lot = { name: '天成園第二駐車場', lat: 35.2290261, lng: 139.0967491, kind: 'poi', source: 'osm', countryCode: 'JP' } as never;
    expect(pickJp(p, [lot, yumoto])!.lat).toBeCloseTo(35.2318, 3); // 주차장보다 본 건물
    const got = pickJp(p, [hiratsuka, yumoto])!;
    expect(got.name).toBe('텐세이엔');
    expect(got.lat).toBeCloseTo(35.2318, 3);
  });
});
