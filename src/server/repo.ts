// 저장소. 화면(서버 컴포넌트·서버 액션)은 Repo 인터페이스만 알고, 지금은 JSON 파일 구현(FileRepo)을 쓴다.
// 2단계에서 같은 인터페이스로 SupabaseRepo를 만들어 갈아 끼운다.
//
// 주인 판단은 "비밀번호를 아는가"뿐이다. 비밀번호를 맞히면 토큰을 주고(쿠키에 담김), 주인만 할 수 있는 일은 토큰으로 확인한다.
// 비밀번호 해시와 토큰은 Bundle에 넣지 않는다.
import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Bundle, HistoryEntry, HistoryKind, Item, Op, Plan, PlanInfo, Proposal } from '@/lib/types';
import { applyOps, describeOps, findConflicts, opCounts, sortItems } from '@/lib/proposals';
import { cleanInfo, cleanItem, cleanOps, planSlug } from '@/lib/clean';
import { checkSecret, makeSecret, sha256, uid, type Secret } from './secret';
import { SAMPLES } from './samples.js';

export class RepoError extends Error {
  constructor(
    message: string,
    public code: 'not_found' | 'forbidden' | 'locked' | 'conflict' | 'invalid' | 'limited'
  ) {
    super(message);
  }
}

export interface ProposalInput {
  authorId: string;
  authorName: string;
  title: string;
  message: string;
  baseVersion: number;
  ops: Op[];
}

export interface Repo {
  get(id: string): Promise<Bundle | null>;
  getMany(ids: string[]): Promise<Bundle[]>;
  listPublic(limit?: number): Promise<Bundle[]>;
  create(info: PlanInfo, items: Item[], password: string, extra?: Pick<Plan, 'sample' | 'copiedFrom'>): Promise<{ bundle: Bundle; token: string }>;
  login(id: string, password: string): Promise<string>;
  checkToken(id: string, token: string | null | undefined): Promise<boolean>;
  logout(id: string, token: string): Promise<void>;
  changePassword(id: string, token: string, current: string, next: string): Promise<void>;
  updateInfo(id: string, token: string, info: PlanInfo): Promise<Plan>;
  setCheck(id: string, token: string, index: number, done: boolean): Promise<void>;
  applyDirect(id: string, token: string, ops: Op[]): Promise<void>;
  propose(id: string, p: ProposalInput): Promise<Proposal>;
  decide(id: string, token: string, no: number, decision: 'accept' | 'reject', note: string, skipConflicts?: boolean): Promise<Proposal>;
  rejectAllOpen(id: string, token: string, note: string): Promise<number>;
  withdraw(id: string, no: number, authorId: string): Promise<void>;
  remove(id: string, token: string): Promise<void>;
}

interface Row extends Bundle {
  secret: Secret;
  tokens: string[];
  fails: { count: number; until: number };
  /** 제안 남발 막기: 보낸 사람별 최근 제안 시각 */
  recent: Record<string, number[]>;
}

interface DB {
  rows: Record<string, Row>;
}

const strip = (r: Row): Bundle => ({ plan: r.plan, items: sortItems(r.items), proposals: r.proposals, history: r.history });

/** 개발용 JSON 파일 저장소. 쓰기는 한 줄로 세워서 한 번에 하나씩 한다 */
export class FileRepo implements Repo {
  private file: string;
  private db: DB | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(dir = path.join(process.cwd(), '.data')) {
    this.file = path.join(dir, 'db.json');
  }

  private loading: Promise<DB> | null = null;
  private load(): Promise<DB> {
    if (this.db) return Promise.resolve(this.db);
    this.loading ??= (async () => {
      try {
        this.db = JSON.parse(await readFile(this.file, 'utf8')) as DB;
      } catch {
        // 처음 실행: 예시 계획을 넣어 둔다
        this.db = { rows: await sampleRows() };
        await this.save();
      }
      return this.db!;
    })();
    return this.loading;
  }

