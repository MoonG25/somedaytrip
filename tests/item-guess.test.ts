import { describe, expect, it } from 'vitest';
import { guessKind, placeQuery } from '../src/components/collab/ItemModal';

describe('일정 창: 종류 짐작 · 장소 검색어', () => {
  it('이름으로 종류를 짐작한다', () => {
    expect(guessKind('하네다 → 요코하마')).toBe('move');
    expect(guessKind('쿠사츠온천 BT → 나가노하라쿠사츠구치')).toBe('move');
    expect(guessKind('점심 · 하츠하나 소바 본점')).toBe('eat');
    expect(guessKind('북신주쿠 에어비앤비 체크인')).toBe('stay');
    expect(guessKind('시부야·하라주쿠 쇼핑')).toBe('shop');
    expect(guessKind('텐잔 토지쿄')).toBeNull();
  });
  it('이름에서 장소 검색어를 뽑고, 일반적인 말만 남으면 비운다', () => {
    expect(placeQuery('점심 · 하츠하나 소바 본점')).toBe('하츠하나 소바 본점');
    expect(placeQuery('센소지·나카미세')).toBe('센소지');
    expect(placeQuery('저녁 뷔페')).toBe('저녁 뷔페');
    expect(placeQuery('뷔페')).toBe('');
    expect(placeQuery('야식')).toBe('');
  });
});
