// 계획 공유 썸네일: 사이트의 탑승권 그대로
import { repo } from '@/server';
import { toView } from '@/blog/plans-lib.js';
import { BRAND_VIEW, OG_SIZE, ticketImage } from '@/lib/og-ticket';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = '섬데트 여행 계획 탑승권';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await repo().get(id);
  return ticketImage(b ? toView(b.plan, b.items) : BRAND_VIEW, { brand: !b });
}
