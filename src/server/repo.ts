// 저장소. 화면(서버 컴포넌트·서버 액션)은 Repo 인터페이스만 안다.
//  - BaseRepo: 업무 규칙(기장 확인, 제안·수락·충돌, 잠금, 횟수 제한)을 한곳에
//  - FileRepo: 개발·테스트용 JSON 파일
//  - PgRepo(pg-repo.ts): Supabase Postgres. DATABASE_URL이 있으면 이쪽을 쓴다
//
// 기장 판단은 "비밀번호를 아는가"뿐이다. 비밀번호를 맞히면 토큰을 주고(쿠키에 담김), 기장만 할 수 있는 일은 토큰으로 확인한다.
// 비밀번호 해시와 토큰은 Bundle에 넣지 않는다.
import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Bundle, HistoryEntry, HistoryKind, Item, Op, Plan, PlanInfo, Proposal } from '@/lib/types';
import { applyOps, describeOps, findConflicts, opCounts, sortItems } from '@/lib/proposals';
import { cleanInfo, cleanItem, cleanOps, planSlug } from '@/lib/clean';
import { CHECK_LEN, CHECK_MAX } from '@/lib/suggest';
import { checkSecret, makeSecret, sha256, uid, type Secret } from './secret';
import { SAMPLES } from './samples.js';

export class RepoError extends Error {
  constructor(
    message: string,
    public code: 'not_found' | 'forbidden' | 'locked' | 'conflict' | 'invalid' | 'limited'
  ) {
    super(message);
    this.name = 'RepoError';
  }
}

/** instanceof 대신 이름으로 (개발 서버가 모듈을 다시 불러오면 클래스가 둘이 된다) */
export const isRepoError = (e: unknown): e is RepoError => e instanceof Error && e.name === 'RepoError' && 'code' in e;

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
  /** 준비물 하나 더하기·지우기·고치기 (계획 정보 전체를 덮어쓰지 않는다) */
  editChecklist(id: string, token: string, op: ChecklistOp): Promise<void>;
  applyDirect(id: string, token: string, ops: Op[]): Promise<void>;
  propose(id: string, p: ProposalInput): Promise<Proposal>;
  decide(id: string, token: string, no: number, decision: 'accept' | 'reject', note: string, skipConflicts?: boolean): Promise<Proposal>;
  /** 변경 하나씩 결정. force면 그 사이 바뀐 칸도 제안대로 덮어쓴다 */
  decideOps(id: string, token: string, list: OpDecision[], force?: boolean): Promise<{ accepted: number; rejected: number }>;
  withdrawOp(id: string, no: number, index: number, authorIds: string[]): Promise<void>;
  /** 계정 기장에게 기장 토큰을 준다 (계정 소유는 호출하는 쪽에서 확인한다) */
  grant(id: string): Promise<string>;
  /** 계정 기장이 지금 비밀번호 없이 계획 비밀번호를 정한다 (기장 토큰 필요) */
  setPassword(id: string, token: string, next: string): Promise<void>;
  rejectAllOpen(id: string, token: string, note: string): Promise<number>;
  withdraw(id: string, no: number, authorIds: string[]): Promise<void>;
  remove(id: string, token: string): Promise<void>;
  /** 링크 새로 만들기: 계획 id를 바꾼다. 예전 링크는 더 이상 열리지 않는다 */
  rekey(id: string, token: string): Promise<string>;
}

export type ChecklistOp = { type: 'add'; text: string } | { type: 'remove'; index: number; text: string } | { type: 'rename'; index: number; from: string; to: string };

export interface OpDecision {
  no: number;
  index: number;
  /** supersede: 같은 걸 원한 다른 제안이 반영돼서 정리 */
  decision: 'accept' | 'reject' | 'supersede';
}

/** 제안의 변경이 모두 결정되면 제안 상태를 정한다 */
export function settle(pr: Proposal) {
  if (pr.status !== 'open' || pr.ops.some((o) => !o.state)) return;
  // 같은 걸 원한 다른 제안이 반영돼 정리된 것(superseded)도 바람이 이뤄졌으니 반영으로 센다
  const ok = (o: Op) => o.state === 'accepted' || o.state === 'superseded';
  const acc = pr.ops.filter(ok).length;
  pr.status = acc === pr.ops.length ? 'accepted' : acc ? 'partial' : pr.ops.every((o) => o.state === 'withdrawn') ? 'withdrawn' : 'rejected';
  if (pr.status === 'partial') pr.skipped = pr.ops.map((o, i) => (ok(o) ? -1 : i)).filter((i) => i >= 0);
  pr.decidedAt = Date.now();
}

