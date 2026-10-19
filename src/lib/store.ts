// 저장소. 화면은 PlanStore 인터페이스만 알고, 1단계에서는 브라우저 localStorage 구현(LocalStore)을 쓴다.
// 2단계에서 같은 인터페이스로 SupabaseStore를 만들어 갈아 끼운다. 그래서 모든 메서드가 비동기다.
//
// 주인 판단은 "비밀번호를 아는가"뿐이다. 비밀번호를 맞히면 토큰을 주고, 주인만 할 수 있는 일은 토큰으로 확인한다.
// 비밀번호 해시와 토큰은 화면에 넘기지 않는다 (서버로 옮겼을 때와 같은 경계를 미리 지킨다).
import type { Bundle, HistoryEntry, HistoryKind, Item, Op, Plan, PlanInput, Proposal } from '../types';
import { checkSecret, makeSecret, sha256, type Secret } from './crypto';
import { applyOps, describeOps, findConflicts, opCounts, sortItems } from './proposals';
import { dayCount, uid } from './util';

export class StoreError extends Error {
  constructor(
    message: string,
    public code: 'not_found' | 'forbidden' | 'locked' | 'conflict' | 'invalid'
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

export interface PlanStore {
  list(): Promise<Bundle[]>;
  get(id: string): Promise<Bundle | null>;
  create(input: PlanInput, password: string, items?: Item[]): Promise<{ bundle: Bundle; token: string }>;
  login(id: string, password: string): Promise<string>;
  checkToken(id: string, token: string | null): Promise<boolean>;
  logout(id: string, token: string): Promise<void>;
  changePassword(id: string, token: string, current: string, next: string): Promise<void>;
  applyDirect(id: string, token: string, ops: Op[], actor: string): Promise<void>;
  updatePlan(id: string, token: string, patch: Partial<PlanInput>): Promise<void>;
  propose(id: string, p: ProposalInput): Promise<Proposal>;
  decide(id: string, token: string, no: number, decision: 'accept' | 'reject', note: string, skipConflicts?: boolean): Promise<Proposal>;
  withdraw(id: string, no: number, authorId: string): Promise<void>;
  remove(id: string, token: string): Promise<void>;
  remember(id: string): void;
  forget(id: string): void;
  subscribe(id: string, cb: () => void): () => void;
}

// ---- localStorage 구현 ----

interface Record_ extends Bundle {
  secret: Secret;
  tokens: string[];
  fails: { count: number; until: number };
}

const P = 'sdt:';
const keyOf = (id: string) => `${P}plan:${id}`;
const INDEX = `${P}index`;

export class LocalStore implements PlanStore {
  private bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('somedaytrip') : null;
  private subs = new Map<string, Set<() => void>>();

  constructor(private ls: Storage = localStorage) {
    // 다른 탭에서 바뀐 것도 알려 준다 (1단계의 "실시간")
    this.bc?.addEventListener('message', (e) => this.fire(e.data?.id, false));
  }

  private read(id: string): Record_ | null {
    try {
      return JSON.parse(this.ls.getItem(keyOf(id)) || 'null');
    } catch {
      return null;
    }
  }

  private must(id: string) {
    const r = this.read(id);
    if (!r) throw new StoreError('계획을 찾을 수 없어요', 'not_found');
    return r;
  }

  private write(r: Record_) {
    r.plan.updatedAt = Date.now();
    this.ls.setItem(keyOf(r.plan.id), JSON.stringify(r));
    this.fire(r.plan.id, true);
  }

  private fire(id: string | undefined, broadcast: boolean) {
    if (!id) return;
    if (broadcast) this.bc?.postMessage({ id });
    for (const k of [id, '*']) this.subs.get(k)?.forEach((cb) => cb());
  }

  private async owner(r: Record_, token: string | null) {
    if (!token || !r.tokens.includes(await sha256(token))) throw new StoreError('주인 인증이 필요해요', 'forbidden');
  }

  private log(r: Record_, kind: HistoryKind, actor: string, summary: string, proposalNo?: number) {
    const e: HistoryEntry = { id: uid(8), at: Date.now(), kind, actor, summary, proposalNo, version: r.plan.version };
    r.history.unshift(e);
    if (r.history.length > 300) r.history.length = 300;
  }

  private strip(r: Record_): Bundle {
    return { plan: r.plan, items: sortItems(r.items), proposals: r.proposals, history: r.history };
  }

  private index(): string[] {
    try {
      return JSON.parse(this.ls.getItem(INDEX) || '[]');
    } catch {
      return [];
    }
  }

  remember(id: string) {
    const ids = [id, ...this.index().filter((x) => x !== id)];
    this.ls.setItem(INDEX, JSON.stringify(ids.slice(0, 200)));
  }

  forget(id: string) {
    this.ls.setItem(INDEX, JSON.stringify(this.index().filter((x) => x !== id)));
    this.fire('*', false);
  }

  async list() {
    return this.index()
      .map((id) => this.read(id))
      .filter((r): r is Record_ => !!r)
      .map((r) => this.strip(r));
  }

  async get(id: string) {
    const r = this.read(id);
    return r ? this.strip(r) : null;
  }

  async create(input: PlanInput, password: string, items: Item[] = []) {
    if (password.length < 4) throw new StoreError('비밀번호는 4자 이상이어야 해요', 'invalid');
    const id = uid(10);
    const token = uid(24);
    const now = Date.now();
    const plan: Plan = { ...input, id, hue: Math.floor(Math.random() * 360), version: 1, createdAt: now, updatedAt: now };
    const r: Record_ = {
      plan,
      items: sortItems(items),
      proposals: [],
      history: [],
      secret: await makeSecret(password),
      tokens: [await sha256(token)],
      fails: { count: 0, until: 0 },
    };
    this.log(r, 'created', input.ownerName, `'${input.title}' 계획을 만들었어요`);
    this.write(r);
    this.remember(id);
    return { bundle: this.strip(r), token };
  }

  async login(id: string, password: string) {
    const r = this.must(id);
    if (r.fails.until > Date.now()) {
      throw new StoreError(`비밀번호를 여러 번 틀렸어요. ${Math.ceil((r.fails.until - Date.now()) / 1000)}초 뒤에 다시 해 주세요`, 'locked');
    }
    if (!(await checkSecret(password, r.secret))) {
      const fresh = this.must(id);
      fresh.fails.count++;
      // 5번 틀리면 30초, 그 뒤로는 틀릴 때마다 두 배씩 기다린다
      if (fresh.fails.count >= 5) fresh.fails.until = Date.now() + 30_000 * 2 ** (fresh.fails.count - 5);
      this.ls.setItem(keyOf(id), JSON.stringify(fresh));
      throw new StoreError('비밀번호가 맞지 않아요', 'forbidden');
    }
    const fresh = this.must(id);
    const token = uid(24);
    fresh.fails = { count: 0, until: 0 };
    fresh.tokens = [await sha256(token), ...fresh.tokens].slice(0, 20);
    this.ls.setItem(keyOf(id), JSON.stringify(fresh));
    return token;
  }

  async checkToken(id: string, token: string | null) {
    const r = this.read(id);
    return !!(r && token && r.tokens.includes(await sha256(token)));
  }

  async logout(id: string, token: string) {
    const r = this.read(id);
    if (!r) return;
    const h = await sha256(token);
    r.tokens = r.tokens.filter((t) => t !== h);
    this.ls.setItem(keyOf(id), JSON.stringify(r));
  }

  async changePassword(id: string, token: string, current: string, next: string) {
    const r = this.must(id);
    await this.owner(r, token);
    if (!(await checkSecret(current, r.secret))) throw new StoreError('지금 비밀번호가 맞지 않아요', 'forbidden');
    if (next.length < 4) throw new StoreError('새 비밀번호는 4자 이상이어야 해요', 'invalid');
    r.secret = await makeSecret(next);
    // 비밀번호를 바꾸면 다른 기기의 주인 인증은 모두 풀린다
    r.tokens = [await sha256(token)];
    this.log(r, 'meta', r.plan.ownerName, '주인 비밀번호를 바꿨어요');
    this.write(r);
  }

  async applyDirect(id: string, token: string, ops: Op[], actor: string) {
    if (!ops.length) return;
    const r = this.must(id);
    await this.owner(r, token);
    const summary = describeOps(ops, r.items);
    r.items = applyOps(r.items, ops);
    r.plan.version++;
    this.log(r, 'direct', actor, summary);
    this.write(r);
  }

  async updatePlan(id: string, token: string, patch: Partial<PlanInput>) {
    const r = this.must(id);
    await this.owner(r, token);
    r.plan = { ...r.plan, ...patch };
    // 일수가 줄면 범위를 넘는 일정은 "날짜 미정"으로 옮긴다
    const max = patch.when ? dayCount(patch.when) : Infinity;
    let moved = 0;
    r.items = r.items.map((i) => (i.day != null && i.day > max ? (moved++, { ...i, day: null }) : i));
    if (moved) r.plan.version++;
    this.log(r, 'meta', r.plan.ownerName, `계획 정보를 고쳤어요${moved ? ` (일정 ${moved}개를 날짜 미정으로 옮김)` : ''}`);
    this.write(r);
  }

  async propose(id: string, p: ProposalInput) {
    if (!p.ops.length) throw new StoreError('제안할 변경이 없어요', 'invalid');
    const r = this.must(id);
    const no = r.proposals.reduce((m, x) => Math.max(m, x.no), 0) + 1;
    const pr: Proposal = { ...p, id: uid(10), no, status: 'open', createdAt: Date.now() };
    r.proposals.unshift(pr);
    this.log(r, 'proposed', p.authorName, `#${no} '${p.title}' 제안 (${opCounts(p.ops)})`, no);
    this.write(r);
    return pr;
  }

  async decide(id: string, token: string, no: number, decision: 'accept' | 'reject', note: string, skipConflicts = false) {
    const r = this.must(id);
    await this.owner(r, token);
    const pr = r.proposals.find((x) => x.no === no);
    if (!pr) throw new StoreError('제안을 찾을 수 없어요', 'not_found');
    if (pr.status !== 'open') throw new StoreError('이미 처리된 제안이에요', 'invalid');

    if (decision === 'accept') {
      const conflicts = findConflicts(r.items, pr.ops);
      if (conflicts.length && !skipConflicts) throw new StoreError('그 사이 계획이 바뀌어서 겹치는 변경이 있어요', 'conflict');
      const skip = new Set(conflicts.map((c) => c.op));
      if (skip.size === pr.ops.length) throw new StoreError('반영할 수 있는 변경이 하나도 없어요', 'conflict');
      r.items = applyOps(r.items, pr.ops, skip);
      r.plan.version++;
      pr.status = skip.size ? 'partial' : 'accepted';
      if (skip.size) pr.skipped = [...skip];
    } else {
      pr.status = 'rejected';
    }
    pr.decidedAt = Date.now();
    pr.note = note.trim() || undefined;
    const verb = pr.status === 'accepted' ? '수락' : pr.status === 'partial' ? '일부 수락' : '거절';
    this.log(r, pr.status, r.plan.ownerName, `#${no} '${pr.title}' ${verb}`, no);
    this.write(r);
    return pr;
  }

  async withdraw(id: string, no: number, authorId: string) {
    const r = this.must(id);
    const pr = r.proposals.find((x) => x.no === no);
    if (!pr || pr.status !== 'open') throw new StoreError('철회할 수 없는 제안이에요', 'invalid');
    if (pr.authorId !== authorId) throw new StoreError('제안한 사람만 철회할 수 있어요', 'forbidden');
    pr.status = 'withdrawn';
    pr.decidedAt = Date.now();
    this.log(r, 'withdrawn', pr.authorName, `#${no} '${pr.title}' 철회`, no);
    this.write(r);
  }

  async remove(id: string, token: string) {
    const r = this.must(id);
    await this.owner(r, token);
    this.ls.removeItem(keyOf(id));
    this.forget(id);
    this.fire(id, true);
  }

  subscribe(id: string, cb: () => void) {
    if (!this.subs.has(id)) this.subs.set(id, new Set());
    this.subs.get(id)!.add(cb);
    return () => this.subs.get(id)?.delete(cb);
  }
}

export const store: PlanStore = typeof localStorage !== 'undefined' ? new LocalStore() : (null as never);
