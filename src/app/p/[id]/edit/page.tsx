import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Composer from '@/components/Composer';
import { repo } from '@/server';
import { isOwner } from '@/server/auth';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '계획 고치기', robots: { index: false, follow: false } };

export default async function EditPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await repo().get(id);
  if (!b) notFound();
  // 기장만: 아니면 계획 화면으로 (거기서 비밀번호로 인증)
  if (!(await isOwner(id))) redirect(`/p/${id}/${b.plan.slug}`);
  const { id: _i, slug: _s, version: _v, createdAt: _c, updatedAt: _u, sample: _x, copiedFrom: _f, ...info } = b.plan;
  return <Composer mode="edit" planId={id} initial={info} />;
}
