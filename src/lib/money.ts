// 돈 표시 · 원화 환산 (일정 비용은 현지 통화로 적을 수 있다: Item.cur, 없으면 원화)
// 환율은 브라우저에서 blog/live.js의 krwPer(통화)로 받는다 (1 현지 통화 = ? 원). 받기 전엔 환산을 숨긴다.

const SYMBOL: Record<string, string> = { KRW: '₩', JPY: '¥', USD: '$', EUR: '€', GBP: '£', CNY: '¥', TWD: 'NT$', HKD: 'HK$', THB: '฿', VND: '₫', SGD: 'S$', AUD: 'A$', CAD: 'C$', PHP: '₱', MYR: 'RM', IDR: 'Rp' };
// 소수점을 쓰지 않는 통화
const WHOLE = new Set(['KRW', 'JPY', 'VND', 'IDR', 'TWD']);

/** 통화 코드 정리: 빈 값·없음 = 원화 */
export const curOf = (cur?: string | null) => (cur && /^[A-Z]{3}$/.test(cur) ? cur : 'KRW');

/** ¥1,300 · $12.50 · ₩16,500 */
export function fmtMoney(amount: number, cur?: string | null) {
  const c = curOf(cur);
  const n = Number(amount) || 0;
  const digits = WHOLE.has(c) ? 0 : n % 1 ? 2 : 0;
  const s = n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${SYMBOL[c] ?? `${c} `}${s}`;
}

/** 원화로 환산 (rate = 1 현지 통화가 몇 원인지). 원화면 그대로, 환율을 모르면 null */
export function toKRW(amount: number, cur: string | null | undefined, rate: number | null | undefined) {
  const c = curOf(cur);
  if (c === 'KRW') return Math.round(amount);
  return rate ? Math.round(amount * rate) : null;
}

/** "¥1,300 (≈ ₩12,000)" — 원화면 "₩12,000"만 */
export function fmtWithKRW(amount: number, cur: string | null | undefined, rate: number | null | undefined) {
  const c = curOf(cur);
  if (c === 'KRW') return fmtMoney(amount, 'KRW');
  const k = toKRW(amount, c, rate);
  return k == null ? fmtMoney(amount, c) : `${fmtMoney(amount, c)} (≈ ${fmtMoney(k, 'KRW')})`;
}

/** 여러 일정의 원화 합계. 환율을 모르는 통화가 섞이면 known=false */
export function sumKRW(list: { cost: number | null; cur?: string }[], rates: Record<string, number | null | undefined>) {
  let total = 0;
  let known = true;
  for (const it of list) {
    if (!it.cost) continue;
    const k = toKRW(it.cost, it.cur, rates[curOf(it.cur)]);
    if (k == null) known = false;
    else total += k;
  }
  return { total, known };
}
