// 실시간 정보: 날씨(Open-Meteo), 환율(ExchangeRate-API 무료 엔드포인트), 시차. 전부 키가 필요 없다.
const HOME_TZ = 'Asia/Seoul';

const WMO = [
  [[0], '맑음', '☀️'],
  [[1, 2], '구름 조금', '🌤'],
  [[3], '흐림', '☁️'],
  [[45, 48], '안개', '🌫'],
  [[51, 53, 55, 56, 57], '이슬비', '🌦'],
  [[61, 63, 65, 66, 67], '비', '🌧'],
  [[71, 73, 75, 77], '눈', '🌨'],
  [[80, 81, 82], '소나기', '🌧'],
  [[85, 86], '눈보라', '❄️'],
  [[95, 96, 99], '뇌우', '⛈'],
];
export const weatherOf = (code) => WMO.find(([codes]) => codes.includes(code)) || [[], '알 수 없음', '·'];

export async function weatherAt([lat, lon], signal) {
  const r = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`,
    { signal }
  );
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  const [, label, icon] = weatherOf(d.current.weather_code);
  return { temp: Math.round(d.current.temperature_2m), wind: Math.round(d.current.wind_speed_10m), label, icon, timezone: d.timezone };
}

/** 원화 기준 환율. 세션 동안 캐시한다. 반환: 그 통화 1단위가 몇 원인지 */
let ratesPromise;
export async function krwPer(currency, signal) {
  if (!currency || currency === 'KRW') return 1;
  ratesPromise ||= (async () => {
    try {
      const cached = JSON.parse(sessionStorage.getItem('sdt:fx') || 'null');
      if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.rates;
    } catch {}
    // 여러 페이지가 같은 요청을 나눠 쓰므로, 한 페이지가 떠난다고 취소하지 않는다
    const r = await fetch('https://open.er-api.com/v6/latest/KRW');
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    try {
      sessionStorage.setItem('sdt:fx', JSON.stringify({ at: Date.now(), rates: d.rates }));
    } catch {}
    return d.rates;
  })().catch((e) => {
    ratesPromise = null;
    throw e;
  });
  const rates = await ratesPromise;
  if (!rates[currency]) throw new Error('no rate');
  return 1 / rates[currency];
}

/** "100 JPY = 912원"처럼 원화가 100원 이상 되는 단위로 */
export function fxLabel(currency, perUnit) {
  let unit = 1;
  while (unit * perUnit < 100 && unit < 1e7) unit *= 10;
  const name = (() => {
    try {
      return new Intl.DisplayNames('ko', { type: 'currency' }).of(currency);
    } catch {
      return currency;
    }
  })();
  return { unit, krw: Math.round(unit * perUnit), name };
}

export function tzOffsetHours(tz) {
  const now = new Date();
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const seoul = new Date(now.toLocaleString('en-US', { timeZone: HOME_TZ }));
  return Math.round(((local - seoul) / 3600000) * 2) / 2;
}

/** 오늘 해 뜨고 지는 시각 (현지 시간 'HH:MM') */
export async function sunAt([lat, lon], signal) {
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=sunrise,sunset&timezone=auto&forecast_days=1`, { signal });
  if (!r.ok) throw new Error(r.status);
  const d = await r.json();
  return { rise: d.daily.sunrise[0].slice(11, 16), set: d.daily.sunset[0].slice(11, 16) };
}
