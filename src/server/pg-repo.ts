// Supabase Postgres 저장소. Next.js 서버만 DATABASE_URL(풀러, 트랜잭션 모드)로 접속한다.
// 쓰기는 계획 행을 잠그고(FOR UPDATE) 한 트랜잭션 안에서 읽고-고치고-저장한다 → 동시에 수락·수정해도 꼬이지 않는다.
import 'server-only';
import postgres from 'postgres';
import type { HistoryEntry, Plan, PlanInfo, Proposal } from '@/lib/types';
import { BaseRepo, RepoError, sampleRows, type Row } from './repo';
import { cleanInfo } from '@/lib/clean';

type Sql = postgres.Sql | postgres.TransactionSql;
type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const META = ['id', 'slug', 'version', 'createdAt', 'updatedAt', 'sample', 'copiedFrom'] as const;
const infoOf = (p: Plan): PlanInfo => {
  const o: R = { ...p };
  for (const k of META) delete o[k];
  return o as PlanInfo;
};
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : 0);

// 예전에 저장된 계획에 새 칸(인원 등)이 없어도 기본값이 채워지게 읽을 때도 다듬는다
const toPlan = (p: R): Plan => ({
  ...cleanInfo(p.info),
  id: p.id,
  slug: p.slug,
  visibility: p.visibility,
  version: p.version,
  createdAt: ms(p.created_at),
  updatedAt: ms(p.updated_at),
  ...(p.sample ? { sample: true } : {}),
  ...(p.copied_from ? { copiedFrom: p.copied_from } : {}),
});
const toProposal = (x: R): Proposal => ({
  id: x.id,
  no: x.no,
  authorId: x.author_id,
  authorName: x.author_name,
  title: x.title,
  message: x.message,
  baseVersion: x.base_version,
  ops: x.ops,
  status: x.status,
  createdAt: ms(x.created_at),
  ...(x.decided_at ? { decidedAt: ms(x.decided_at) } : {}),
  ...(x.note ? { note: x.note } : {}),
  ...(x.skipped ? { skipped: x.skipped } : {}),
});
const toHistory = (h: R): HistoryEntry => ({
  id: h.id,
  at: ms(h.at),
  kind: h.kind,
  actor: h.actor,
  summary: h.summary,
  ...(h.proposal_no != null ? { proposalNo: h.proposal_no } : {}),
  version: h.version,
});
const NO_SECRET = { secret: { salt: '', hash: '', iter: 0 }, tokens: [], fails: { count: 0, until: 0 }, recent: {} };

export class PgRepo extends BaseRepo {
  private sql: postgres.Sql;
  private seeded: Promise<void> | null = null;

