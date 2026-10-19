// 사이트맵: 전체 공개 계획만. 링크 공개 계획은 넣지 않는다 (noindex)
import type { MetadataRoute } from 'next';
import { repo } from '@/server/repo';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const list = await repo().listPublic(5000);
  return [
    { url: SITE.url, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE.url}/new`, changeFrequency: 'monthly', priority: 0.5 },
    ...list.map((b) => ({ url: `${SITE.url}/p/${b.plan.id}/${b.plan.slug}`, lastModified: new Date(b.plan.updatedAt), changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
