// 계획 상세: moon.log 계획 화면 + 협업(일정·제안·기록). 서버에서 그려서 검색엔진이 그대로 읽는다.
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { cache } from 'react';
import { repo } from '@/server';
import { isOwner } from '@/server/auth';
import { toView, STATUS, totalBudget, nights } from '@/blog/plans-lib.js';
import { renderPlanHero, renderPlanStory, renderPrep } from '@/blog/plan-page.js';
import { seoulMonth } from '@/blog/util.js';
import LegacyBlock from '@/components/LegacyBlock';
import PlanShell from '@/components/collab/PlanShell';
import { ago } from '@/components/collab/util';
import { opCounts } from '@/lib/proposals';
import { SITE } from '@/lib/site';
import type { HistoryKind, ProposalStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const load = cache((id: string) => repo().get(id));

type Props = { params: Promise<{ id: string; slug?: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const b = await load(id);
  if (!b) return { title: '찾을 수 없는 계획', robots: { index: false } };
  const p = b.plan;
  const where = [p.place, p.country].filter(Boolean).join(', ');
  const desc = `${p.why ? p.why + ' ' : ''}${where} ${nights(p.days)} 여행 계획 · 가 볼 곳 ${b.items.length}곳${totalBudget(p) ? ` · 예산 ${Math.round(totalBudget(p) / 10000)}만 원` : ''}. 섬데트에서 같이 짜는 여행 계획.`;
  const url = `/p/${p.id}/${p.slug}`;
  return {
    title: `${p.title} — ${where} ${nights(p.days)} 여행 계획`,
    description: desc.slice(0, 160),
    alternates: { canonical: url },
    // 링크 공개는 친구끼리만: 검색엔진에는 싣지 않는다 (링크 미리보기는 그대로 뜬다)
    robots: p.visibility === 'public' ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { type: 'article', url, title: p.title, description: desc.slice(0, 160), siteName: SITE.name, locale: 'ko_KR', images: [{ url: `/p/${p.id}/opengraph-image?v=${p.version}-${p.updatedAt}`, width: 1200, height: 630, alt: p.title }] },
    twitter: { card: 'summary_large_image', title: p.title, description: desc.slice(0, 160), images: [`/p/${p.id}/opengraph-image?v=${p.version}-${p.updatedAt}`] },
  };
}

const STATUS_PR: Record<ProposalStatus, { label: string; cls: string }> = {
  open: { label: '검토 대기', cls: 'open' },
  accepted: { label: '수락됨', cls: 'ok' },
  partial: { label: '일부 수락', cls: 'ok' },
  rejected: { label: '거절됨', cls: 'no' },
  withdrawn: { label: '철회됨', cls: 'muted' },
};
const HIST: Record<HistoryKind, string> = { created: '🌱', direct: '✎', meta: '⚙', proposed: '📮', accepted: '✓', partial: '◐', rejected: '✕', withdrawn: '↩', check: '☑' };

export default async function PlanPage({ params }: Props) {
  const { id, slug } = await params;
  const b = await load(id);
  if (!b) notFound();
  // 주소 이름이 다르면(계획 이름이 바뀌었거나 생략) 정식 주소로
  if ((slug?.[0] ?? '') !== b.plan.slug) permanentRedirect(`/p/${id}/${b.plan.slug}`);
  const owner = await isOwner(id);
  const p = toView(b.plan, b.items);
  const nowMonth = seoulMonth();
  const open = b.proposals.filter((x) => x.status === 'open');
  const done = b.proposals.filter((x) => x.status !== 'open');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: p.title,
    description: p.why || undefined,
    url: `${SITE.url}/p/${p.id}/${p.slug}`,
    touristType: p.scope === 'local' ? '동네 여행' : undefined,
    itinerary: {
      '@type': 'ItemList',
      numberOfItems: p.stops.length,
      itemListElement: p.stops.slice(0, 30).map((s: { name: string; coords: [number, number] }, i: number) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: { '@type': 'Place', name: s.name, geo: { '@type': 'GeoCoordinates', latitude: s.coords[0], longitude: s.coords[1] } },
      })),
    },
  };

  return (
    <article className={`plan tone-${p.status}`}>
      {p.visibility === 'public' ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} /> : null}
      <LegacyBlock html={renderPlanHero(p, { owner, nowMonth })} plan={p} owner={owner} />
      <PlanShell plan={b.plan} items={b.items} owner={owner} open={open.length}>
        <LegacyBlock html={renderPlanStory(p, { nowMonth })} plan={p} owner={owner} />
      </PlanShell>
      <LegacyBlock html={renderPrep(p, { owner })} plan={p} owner={owner} />

      <section className="container plan-collab" id="proposals">
        <header className="sec-head">
          <div>
            <p className="eyebrow">제안 · {open.length ? `검토 대기 ${open.length}` : '열린 제안 없음'}</p>
            <h2>
              Pull <em>requests</em>
            </h2>
          </div>
          <p className="muted collab-note">링크를 받은 사람이 일정을 고치면 여기에 쌓이고, 주인이 수락하면 반영돼요.</p>
        </header>
        {b.proposals.length ? (
          <ol className="pr-list" role="list">
            {[...open, ...done].map((x) => (
              <li key={x.id}>
                <a className={`pr-row ${x.status}`} href={`/p/${id}/pr/${x.no}`}>
                  <span className={`pill ${STATUS_PR[x.status].cls}`}>{STATUS_PR[x.status].label}</span>
                  <span className="pr-main">
                    <b>
                      <span className="mono faint">#{x.no}</span> {x.title}
                    </b>
                    <small className="mono">
                      {x.authorName} · {ago(x.createdAt)} · {opCounts(x.ops)}
                    </small>
                  </span>
                  <span className="pr-go mono">{x.status === 'open' && owner ? 'REVIEW →' : 'VIEW →'}</span>
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty">
            <b>📮</b>아직 제안이 없어요. 링크를 친구에게 보내 보세요.
          </div>
        )}
        <details className="history">
          <summary>
            <span className="eyebrow">기록 · History</span> <span className="faint">{b.history.length}건</span>
          </summary>
          <ol role="list">
            {b.history.map((h) => (
              <li key={h.id}>
                <span className="h-ico" aria-hidden="true">
                  {HIST[h.kind]}
                </span>
                <div>
                  <p>{h.proposalNo ? <a href={`/p/${id}/pr/${h.proposalNo}`}>{h.summary}</a> : h.summary}</p>
                  <small className="mono faint">
                    {h.actor} · {ago(h.at)} · v{h.version}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        </details>
      </section>

      <section className="container plan-done" data-reveal>
        <div>
          <p className="eyebrow">Plan together</p>
          <h2>
            같이 가는 사람에게 <em>링크</em>를
          </h2>
          <p className="muted">
            링크를 받은 친구는 가 볼 곳을 더하거나 시간을 바꾸자고 <b>제안</b>할 수 있어요. 반영은 비밀번호를 아는 주인이 골라서 해요. 상태: {STATUS[p.status].ko}.
          </p>
        </div>
        <a className="btn btn--solid" href="#itinerary">
          일정 보러 가기 ↑
        </a>
      </section>
    </article>
  );
}