  constructor(url: string) {
    super();
    // 풀러(트랜잭션 모드)라서 prepared statement는 끈다. 서버리스라 연결은 조금만
    this.sql = postgres(url, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10, ssl: 'require' });
  }

  /** 예시 계획이 하나도 없으면 넣는다 (첫 실행) */
  private seed() {
    this.seeded ??= (async () => {
      const [{ n }] = await this.sql`select count(*)::int as n from plans where sample`;
      if (n > 0) return;
      for (const r of await sampleRows()) await this.sql.begin((tx) => this.insertRow(tx, r, true));
    })().catch((e) => {
      this.seeded = null;
      throw e;
    });
    return this.seeded;
  }

  private async load(tx: Sql, id: string, lock: boolean): Promise<Row | null> {
    const [p] = lock ? await tx`select * from plans where id = ${id} for update` : await tx`select * from plans where id = ${id}`;
    if (!p) return null;
    const [[s], prs, hist] = await Promise.all([
      tx`select * from plan_secrets where plan_id = ${id}`,
      tx`select * from proposals where plan_id = ${id} order by no desc`,
      tx`select * from plan_history where plan_id = ${id} order by at desc limit 300`,
    ]);
    return {
      plan: toPlan(p),
      items: p.items,
      proposals: prs.map(toProposal),
      history: hist.map(toHistory),
      secret: { salt: s.salt, hash: s.hash, iter: s.iter },
      tokens: s.tokens,
      fails: { count: s.fail_count, until: ms(s.fail_until) },
      recent: s.recent,
    };
  }

  private async insertRow(tx: Sql, r: Row, ignoreExisting = false) {
    const p = r.plan;
    const res = await tx`
      insert into plans (id, slug, visibility, info, items, version, sample, copied_from, created_at, updated_at)
      values (${p.id}, ${p.slug}, ${p.visibility}, ${tx.json(infoOf(p) as never)}, ${tx.json(r.items as never)}, ${p.version}, ${!!p.sample}, ${p.copiedFrom ?? null}, ${new Date(p.createdAt)}, ${new Date(p.updatedAt)})
      ${ignoreExisting ? tx`on conflict (id) do nothing` : tx``}
      returning id`;
    if (!res.length) return;
    await tx`insert into plan_secrets (plan_id, salt, hash, iter, tokens, fail_count, fail_until, recent)
      values (${p.id}, ${r.secret.salt}, ${r.secret.hash}, ${r.secret.iter}, ${r.tokens}, ${r.fails.count}, ${r.fails.until ? new Date(r.fails.until) : null}, ${tx.json(r.recent as never)})`;
    for (const h of r.history) await this.insertHistory(tx, p.id, h);
    for (const x of r.proposals) await this.upsertProposal(tx, p.id, x);
  }

  private insertHistory(tx: Sql, planId: string, h: HistoryEntry) {
    return tx`insert into plan_history (id, plan_id, at, kind, actor, summary, proposal_no, version)
      values (${h.id}, ${planId}, ${new Date(h.at)}, ${h.kind}, ${h.actor}, ${h.summary}, ${h.proposalNo ?? null}, ${h.version}) on conflict (id) do nothing`;
  }

  private upsertProposal(tx: Sql, planId: string, x: Proposal) {
    return tx`insert into proposals (id, plan_id, no, author_id, author_name, title, message, base_version, ops, status, created_at, decided_at, note, skipped)
      values (${x.id}, ${planId}, ${x.no}, ${x.authorId}, ${x.authorName}, ${x.title}, ${x.message}, ${x.baseVersion}, ${tx.json(x.ops as never)}, ${x.status}, ${new Date(x.createdAt)}, ${x.decidedAt ? new Date(x.decidedAt) : null}, ${x.note ?? null}, ${x.skipped ?? null})
      on conflict (id) do update set ops = excluded.ops, status = excluded.status, decided_at = excluded.decided_at, note = excluded.note, skipped = excluded.skipped`;
  }

  protected async read(id: string) {
    await this.seed();
    return this.load(this.sql, id, false);
  }

  protected async mutate<T>(id: string, fn: (r: Row) => T | Promise<T>): Promise<T> {
    await this.seed();
    return this.sql.begin(async (tx) => {
      const r = await this.load(tx, id, true);
      if (!r) throw new RepoError('계획을 찾을 수 없어요', 'not_found');
      const prevProps = new Map(r.proposals.map((x) => [x.id, JSON.stringify(x)]));
      const prevHist = new Set(r.history.map((h) => h.id));
      const out = await fn(r);
      const p = r.plan;
      await tx`update plans set slug = ${p.slug}, visibility = ${p.visibility}, info = ${tx.json(infoOf(p) as never)}, items = ${tx.json(r.items as never)},
        version = ${p.version}, updated_at = ${new Date(p.updatedAt)} where id = ${id}`;
      await tx`update plan_secrets set salt = ${r.secret.salt}, hash = ${r.secret.hash}, iter = ${r.secret.iter}, tokens = ${r.tokens},
        fail_count = ${r.fails.count}, fail_until = ${r.fails.until ? new Date(r.fails.until) : null}, recent = ${tx.json(r.recent as never)} where plan_id = ${id}`;
      for (const x of r.proposals) if (prevProps.get(x.id) !== JSON.stringify(x)) await this.upsertProposal(tx, id, x);
      for (const h of [...r.history].reverse()) if (!prevHist.has(h.id)) await this.insertHistory(tx, id, h);
      return out;
    }) as Promise<T>;
  }

  protected async insert(r: Row) {
    await this.seed();
    await this.sql.begin((tx) => this.insertRow(tx, r));
  }

  protected async changeId(oldId: string, newId: string) {
    // 비밀·제안·기록은 ON UPDATE CASCADE로 따라온다 (0002_rekey.sql)
    await this.sql.begin(async (tx) => {
      const [p] = await tx`select id from plans where id = ${oldId} for update`;
      if (!p) throw new RepoError('계획을 찾을 수 없어요', 'not_found');
      await tx`update plans set id = ${newId} where id = ${oldId}`;
    });
  }

  protected async delete(id: string) {
    await this.sql`delete from plans where id = ${id}`;
  }

  protected async readMany(ids: string[]) {
    await this.seed();
    if (!ids.length) return [];
    const [plans, prs] = await Promise.all([
      this.sql`select * from plans where id = any(${ids})`,
      this.sql`select * from proposals where plan_id = any(${ids}) and status = 'open'`,
    ]);
    return plans.map((p) => ({ plan: toPlan(p), items: p.items, proposals: prs.filter((x) => x.plan_id === p.id).map(toProposal), history: [], ...NO_SECRET }) as Row);
  }

  protected async readPublic(limit: number) {
    await this.seed();
    const plans = await this.sql`select * from plans where visibility = 'public' order by updated_at desc limit ${limit}`;
    return plans.map((p) => ({ plan: toPlan(p), items: p.items, proposals: [], history: [], ...NO_SECRET }) as Row);
  }
}
