import PlansExplorer from '@/components/PlansExplorer';
import { repo } from '@/server';
import { toView } from '@/blog/plans-lib.js';
import { SITE } from '@/lib/site';

export const dynamic = 'force-dynamic';

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
    </>
  );
}