/** 저장소 안에서 다루는 계획 한 건 (비밀 포함) */
export interface Row extends Bundle {
  secret: Secret;
  tokens: string[];
  fails: { count: number; until: number };
  /** 제안 남발 막기: 보낸 사람별 최근 제안 시각 */
  recent: Record<string, number[]>;
}

export const strip = (r: Row): Bundle => ({ plan: r.plan, items: sortItems(r.items), proposals: r.proposals, history: r.history });
const HISTORY_MAX = 300;

/** 추가하는 일정의 id가 이미 있는 일정이나 다른 추가와 겹치면 새 id를 준다 (겹치면 수락할 때 추가가 빠진다) */
export function freshAddIds(ops: Op[], items: Item[]): Op[] {
  const taken = new Set(items.map((i) => i.id));
  return ops.map((op) => {
    if (op.type !== 'add') return op;
    let id = op.item.id;
    while (taken.has(id)) id = uid(8);
    taken.add(id);
    return id === op.item.id ? op : { ...op, item: { ...op.item, id } };
  });
}

/** 업무 규칙. 저장 방식은 아래 다섯 가지만 구현하면 된다 */
export abstract class BaseRepo implements Repo {
  /** 잠그지 않고 읽기 */
  protected abstract read(id: string): Promise<Row | null>;
  /** 잠그고 읽고-고치고-저장 (fn이 던지면 아무것도 저장하지 않는다) */
  protected abstract mutate<T>(id: string, fn: (r: Row) => T | Promise<T>): Promise<T>;
  protected abstract insert(r: Row): Promise<void>;
  protected abstract delete(id: string): Promise<void>;
  protected abstract readMany(ids: string[]): Promise<Row[]>;
  protected abstract readPublic(limit: number): Promise<Row[]>;
  protected abstract changeId(oldId: string, newId: string): Promise<void>;

  private async must(id: string) {
    const r = await this.read(id);
    if (!r) throw new RepoError('계획을 찾을 수 없어요', 'not_found');
    return r;
  }

  private owner(r: Row, token: string | null | undefined) {
    if (!token || !r.tokens.includes(sha256(token))) throw new RepoError('기장 인증이 필요해요', 'forbidden');
  }

  private log(r: Row, kind: HistoryKind, actor: string, summary: string, proposalNo?: number) {
    const e: HistoryEntry = { id: uid(8), at: Date.now(), kind, actor, summary, proposalNo, version: r.plan.version };
    r.history.unshift(e);
    if (r.history.length > HISTORY_MAX) r.history.length = HISTORY_MAX;
  }

  private touch(r: Row) {
    r.plan.updatedAt = Date.now();
  }

  async get(id: string) {
    const r = await this.read(id);
    return r ? strip(r) : null;
  }

  async getMany(ids: string[]) {
    return (await this.readMany(ids)).map(strip);
  }

  async listPublic(limit = 60) {
    return (await this.readPublic(limit)).map(strip);
  }

  async create(info: PlanInfo, items: Item[], password: string, extra: Pick<Plan, 'sample' | 'copiedFrom'> = {}) {
    if (password.length < 4) throw new RepoError('비밀번호는 4자 이상이어야 해요', 'invalid');
    const clean = cleanInfo(info);
    const secret = await makeSecret(password);
    const token = uid(24);
    const now = Date.now();
    const plan: Plan = { ...clean, id: uid(10), slug: planSlug(clean), version: 1, createdAt: now, updatedAt: now, ...extra };
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
    await this.insert(r);
    return { bundle: strip(r), token };
  }

