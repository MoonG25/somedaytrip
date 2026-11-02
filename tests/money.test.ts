import { describe, expect, it } from 'vitest';
import { fmtMoney, fmtWithKRW, sumKRW, toKRW } from '../src/lib/money';
import { cleanItem, cleanInfo } from '../src/lib/clean';
import { diffItem, same } from '../src/lib/proposals';

describe('돈 · 새 일정 칸', () => {
  it('통화 표시와 환산', () => {
    expect(fmtMoney(1300, 'JPY')).toBe('¥1,300');
    expect(fmtMoney(12.5, 'USD')).toBe('$12.50');
    expect(fmtMoney(16500)).toBe('₩16,500');
    expect(toKRW(1000, 'JPY', 9.1)).toBe(9100);
    expect(toKRW(1000, 'JPY', null)).toBeNull();
    expect(fmtWithKRW(1300, 'JPY', 9)).toBe('¥1,300 (≈ ₩11,700)');
    expect(sumKRW([{ cost: 1000, cur: 'JPY' }, { cost: 5000 }], { JPY: 9 })).toEqual({ total: 14000, known: true });
    expect(sumKRW([{ cost: 1000, cur: 'USD' }], {}).known).toBe(false);
  });
  it('끝 시각·상태·통화는 서버가 다듬고, 예전 일정(칸 없음)과 빈 값은 같은 것으로 본다', () => {
    const a = cleanItem({ title: 'x', end: '15:26', tag: 'booked', cur: 'JPY', cost: '1300' });
    expect([a.end, a.tag, a.cur, a.cost]).toEqual(['15:26', 'booked', 'JPY', 1300]);
    const b = cleanItem({ title: 'x', end: '25:99x', tag: 'nope', cur: 'yen' });
    expect([b.end, b.tag, b.cur]).toEqual(['', '', '']);
    expect(cleanItem({ title: 'x', cur: 'KRW' }).cur).toBe('');
    expect(same(undefined, '')).toBe(true);
    const old = { id: 'i', day: 1, time: '', title: 't', en: '', kind: 'see' as const, place: null, memo: '', cost: null, order: 0 };
    expect(diffItem(old, cleanItem({ ...old }))).toBeNull(); // 예전 일정 → 다듬어도 바뀐 것 없음
  });
  it('경유 도시', () => {
    const i = cleanInfo({ title: 't', via: [{ name: '하코네', en: 'Hakone', coords: [35.23, 139.1] }, { name: '' }, { name: '쿠사츠' }] });
    expect(i.via).toEqual([{ name: '하코네', en: 'Hakone', coords: [35.23, 139.1] }, { name: '쿠사츠' }]);
  });
});
