import type { Metadata } from 'next';
import Composer from '@/components/Composer';
import { repo } from '@/server/repo';

export const metadata: Metadata = {
  title: '계획 쓰기',
  description: '어디로, 언제, 얼마나. 해외여행부터 동네 여행까지 계획을 쓰고 링크로 친구와 같이 다듬어요.',
  alternates: { canonical: '/new' },
};

export default async function NewPlan({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  // ?from=<공개 계획 id>: 그 계획으로 내 계획 만들기
  if (from) {
    const src = await repo().get(from);
    if (src && src.plan.visibility === 'public') {
      const { id: _i, slug: _s, version: _v, createdAt: _c, updatedAt: _u, sample: _x, copiedFrom: _f, ownerName: _o, ...info } = src.plan;
      return <Composer mode="copy" planId={from} copiedCount={src.items.length} initial={{ ...info, visibility: 'link', checklist: info.checklist.map(([t]) => [t, false]) }} />;
    }
  }
  return <Composer mode="new" />;
}
