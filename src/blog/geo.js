// 작성 화면(계획 쓰기·여행기 쓰기)이 함께 쓰는 것: OSM 지명 검색, 국가별 통화, 풍경 목록

export const SCENES = ['mountain', 'sea', 'city', 'temple', 'wat', 'forest', 'ice', 'facades', 'market', 'field', 'waterfall'];
export const SCENE_KO = { mountain: '산', sea: '바다', city: '도시', temple: '사찰', wat: '불탑', forest: '숲', ice: '빙하', facades: '골목', market: '야시장', field: '들판', waterfall: '폭포' };
export const TIMES = { dawn: '새벽', day: '낮', dusk: '노을', night: '밤', autumn: '가을', mist: '안개' };
export const CURRENCY = {
  JP: 'JPY', US: 'USD', GB: 'GBP', FR: 'EUR', DE: 'EUR', IT: 'EUR', ES: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', GR: 'EUR', IE: 'EUR', FI: 'EUR',
  TH: 'THB', VN: 'VND', TW: 'TWD', CN: 'CNY', HK: 'HKD', SG: 'SGD', AU: 'AUD', NZ: 'NZD', CA: 'CAD', CH: 'CHF', TR: 'TRY', MA: 'MAD', IS: 'ISK',
  NO: 'NOK', SE: 'SEK', DK: 'DKK', CZ: 'CZK', HU: 'HUF', PL: 'PLN', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', PE: 'PEN', ID: 'IDR', MY: 'MYR',
  PH: 'PHP', IN: 'INR', AE: 'AED', EG: 'EGP', ZA: 'ZAR', LA: 'LAK', KH: 'KHR', MN: 'MNT', KR: 'KRW', HR: 'EUR', GE: 'GEL', UZ: 'UZS',
};

/* ---------- OSM Nominatim (키 없음, 초당 1회 이하) ----------
   여러 번 연달아 불러도 앞 요청이 끝난 뒤 1.1초 간격으로 하나씩 보낸다. */
let lastGeo = 0;
let queue = Promise.resolve();
let pending = 0;
function throttled(url) {
  pending++;
  const run = queue.then(async () => {
    const wait = 1100 - (Date.now() - lastGeo);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastGeo = Date.now();
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });
  queue = run.catch(() => {});
  return run.finally(() => pending--);
}
/** 아직 끝나지 않은 지명 요청 수 (저장 전에 기다리는 데 쓴다) */
export const geoPending = () => pending;
export const geoIdle = () => queue;

export const geocode = (q) =>
  throttled(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&namedetails=1&limit=6&accept-language=ko&q=${encodeURIComponent(q)}`);
export const reverse = ([lat, lon]) =>
  throttled(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&namedetails=1&zoom=17&accept-language=ko&lat=${lat}&lon=${lon}`);
export const nameOf = (g) => g.namedetails?.['name:ko'] || g.name || g.display_name?.split(',')[0] || '이름 없는 곳';
export const enOf = (g) => g.namedetails?.['name:en'] || g.namedetails?.name || '';