  private async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    await writeFile(tmp, JSON.stringify(this.db));
    await rename(tmp, this.file);
  }

  /** 읽고-고치고-저장을 한 줄로 */
  private tx<T>(fn: (db: DB) => Promise<T> | T): Promise<T> {
    const run = this.chain.then(async () => {
      const db = await this.load();
      const out = await fn(db);
      await this.save();
      return out;
    });
    this.chain = run.catch(() => {});
    return run;
  }

  private must(db: DB, id: string) {
    const r = db.rows[id];
    if (!r) throw new RepoError('계획을 찾을 수 없어요', 'not_found');
    return r;
  }

  private async owner(r: Row, token: string | null | undefined) {
    if (!token || !r.tokens.includes(sha256(token))) throw new RepoError('주인 인증이 필요해요', 'forbidden');
  }

  private log(r: Row, kind: HistoryKind, actor: string, summary: string, proposalNo?: number) {
    const e: HistoryEntry = { id: uid(8), at: Date.now(), kind, actor, summary, proposalNo, version: r.plan.version };
    r.history.unshift(e);
    if (r.history.length > 300) r.history.length = 300;
  }

  private touch(r: Row) {
    r.plan.updatedAt = Date.now();
  }

  async get(id: string) {
    const db = await this.load();
    const r = db.rows[id];
    return r ? strip(r) : null;
  }

  async getMany(ids: string[]) {
    const db = await this.load();
    return ids.map((id) => db.rows[id]).filter(Boolean).map(strip);
  }

  async listPublic(limit = 60) {
    const db = await this.load();
    return Object.values(db.rows)
      .filter((r) => r.plan.visibility === 'public')
      .sort((a, b) => b.plan.updatedAt - a.plan.updatedAt)
      .slice(0, limit)
      .map(strip);
  }

  async create(info: PlanInfo, items: Item[], password: string, extra: Pick<Plan, 'sample' | 'copiedFrom'> = {}) {
    if (password.length < 4) throw new RepoError('비밀번호는 4자 이상이어야 해요', 'invalid');
    const clean = cleanInfo(info);
    const secret = await makeSecret(password);
    const token = uid(24);
    return this.tx((db) => {
      let id = uid(10);
      while (db.rows[id]) id = uid(10);
      const now = Date.now();
      const plan: Plan = { ...clean, id, slug: planSlug(clean), version: 1, createdAt: now, updatedAt: now, ...extra };
      const r: Row = {
        plan,
        items: sortItems(items.slice(0, 200).map(cleanItem)),
        proposals: [],
        history: [],
        secret,
        tokens: [sha256(token)],
        fails: { count: 0, until: 0 },
        recent: {},
      };
      this.log(r, 'created', clean.ownerName, extra.copiedFrom ? `다른 계획을 복사해서 '${clean.title}'을(를) 만들었어요` : `'${clean.title}' 계획을 만들었어요`);
      db.rows[id] = r;
      return { bundle: strip(r), token };
    });
  }

  async login(id: string, password: string) {
    const db = await this.load();
    const r = this.must(db, id);
    if (r.fails.until > Date.now()) {
      throw new RepoError(`비밀번호를 여러 번 틀렸어요. ${Math.ceil((r.fails.until - Date.now()) / 1000)}초 뒤에 다시 해 주세요`, 'locked');
    }
    const ok = await checkSecret(password, r.secret);
    // 틀린 횟수도 저장해야 하므로 트랜잭션 안에서는 던지지 않고, 저장이 끝난 뒤에 던진다
    const token = await this.tx((db2) => {
      const row = this.must(db2, id);
      if (!ok) {
        row.fails.count++;
        // 5번 틀리면 30초, 그 뒤로는 틀릴 때마다 두 배
        if (row.fails.count >= 5) row.fails.until = Date.now() + 30_000 * 2 ** Math.min(10, row.fails.count - 5);
        return null;
      }
      const t = uid(24);
      row.fails = { count: 0, until: 0 };
      row.tokens = [sha256(t), ...row.tokens].slice(0, 20);
      return t;
    });
    if (!token) throw new RepoError('비밀번호가 맞지 않아요', 'forbidden');
    return token;
  }

  async checkToken(id: string, token: string | null | undefined) {
    if (!token) return false;
    const db = await this.load();
    const r = db.rows[id];
    return !!r && r.tokens.includes(sha256(token));
  }

  async logout(id: string, token: string) {
    await this.tx((db) => {
      const r = db.rows[id];
      if (r) r.tokens = r.tokens.filter((t) => t !== sha256(token));
    });
  }

  async changePassword(id: string, token: string, current: string, next: string) {
    const db = await this.load();
    const r0 = this.must(db, id);
    await this.owner(r0, token);
    if (!(await checkSecret(current, r0.secret))) throw new RepoError('지금 비밀번호가 맞지 않아요', 'forbidden');
    if (next.length < 4) throw new RepoError('새 비밀번호는 4자 이상이어야 해요', 'invalid');
    const secret = await makeSecret(next);
    await this.tx((db2) => {
      const r = this.must(db2, id);
      r.secret = secret;
      // 비밀번호를 바꾸면 다른 기기의 주인 인증은 모두 풀린다
      r.tokens = [sha256(token)];
      this.log(r, 'meta', r.plan.ownerName, '주인 비밀번호를 바꿨어요');
      this.touch(r);
    });
  }

  async updateInfo(id: string, token: string, info: PlanInfo) {
    const db = await this.load();
    await this.owner(this.must(db, id), token);
    const clean = cleanInfo(info);
    return this.tx((db2) => {
      const r = this.must(db2, id);
      const was = r.plan.visibility;
      r.plan = { ...r.plan, ...clean, slug: planSlug(clean) };
      // 기간이 줄면 넘치는 날의 일정은 "날짜 미정"으로
      let moved = 0;
      r.items = r.items.map((i) => (i.day != null && i.day > clean.days ? (moved++, { ...i, day: null }) : i));
      if (moved) r.plan.version++;
      const vis = was !== clean.visibility ? (clean.visibility === 'public' ? ' · 전체 공개로 바꿈' : ' · 링크 공개로 바꿈') : '';
      this.log(r, 'meta', r.plan.ownerName, `계획 정보를 고쳤어요${vis}${moved ? ` (일정 ${moved}개를 날짜 미정으로 옮김)` : ''}`);
      this.touch(r);
      return r.plan;
    });
  }

  async setCheck(id: string, token: string, index: number, done: boolean) {
    const db = await this.load();
    await this.owner(this.must(db, id), token);
    await this.tx((db2) => {
      const r = this.must(db2, id);
      const c = r.plan.checklist[index];
      if (!c) throw new RepoError('없는 항목이에요', 'invalid');
      c[1] = !!done;
      this.touch(r);
    });
  }

  async applyDirect(id: string, token: string, ops: Op[]) {
    const clean = cleanOps(ops);
    if (!clean.length) return;
    const db = await this.load();
    await this.owner(this.must(db, id), token);
    await this.tx((db2) => {
      const r = this.must(db2, id);
      const summary = describeOps(clean, r.items);
      r.items = applyOps(r.items, clean);
      r.plan.version++;
      this.log(r, 'direct', r.plan.ownerName, summary);
      this.touch(r);
    });
  }

  async propose(id: string, p: ProposalInput) {
    const ops = cleanOps(p.ops);
    if (!ops.length) throw new RepoError('제안할 변경이 없어요', 'invalid');
    return this.tx((db) => {
      const r = this.must(db, id);
      // 같은 사람이 10분에 5번 넘게 보내면 잠깐 막는다 (공개 계획 도배 방지)
      const now = Date.now();
      const mine = (r.recent[p.authorId] || []).filter((t) => now - t < 600_000);
      if (mine.length >= 5) throw new RepoError('제안을 너무 자주 보냈어요. 잠시 뒤에 다시 보내 주세요', 'limited');
      r.recent[p.authorId] = [...mine, now];
      const open = r.proposals.filter((x) => x.status === 'open').length;
      if (open >= 50) throw new RepoError('열린 제안이 너무 많아요. 주인이 정리한 뒤에 보내 주세요', 'limited');
      const no = r.proposals.reduce((m, x) => Math.max(m, x.no), 0) + 1;
      const pr: Proposal = {
        id: uid(10),
        no,
        authorId: p.authorId,
        authorName: p.authorName.trim().slice(0, 20) || '손님',
        title: p.title.trim().slice(0, 80) || describeOps(ops, r.items),
        message: p.message.trim().slice(0, 1000),
        baseVersion: Number(p.baseVersion) || r.plan.version,
        ops,
        status: 'open',
        createdAt: now,
      };
      r.proposals.unshift(pr);
      this.log(r, 'proposed', pr.authorName, `#${no} '${pr.title}' 제안 (${opCounts(ops)})`, no);
      this.touch(r);
      return pr;
    });
  }

  async decide(id: string, token: string, no: number, decision: 'accept' | 'reject', note: string, skipConflicts = false) {
    const db = await this.load();
    await this.owner(this.must(db, id), token);
    return this.tx((db2) => {
      const r = this.must(db2, id);
      const pr = r.proposals.find((x) => x.no === no);
      if (!pr) throw new RepoError('제안을 찾을 수 없어요', 'not_found');
      if (pr.status !== 'open') throw new RepoError('이미 처리된 제안이에요', 'invalid');
      if (decision === 'accept') {
        const conflicts = findConflicts(r.items, pr.ops);
        if (conflicts.length && !skipConflicts) throw new RepoError('그 사이 계획이 바뀌어서 겹치는 변경이 있어요', 'conflict');
        const skip = new Set(conflicts.map((c) => c.op));
        if (skip.size === pr.ops.length) throw new RepoError('반영할 수 있는 변경이 하나도 없어요', 'conflict');
        r.items = applyOps(r.items, pr.ops, skip);
        r.plan.version++;
        pr.status = skip.size ? 'partial' : 'accepted';
        if (skip.size) pr.skipped = [...skip];
      } else pr.status = 'rejected';
      pr.decidedAt = Date.now();
      pr.note = note.trim().slice(0, 500) || undefined;
      const verb = pr.status === 'accepted' ? '수락' : pr.status === 'partial' ? '일부 수락' : '거절';
      this.log(r, pr.status, r.plan.ownerName, `#${no} '${pr.title}' ${verb}`, no);
      this.touch(r);
      return pr;
    });
  }

  async rejectAllOpen(id: string, token: string, note: string) {
    const db = await this.load();
    await this.owner(this.must(db, id), token);
    return this.tx((db2) => {
      const r = this.must(db2, id);
      const open = r.proposals.filter((x) => x.status === 'open');
      for (const pr of open) {
        pr.status = 'rejected';
        pr.decidedAt = Date.now();
        pr.note = note.trim().slice(0, 500) || undefined;
      }
      if (open.length) this.log(r, 'rejected', r.plan.ownerName, `열린 제안 ${open.length}개를 모두 거절`);
      this.touch(r);
      return open.length;
    });
  }

  async withdraw(id: string, no: number, authorId: string) {
    await this.tx((db) => {
      const r = this.must(db, id);
      const pr = r.proposals.find((x) => x.no === no);
      if (!pr || pr.status !== 'open') throw new RepoError('철회할 수 없는 제안이에요', 'invalid');
      if (pr.authorId !== authorId) throw new RepoError('제안한 사람만 철회할 수 있어요', 'forbidden');
      pr.status = 'withdrawn';
      pr.decidedAt = Date.now();
      this.log(r, 'withdrawn', pr.authorName, `#${no} '${pr.title}' 철회`, no);
      this.touch(r);
    });
  }

  async remove(id: string, token: string) {
    const db = await this.load();
    await this.owner(this.must(db, id), token);
    await this.tx((db2) => {
      delete db2.rows[id];
    });
  }
}