  async login(id: string, password: string) {
    const r = await this.must(id);
    if (r.fails.until > Date.now()) {
      throw new RepoError(`비밀번호를 여러 번 틀렸어요. ${Math.ceil((r.fails.until - Date.now()) / 1000)}초 뒤에 다시 해 주세요`, 'locked');
    }
    const ok = await checkSecret(password, r.secret);
    // 틀린 횟수도 저장해야 하므로 트랜잭션 안에서는 던지지 않고, 저장이 끝난 뒤에 던진다
    const token = await this.mutate(id, (row) => {
      if (!ok) {
        row.fails.count++;
        // 계획 전체로는 20번 틀리면 1분, 그 뒤로 두 배 (IP 단위 제한은 서버 액션에서 따로. 한 사람이 일부러 틀려도 바로 잠기지 않게)
        if (row.fails.count >= 20) row.fails.until = Date.now() + 60_000 * 2 ** Math.min(8, row.fails.count - 20);
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
    const r = await this.read(id);
    return !!r && r.tokens.includes(sha256(token));
  }

  async logout(id: string, token: string) {
    if (!(await this.read(id))) return;
    await this.mutate(id, (r) => {
      r.tokens = r.tokens.filter((t) => t !== sha256(token));
    });
  }

  async changePassword(id: string, token: string, current: string, next: string) {
    const r0 = await this.must(id);
    this.owner(r0, token);
    if (!(await checkSecret(current, r0.secret))) throw new RepoError('지금 비밀번호가 맞지 않아요', 'forbidden');
    if (next.length < 4) throw new RepoError('새 비밀번호는 4자 이상이어야 해요', 'invalid');
    const secret = await makeSecret(next);
    await this.mutate(id, (r) => {
      this.owner(r, token);
      r.secret = secret;
      // 비밀번호를 바꾸면 다른 기기의 기장 인증은 모두 풀린다
      r.tokens = [sha256(token)];
      this.log(r, 'meta', r.plan.ownerName, '기장 비밀번호를 바꿨어요');
      this.touch(r);
    });
  }

  async updateInfo(id: string, token: string, info: PlanInfo) {
    const clean = cleanInfo(info);
    return this.mutate(id, (r) => {
      this.owner(r, token);
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
    await this.mutate(id, (r) => {
      this.owner(r, token);
      const c = r.plan.checklist[index];
      if (!c) throw new RepoError('없는 항목이에요', 'invalid');
      c[1] = !!done;
      this.touch(r);
    });
  }

  async editChecklist(id: string, token: string, op: ChecklistOp) {
    const clip = (t: unknown) => String(t ?? '').trim().slice(0, CHECK_LEN);
    await this.mutate(id, (r) => {
      this.owner(r, token);
      const list = r.plan.checklist;
      // 다른 탭에서 먼저 바뀌었으면 번호가 어긋날 수 있어서 글자도 같이 맞춰 본다
      const at = (i: number, t: string) => (list[i]?.[0] === t ? i : list.findIndex(([x]) => x === t));
      if (op.type === 'add') {
        const t = clip(op.text);
        if (!t) throw new RepoError('준비할 것을 적어 주세요', 'invalid');
        if (list.some(([x]) => x === t)) throw new RepoError('이미 있는 항목이에요', 'invalid');
        if (list.length >= CHECK_MAX) throw new RepoError(`준비물은 ${CHECK_MAX}개까지예요`, 'limited');
        list.push([t, false]);
      } else if (op.type === 'remove') {
        const i = at(Number(op.index), clip(op.text));
        if (i < 0) return;
        list.splice(i, 1);
      } else {
        const i = at(Number(op.index), clip(op.from));
        const t = clip(op.to);
        if (i < 0) throw new RepoError('없는 항목이에요', 'invalid');
        if (!t) throw new RepoError('준비할 것을 적어 주세요', 'invalid');
        if (list.some(([x], k) => x === t && k !== i)) throw new RepoError('이미 있는 항목이에요', 'invalid');
        list[i][0] = t;
      }
      // 일정 버전은 올리지 않는다 (승객 제안 바구니에 "그 사이 바뀜"이 뜨지 않게)
      this.touch(r);
    });
  }

  async applyDirect(id: string, token: string, ops: Op[]) {
    const cleaned = cleanOps(ops);
    if (!cleaned.length) return;
    await this.mutate(id, (r) => {
      this.owner(r, token);
      const clean = freshAddIds(cleaned, r.items);
      const summary = describeOps(clean, r.items);
      r.items = applyOps(r.items, clean);
      r.plan.version++;
      this.log(r, 'direct', r.plan.ownerName, summary);
      this.touch(r);
    });
  }

  async propose(id: string, p: ProposalInput) {
    const cleaned = cleanOps(p.ops);
    if (!cleaned.length) throw new RepoError('제안할 변경이 없어요', 'invalid');
    return this.mutate(id, (r) => {
      const ops = freshAddIds(cleaned, r.items);
      // 같은 사람이 10분에 5번 넘게 보내면 잠깐 막는다 (공개 계획 도배 방지)
      const now = Date.now();
      const mine = (r.recent[p.authorId] || []).filter((t) => now - t < 600_000);
      if (mine.length >= 5) throw new RepoError('제안을 너무 자주 보냈어요. 잠시 뒤에 다시 보내 주세요', 'limited');
      if (r.proposals.filter((x) => x.status === 'open').length >= 50) throw new RepoError('열린 제안이 너무 많아요. 기장이 정리한 뒤에 보내 주세요', 'limited');
      // 오래된 기록은 버린다 (사람이 많아도 커지지 않게)
      for (const k of Object.keys(r.recent)) if (!r.recent[k].some((t) => now - t < 600_000)) delete r.recent[k];
      r.recent[p.authorId] = [...mine, now];
      const no = r.proposals.reduce((m, x) => Math.max(m, x.no), 0) + 1;
      const pr: Proposal = {
        id: uid(10),
        no,
        authorId: p.authorId,
        authorName: p.authorName.trim().slice(0, 20) || '승객',
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
    return this.mutate(id, (r) => {
      this.owner(r, token);
      const pr = r.proposals.find((x) => x.no === no);
      if (!pr) throw new RepoError('제안을 찾을 수 없어요', 'not_found');
      if (pr.status !== 'open') throw new RepoError('이미 처리된 제안이에요', 'invalid');
      // 하나씩 결정한 변경이 있으면 남은(대기) 변경만 다룬다
      const done = new Set(pr.ops.map((o, i) => (o.state ? i : -1)).filter((i) => i >= 0));
      if (decision === 'accept') {
        const conflicts = findConflicts(r.items, pr.ops).filter((c) => !done.has(c.op));
        if (conflicts.length && !skipConflicts) throw new RepoError('그 사이 계획이 바뀌어서 겹치는 변경이 있어요', 'conflict');
        const skip = new Set([...done, ...conflicts.map((c) => c.op)]);
        if (skip.size === pr.ops.length) throw new RepoError('반영할 수 있는 변경이 하나도 없어요', 'conflict');
        r.items = applyOps(r.items, pr.ops, skip);
        r.plan.version++;
        pr.ops.forEach((o, i) => {
          if (!o.state) o.state = skip.has(i) ? 'rejected' : 'accepted';
        });
        const acc = pr.ops.filter((o) => o.state === 'accepted').length;
        pr.status = acc === pr.ops.length ? 'accepted' : 'partial';
        if (pr.status === 'partial') pr.skipped = pr.ops.map((o, i) => (o.state === 'accepted' ? -1 : i)).filter((i) => i >= 0);
      } else {
        pr.ops.forEach((o) => (o.state ||= 'rejected'));
        pr.status = pr.ops.some((o) => o.state === 'accepted') ? 'partial' : 'rejected';
      }
      pr.decidedAt = Date.now();
      pr.note = note.trim().slice(0, 500) || undefined;
      const verb = pr.status === 'accepted' ? '수락' : pr.status === 'partial' ? '일부 수락' : '거절';
      this.log(r, pr.status, r.plan.ownerName, `#${no} '${pr.title}' ${verb}`, no);
      this.touch(r);
      return pr;
    });
  }

  async rejectAllOpen(id: string, token: string, note: string) {
    return this.mutate(id, (r) => {
      this.owner(r, token);
      const open = r.proposals.filter((x) => x.status === 'open');
      for (const pr of open) {
        pr.ops.forEach((o) => (o.state ||= 'rejected'));
        settle(pr);
        pr.note = note.trim().slice(0, 500) || undefined;
      }
      if (open.length) this.log(r, 'rejected', r.plan.ownerName, `열린 제안 ${open.length}개를 모두 거절`);
      this.touch(r);
      return open.length;
    });
  }

  async decideOps(id: string, token: string, list: OpDecision[], force = false) {
    if (!Array.isArray(list) || !list.length || list.length > 100) throw new RepoError('결정할 변경이 없어요', 'invalid');
    return this.mutate(id, (r) => {
      this.owner(r, token);
      const parts: string[] = [];
      const authors = new Set<string>();
      let accepted = 0;
      let rejected = 0;
      for (const d of list) {
        const pr = r.proposals.find((x) => x.no === Number(d.no));
        const op = pr?.ops[Number(d.index)];
        if (!pr || !op) throw new RepoError('제안을 찾을 수 없어요', 'not_found');
        if (pr.status !== 'open' || op.state) continue; // 이미 결정됨 (다른 탭 등): 조용히 넘어간다
        if (d.decision === 'accept') {
          const conflict = findConflicts(r.items, [op])[0];
          if (conflict && !force) throw new RepoError('그 사이 계획이 바뀌어서 겹치는 변경이 있어요', 'conflict');
          if (conflict?.reason === 'gone') throw new RepoError('이미 지워진 일정이라 반영할 수 없어요', 'conflict');
          r.items = applyOps(r.items, [op]);
          op.state = 'accepted';
          accepted++;
          parts.push(describeOps([op], r.items) + ' 반영');
        } else {
          op.state = d.decision === 'supersede' ? 'superseded' : 'rejected';
          if (d.decision === 'reject') {
            rejected++;
            parts.push(describeOps([op], r.items) + ' 거절');
          }
        }
        authors.add(pr.authorName);
        settle(pr);
      }
      if (accepted) r.plan.version++;
      if (parts.length) {
        const who = [...authors].slice(0, 2).join('·') + (authors.size > 2 ? ` 외 ${authors.size - 2}명` : '');
        const text = parts.slice(0, 3).join(', ') + (parts.length > 3 ? ` 외 ${parts.length - 3}건` : '');
        this.log(r, accepted ? 'accepted' : 'rejected', r.plan.ownerName, `${who}의 제안: ${text}`);
      }
      this.touch(r);
      return { accepted, rejected };
    });
  }

  async withdrawOp(id: string, no: number, index: number, authorIds: string[]) {
    await this.mutate(id, (r) => {
      const pr = r.proposals.find((x) => x.no === no);
      const op = pr?.ops[index];
      if (!pr || !op || pr.status !== 'open' || op.state) throw new RepoError('철회할 수 없는 제안이에요', 'invalid');
      if (!authorIds.includes(pr.authorId)) throw new RepoError('제안한 사람만 철회할 수 있어요', 'forbidden');
      op.state = 'withdrawn';
      settle(pr);
      this.log(r, 'withdrawn', pr.authorName, `#${no} ${describeOps([op], r.items)} 철회`, no);
      this.touch(r);
    });
  }

  async grant(id: string) {
    const t = uid(24);
    await this.mutate(id, (r) => {
      r.tokens = [sha256(t), ...r.tokens].slice(0, 20);
    });
    return t;
  }

  async setPassword(id: string, token: string, next: string) {
    if (next.length < 4) throw new RepoError('새 비밀번호는 4자 이상이어야 해요', 'invalid');
    const secret = await makeSecret(next);
    await this.mutate(id, (r) => {
      this.owner(r, token);
      r.secret = secret;
      r.tokens = [sha256(token)];
      this.log(r, 'meta', r.plan.ownerName, '기장 비밀번호를 정했어요');
      this.touch(r);
    });
  }

  async withdraw(id: string, no: number, authorIds: string[]) {
    await this.mutate(id, (r) => {
      const pr = r.proposals.find((x) => x.no === no);
      if (!pr || pr.status !== 'open') throw new RepoError('철회할 수 없는 제안이에요', 'invalid');
      if (!authorIds.includes(pr.authorId)) throw new RepoError('제안한 사람만 철회할 수 있어요', 'forbidden');
      pr.ops.forEach((o) => (o.state ||= 'withdrawn'));
      settle(pr);
      this.log(r, 'withdrawn', pr.authorName, `#${no} '${pr.title}' 철회`, no);
      this.touch(r);
    });
  }

  async remove(id: string, token: string) {
    this.owner(await this.must(id), token);
    await this.delete(id);
  }

  async rekey(id: string, token: string) {
    const r = await this.must(id);
    this.owner(r, token);
    if (r.plan.sample) throw new RepoError('예시 계획은 링크를 바꿀 수 없어요', 'invalid');
    const next = uid(10);
    await this.changeId(id, next);
    await this.mutate(next, (row) => {
      this.log(row, 'meta', row.plan.ownerName, '링크를 새로 만들었어요 (예전 링크는 더 이상 열리지 않아요)');
      this.touch(row);
    });
    return next;
  }
}

/** 개발·테스트용 JSON 파일 저장소. 쓰기는 한 줄로 세워서 한 번에 하나씩 한다 */
export class FileRepo extends BaseRepo {
  private file: string;
  private db: { rows: Record<string, Row> } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private loading: Promise<{ rows: Record<string, Row> }> | null = null;

  constructor(dir = path.join(process.cwd(), '.data')) {
    super();
    this.file = path.join(dir, 'db.json');
  }

  private load() {
    if (this.db) return Promise.resolve(this.db);
    this.loading ??= (async () => {
      try {
        this.db = JSON.parse(await readFile(this.file, 'utf8'));
      } catch {
        // 처음 실행: 예시 계획을 넣어 둔다
        this.db = { rows: Object.fromEntries((await sampleRows()).map((r) => [r.plan.id, r])) };
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

  private queue<T>(fn: () => Promise<T>) {
    const run = this.chain.then(fn);
    this.chain = run.catch(() => {});
    return run;
  }

  protected async read(id: string) {
    const r = (await this.load()).rows[id];
    return r ? (structuredClone(r) as Row) : null;
  }

  protected mutate<T>(id: string, fn: (r: Row) => T | Promise<T>) {
    return this.queue(async () => {
      const db = await this.load();
      if (!db.rows[id]) throw new RepoError('계획을 찾을 수 없어요', 'not_found');
      const r = structuredClone(db.rows[id]) as Row;
      const out = await fn(r);
      db.rows[id] = r;
      await this.save();
      return out;
    });
  }

  protected insert(r: Row) {
    return this.queue(async () => {
      (await this.load()).rows[r.plan.id] = r;
      await this.save();
    });
  }

  protected delete(id: string) {
    return this.queue(async () => {
      delete (await this.load()).rows[id];
      await this.save();
    });
  }

  protected async readMany(ids: string[]) {
    const db = await this.load();
    return ids.map((id) => db.rows[id]).filter(Boolean);
  }

  protected changeId(oldId: string, newId: string) {
    return this.queue(async () => {
      const db = await this.load();
      const r = db.rows[oldId];
      if (!r) throw new RepoError('계획을 찾을 수 없어요', 'not_found');
      r.plan.id = newId;
      db.rows[newId] = r;
      delete db.rows[oldId];
      await this.save();
    });
  }

  protected async readPublic(limit: number) {
    const db = await this.load();
    return Object.values(db.rows)
      .filter((r) => r.plan.visibility === 'public')
      .sort((a, b) => b.plan.updatedAt - a.plan.updatedAt)
      .slice(0, limit);
  }
}

/** moon.log 예시 계획 → 전체 공개 예시 계획. 기장 비밀번호는 SDT_SAMPLE_PASSWORD(없으면 아무도 모르는 값) */
export async function sampleRows(): Promise<Row[]> {
  const secret = await makeSecret(process.env.SDT_SAMPLE_PASSWORD || uid(24));
  const now = Date.now();
  return (SAMPLES as Record<string, unknown>[]).map((raw, n) => {
    const s = raw as { slug: string; stops?: { name: string; en?: string; coords: [number, number]; note?: string }[]; addedAt?: string };
    const info = cleanInfo({ ...raw, scope: 'abroad', ownerName: '섬데트', visibility: 'public' });
    const stops = s.stops || [];
    const items: Item[] = stops.map((st, i) =>
      cleanItem({
        id: `${s.slug.slice(0, 6)}${i}`,
        day: Math.min(info.days, Math.floor((i * info.days) / Math.max(stops.length, 1)) + 1),
        title: st.name,
        en: st.en || '',
        kind: 'see',
        place: { name: st.name, en: st.en, lat: st.coords[0], lng: st.coords[1] },
        memo: st.note || '',
        order: i,
      })
    );
    const at = s.addedAt ? Date.parse(s.addedAt) : now - n * 86400000;
    const plan: Plan = { ...info, id: s.slug, slug: planSlug(info), version: 1, createdAt: at, updatedAt: at, sample: true };
    return {
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
}
