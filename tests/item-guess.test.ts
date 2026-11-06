import { describe, expect, it } from 'vitest';
import { guessKind, placeQuery } from '../src/components/collab/ItemModal';
import { guessGo } from '../src/lib/proposals';

describe('일정 창: 종류 짐작 · 장소 검색어', () => {
  it('이름으로 종류를 짐작한다', () => {
    expect(guessKind('하네다 → 요코하마')).toBe('move');
    expect(guessKind('쿠사츠온천 BT → 나가노하라쿠사츠구치')).toBe('move');
    expect(guessKind('점심 · 하츠하나 소바 본점')).toBe('eat');
    expect(guessKind('북신주쿠 에어비앤비 체크인')).toBe('stay');
    expect(guessKind('시부야·하라주쿠 쇼핑')).toBe('shop');
    expect(guessKind('텐잔 토지쿄')).toBeNull();
    expect(guessKind('아침 산책')).toBeNull();
    expect(guessKind('저녁 뷔페')).toBe('eat');
  });
  it('이름에서 장소 검색어를 뽑고, 일반적인 말만 남으면 비운다', () => {
    expect(placeQuery('점심 · 하츠하나 소바 본점')).toBe('하츠하나 소바 본점');
    expect(placeQuery('센소지·나카미세')).toBe('센소지');
    expect(placeQuery('저녁 뷔페')).toBe('저녁 뷔페');
    expect(placeQuery('뷔페')).toBe('');
    expect(placeQuery('야식')).toBe('');
  });
});

describe('예전 이동 줄: 가는 방법 짐작', () => {
  const g = (title: string, memo = '') => guessGo([{ title, memo }]);
  it('비행기는 제목(✈·편명)으로만', () => {
    expect(g('✈ NH862 김포 → 하네다')).toBe('flight');
    expect(g('NH867 하네다 → 김포')).toBe('flight');
    // 메모에 '공항역'이 있어도 열차
    expect(g('북신주쿠 숙소 → 하네다 제2터미널', '1. 숙소 → 오쿠보역 · 도보\n4. 시나가와 → 하네다공항 제1·제2터미널역 · 게이큐')).toBe('transit');
  });
  it('노선 이름이 있으면 대중교통, 택시는 차, 도보만 있으면 걸어서', () => {
    expect(g('텐세이엔 → 다이토칸', '신칸센 자유석 + 특급')).toBe('transit');
    expect(g('텐세이엔으로 (택시)', '택시 약 5분')).toBe('car');
    expect(g('유바타케 · 다이토칸으로', '도보 약 15분')).toBe('walk');
  });
});
