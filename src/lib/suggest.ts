// 추천 항목 (작성 화면·탑승 준비·계획 화면 체크리스트가 같이 쓴다)
import type { Scope } from './types';

export const BUDGET_SUGGEST: Record<Scope, string[]> = {
  abroad: ['항공', '숙소', '식비', '교통', '입장료', '쇼핑', '통신', '보험'],
  domestic: ['교통', '숙소', '식비', '입장료', '쇼핑', '렌터카'],
  local: ['식비', '카페', '교통', '입장료', '쇼핑'],
};

// 여행 종류에 맞춰서만 (해외만 여권·환전, 국내는 교통편·숙소, 동네는 가볍게)
export const CHECK_SUGGEST: Record<Scope, string[]> = {
  abroad: ['항공권 예약', '숙소 예약', '여권 유효기간 확인', '여행자 보험', '환전', 'eSIM', '비자 확인', '현지 교통패스', '멀티 어댑터', '상비약'],
  domestic: ['교통편 예약', '숙소 예약', '맛집 예약', '날씨 확인', '보조배터리', '상비약'],
  local: ['동선 짜기', '맛집 예약', '돗자리', '보조배터리', '편한 신발', '날씨 확인'],
};

export const CHECK_MAX = 60;
export const CHECK_LEN = 80;
