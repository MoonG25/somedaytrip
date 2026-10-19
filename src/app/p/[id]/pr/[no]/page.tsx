// 제안 한 건 (PR 화면)
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { repo } from '@/server';
import { isOwner, visitorId } from '@/server/auth';
import { findConflicts } from '@/lib/proposals';
import OpCard from '@/components/collab/OpCard';
import DecidePanel from '@/components/collab/DecidePanel';
import Refresher from '@/components/collab/Refresher';
import { ago } from '@/components/collab/util';
import type { ProposalStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';
// 제안 화면은 검색에 싣지 않는다
export const metadata: Metadata = { robots: { index: false, follow: false } };

const STATUS: Record<ProposalStatus, { label: string; cls: string }> = {
  open: { label: '검토 대기', cls: 'open' },
  accepted: { label: '수락됨', cls: 'ok' },
  partial: { label: '일부 수락', cls: 'ok' },
  rejected: { label: '거절됨', cls: 'no' },
  withdrawn: { label: '철회됨', cls: 'muted' },
};

export default async function ProposalPage({ params }: { params: Promise<{ id: string; no: string }> }) {
  const { id, no } = await params;
  const b = await repo().get(id);
  if (!b) notFound();
  const pr = b.proposals.find((x) => x.no === Number(no));
  if (!pr) notFound();
  const owner = await isOwner(id);
  const me = await visitorId();
  const open = pr.status === 'open';
  const conflicts = open ? findConflicts(b.items, pr.ops) : [];
  const moved = b.plan.version - pr.baseVersion;
  const skipped = new Set(pr.skipped ?? []);
  const href = `/p/${id}/${b.plan.slug}`;

  return (
    <article className={`plan tone-${b.plan.status}`}>
      <Refresher id={id} />
      <section className="container pr-page">
        <nav className="crumbs mono">
          <a href={href} className="link-u">
            {b.plan.title}
          </a>
          <span>/</span>
          <a href={`${href}#proposals`} className="link-u">
            제안
          </a>
          <span>/</span>
          <span>#{pr.no}</span>
        </nav>
        <header className="pr-head">
          <span className={`pill lg ${STATUS[pr.status].cls}`}>{STATUS[pr.status].label}</span>
          <h1>
            {pr.title} <em className="mono">#{pr.no}</em>
          </h1>
          <p className="muted">
            <b>{pr.authorName}</b>님이 {ago(pr.createdAt)} 변경 {pr.ops.length}개를 제안했어요{pr.decidedAt ? ` · ${ago(pr.decidedAt)} 처리됨` : ''}
          </p>
        </header>
        <div className="pr-layout">
          <div className="pr-body">
            {pr.message ? (
              <blockquote className="pr-msg">
                <b>{pr.authorName}</b>
                <p>{pr.message}</p>
              </blockquote>
            ) : null}
            {open && moved > 0 ? (
              <div className={`pr-callout${conflicts.length ? ' warn' : ''}`}>
                제안을 만든 뒤 계획이 <b>{moved}번</b> 바뀌었어요. {conflicts.length ? <>그중 <b>{conflicts.length}개</b>가 이 제안과 겹쳐요.</> : '겹치는 부분은 없어서 그대로 반영할 수 있어요.'}
              </div>
            ) : null}
            <div className="opcards">
              {pr.ops.map((op, i) => (
                <OpCard key={i} op={op} plan={b.plan} items={b.items} conflict={conflicts.find((c) => c.op === i)} skipped={skipped.has(i)} />
              ))}
            </div>
            {pr.note ? (
              <blockquote className="pr-msg owner">
                <b>🧑‍✈️ {b.plan.ownerName}</b>
                <p>{pr.note}</p>
              </blockquote>
            ) : null}
          </div>
          <aside className="pr-side">
            <DecidePanel
              planId={id}
              no={pr.no}
              owner={owner}
              mine={!!me && me === pr.authorId}
              open={open}
              total={pr.ops.length}
              conflicts={conflicts.length}
              ownerName={b.plan.ownerName}
              status={STATUS[pr.status].label}
            />
            <a className="btn btn--ghost" href={href}>
              ← 계획으로
            </a>
          </aside>
        </div>
      </section>
    </article>
  );
}
