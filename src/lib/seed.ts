// "예시 계획 만들어 보기": 동네 여행 하나에 친구 제안 하나를 넣어 둔다. 비밀번호는 화면에 알려 준다.
import type { Item, Kind, Place } from '../types';
import { store } from './store';
import { uid } from './util';

export const SEED_PASSWORD = 'someday';

const P = (name: string, lat: number, lng: number, address = '서울 마포구'): Place => ({ name, lat, lng, address });

export async function seedPlan() {
  let order = 0;
  const it = (day: number | null, time: string, title: string, kind: Kind, place: Place | null, memo = '', cost: number | null = null): Item => ({
    id: uid(8),
    day,
    time,
    title,
    kind,
    place,
    memo,
    cost,
    order: order++,
  });
  const items = [
    it(1, '11:00', '망원시장 고로케', 'eat', P('망원시장', 37.5561, 126.9064), '줄 서는 집 말고 옆집이 더 바삭함', 6000),
    it(1, '12:30', '망원한강공원 산책', 'see', P('망원한강공원', 37.5545, 126.8968), '돗자리 챙기기'),
    it(1, '15:00', '연남동 골목 카페', 'cafe', P('연트럴파크', 37.5617, 126.9244), '', 7000),
    it(1, '18:30', '합정 노을 보며 저녁', 'eat', P('합정역', 37.5495, 126.9139), '', 25000),
    it(null, '', '성미산 마을 둘레길', 'see', P('성미산', 37.5664, 126.9105), '다음에 시간 되면'),
  ];
  const { bundle, token } = await store.create(
    {
      title: '망원동 한 바퀴',
      emoji: '🥐',
      scope: 'local',
      place: P('망원동', 37.5563, 126.9052),
      when: { mode: 'someday', days: 1, season: '선선한 가을' },
      memo: '걸어서 다니는 동네 여행. 시장 → 한강 → 연남 → 합정 노을.',
      ownerName: '나',
    },
    SEED_PASSWORD,
    items
  );
  // 친구 "준호"의 제안: 카페 하나 추가 + 저녁 시간 바꾸기
  const dinner = items[3];
  await store.propose(bundle.plan.id, {
    authorId: 'seed-friend',
    authorName: '준호',
    title: '노을 시간 맞춰서 저녁 늦추자',
    message: '10월 일몰이 6시쯤이라 저녁을 7시로 미루고, 그 전에 망원동 빵집 한 군데 들르면 좋겠어!',
    baseVersion: bundle.plan.version,
    ops: [
      { type: 'update', id: dinner.id, before: { time: '18:30' }, after: { time: '19:00' } },
      {
        type: 'add',
        item: { id: uid(8), day: 1, time: '17:00', title: '망원동 소금빵', kind: 'eat', place: P('망원역', 37.5560, 126.9101), memo: '오후에 나오는 빵 타이밍', cost: 4000, order: 2.5 },
      },
    ],
  });
  return { id: bundle.plan.id, token };
}