/** moon.log 예시 계획 → 전체 공개 예시 계획. 주인 비밀번호는 SDT_SAMPLE_PASSWORD(없으면 아무도 모르는 값) */
async function sampleRows(): Promise<Record<string, Row>> {
  const secret = await makeSecret(process.env.SDT_SAMPLE_PASSWORD || uid(24));
  const rows: Record<string, Row> = {};
  const now = Date.now();
  (SAMPLES as Record<string, unknown>[]).forEach((raw, n) => {
    const s = raw as { slug: string; stops?: { name: string; en?: string; coords: [number, number]; note?: string }[]; days: number; addedAt?: string };
    const info = cleanInfo({ ...raw, scope: 'abroad', ownerName: '섬데트', visibility: 'public' });
    const stops = s.stops || [];
    const items: Item[] = stops.map((st, i) =>
      cleanItem({
        id: `${s.slug.slice(0, 6)}${i}`,
        day: Math.min(info.days, Math.floor((i * info.days) / Math.max(stops.length, 1)) + 1),
        time: '',
        title: st.name,
        en: st.en || '',
        kind: 'see',
        place: { name: st.name, en: st.en, lat: st.coords[0], lng: st.coords[1] },
        memo: st.note || '',
        cost: null,
        order: i,
      })
    );
    const at = s.addedAt ? Date.parse(s.addedAt) : now - n * 86400000;
    const plan: Plan = { ...info, id: s.slug, slug: planSlug(info), version: 1, createdAt: at, updatedAt: at, sample: true };
    rows[s.slug] = {
      plan,
      items,
      proposals: [],
      history: [{ id: uid(8), at, kind: 'created', actor: '섬데트', summary: `'${info.title}' 예시 계획`, version: 1 }],
      secret,
      tokens: [],
      fails: { count: 0, until: 0 },
      recent: {},
    };
  });
  return rows;
}

declare global {
  var __sdtRepo: Repo | undefined;
}

/** 개발 서버가 모듈을 다시 불러와도 같은 저장소를 쓰도록 전역에 하나만 */
export function repo(): Repo {
  globalThis.__sdtRepo ??= new FileRepo(process.env.SDT_DATA_DIR || undefined);
  return globalThis.__sdtRepo;
}
