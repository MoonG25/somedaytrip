import PlansExplorer from '@/components/PlansExplorer';
import MoveDevices from '@/components/MoveDevices';
import { repo } from '@/server';
import { toView } from '@/blog/plans-lib.js';
import { SITE } from '@/lib/site';

// 공개 목록은 60초마다 새로 (쓰기 액션이 바로 새로 고치게도 한다)
export const revalidate = 60;

export default async function Home() {
  const list = (await repo().listPublic(60)).map((b) => toView(b.plan, b.items));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name,
    alternateName: SITE.nameEn,
    url: SITE.url,
    description: SITE.description,
    inLanguage: 'ko',
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PlansExplorer initial={list} />
      <MoveDevices />
    </>
  );
}
