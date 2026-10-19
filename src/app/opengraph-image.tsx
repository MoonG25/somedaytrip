// 홈·계획 쓰기 공유 썸네일: 섬데트 대표 탑승권
import { BRAND_VIEW, OG_SIZE, ticketImage } from '@/lib/og-ticket';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = '섬데트 — 언젠가 갈 여행을, 같이';

export default function Image() {
  return ticketImage(BRAND_VIEW, { brand: true });
}
