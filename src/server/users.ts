// 이메일 계정 (선택 가입). 계획 저장소(repo.ts)와 떨어져 있어서 기존 계획 데이터에는 손대지 않는다.
// 업무 규칙은 BaseUserStore, 저장은 FileUserStore(개발·테스트) / PgUserStore(users-pg.ts)가 맡는다.
import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emailError, nickError, nickKey, normEmail, passwordError } from '@/lib/account';
import { checkSecret, makeSecret, sha256, uid, type Secret } from './secret';
import { RepoError } from './repo';

export const SESSION_DAYS = 30;
const DAY = 86_400_000;

export interface UserRow {
  id: string;
  email: string;
  nick: string;
  nickKey: string;
  secret: Secret;
  verifiedAt: number;
  notify: boolean;
  fails: { count: number; until: number };
  lastMailAt: number;
  createdAt: number;
}

/** 화면에 넘겨도 되는 모양 (해시 없음) */
export interface User {
  id: string;
  email: string;
  nick: string;
  verified: boolean;
  notify: boolean;
  createdAt: number;
}
export const publicUser = (u: UserRow): User => ({ id: u.id, email: u.email, nick: u.nick, verified: !!u.verifiedAt, notify: u.notify, createdAt: u.createdAt });

export type Role = 'owner' | 'member';
export class DupError extends Error {
  constructor(public field: 'email' | 'nick') {
    super(field);
  }
}

export abstract class BaseUserStore {
  protected abstract insertUser(u: UserRow): Promise<void>;
  protected abstract findUser(by: { id?: string; email?: string; nickKey?: string }): Promise<UserRow | null>;
  protected abstract updateUser(id: string, patch: Partial<UserRow>): Promise<void>;
  protected abstract removeUser(id: string): Promise<void>;
  protected abstract insertSession(hash: string, userId: string, expires: number): Promise<void>;
  protected abstract findSession(hash: string): Promise<string | null>;
  protected abstract removeSessions(by: { hash?: string; userId?: string }): Promise<void>;
  protected abstract insertToken(hash: string, userId: string, kind: 'verify' | 'reset', expires: number): Promise<void>;
  /** 쓰지 않았고 기한 안인 토큰이면 사용 처리하고 사용자 id를 돌려준다 */
  protected abstract takeToken(hash: string, kind: 'verify' | 'reset'): Promise<string | null>;
  abstract link(userId: string, planId: string, role: Role): Promise<void>;
  abstract links(userId: string): Promise<{ planId: string; role: Role }[]>;
  /** 지갑에서 빼기 (탑승한 계획만. 기장인 계획은 빼지 않는다) */
  abstract unlink(userId: string, planId: string): Promise<void>;
  abstract owners(planId: string): Promise<string[]>;
  /** 개발용 파일 저장소만 필요하다 (Postgres는 FK가 따라간다) */
  abstract renamePlan(oldId: string, newId: string): Promise<void>;
  abstract forgetPlan(planId: string): Promise<void>;

  async available({ email, nick }: { email?: string; nick?: string }) {
    return {
      email: email == null ? null : !emailError(email) && !(await this.findUser({ email: normEmail(email) })),
      nick: nick == null ? null : !nickError(nick) && !(await this.findUser({ nickKey: nickKey(nick) })),
    };
  }

  async signup(email: string, nick: string, password: string): Promise<User> {
    const bad = emailError(email) || nickError(nick) || passwordError(password);
    if (bad) throw new RepoError(bad, 'invalid');
    const e = normEmail(email);
    const n = nick.normalize('NFC').trim();
    // 먼저 확인해서 안내하고, 동시에 가입하는 경우는 유니크 인덱스가 막는다
    if (await this.findUser({ email: e })) throw new RepoError('이미 가입된 이메일이에요', 'invalid');
    if (await this.findUser({ nickKey: nickKey(n) })) throw new RepoError('이미 쓰는 닉네임이에요', 'invalid');
    const row: UserRow = { id: uid(12), email: e, nick: n, nickKey: nickKey(n), secret: await makeSecret(password), verifiedAt: 0, notify: true, fails: { count: 0, until: 0 }, lastMailAt: 0, createdAt: Date.now() };
    try {
      await this.insertUser(row);
    } catch (err) {
      if (err instanceof DupError) throw new RepoError(err.field === 'email' ? '이미 가입된 이메일이에요' : '이미 쓰는 닉네임이에요', 'invalid');
      throw err;
    }
    return publicUser(row);
  }

  async login(email: string, password: string): Promise<User> {
    const u = await this.findUser({ email: normEmail(email) });
    // 가입 여부를 알려 주지 않도록 같은 문장
    const no = new RepoError('이메일 또는 비밀번호가 맞지 않아요', 'forbidden');
    if (!u) {
      await makeSecret(password); // 응답 시간으로 가입 여부를 짐작하지 못하게
      throw no;
    }
    if (u.fails.until > Date.now()) throw new RepoError(`여러 번 틀렸어요. ${Math.ceil((u.fails.until - Date.now()) / 1000)}초 뒤에 다시 해 주세요`, 'locked');
    if (!(await checkSecret(password, u.secret))) {
      const count = u.fails.count + 1;
      await this.updateUser(u.id, { fails: { count, until: count >= 10 ? Date.now() + 60_000 * 2 ** Math.min(8, count - 10) : 0 } });
      throw no;
    }
    if (u.fails.count) await this.updateUser(u.id, { fails: { count: 0, until: 0 } });
    return publicUser(u);
  }

  async createSession(userId: string) {
    const t = uid(32);
    await this.insertSession(sha256(t), userId, Date.now() + SESSION_DAYS * DAY);
    return t;
  }

  async bySession(token: string | null | undefined): Promise<User | null> {
    if (!token) return null;
    const id = await this.findSession(sha256(token));
    const u = id ? await this.findUser({ id }) : null;
    return u ? publicUser(u) : null;
  }

  logout(token: string) {
    return this.removeSessions({ hash: sha256(token) });
  }

  async get(id: string) {
    const u = await this.findUser({ id });
    return u ? publicUser(u) : null;
  }

  /** 알림 메일을 보내도 되는 사람 (인증됨 · 알림 켬 · 5분에 한 통) */
  async mailable(id: string) {
    const u = await this.findUser({ id });
    if (!u || !u.verifiedAt || !u.notify || Date.now() - u.lastMailAt < 5 * 60_000) return null;
    await this.updateUser(id, { lastMailAt: Date.now() });
    return publicUser(u);
  }

  async issueToken(userId: string, kind: 'verify' | 'reset') {
    const t = uid(32);
    await this.insertToken(sha256(t), userId, kind, Date.now() + (kind === 'verify' ? 3 * DAY : 3_600_000));
    return t;
  }

  async verify(token: string) {
    const id = await this.takeToken(sha256(token), 'verify');
    if (!id) throw new RepoError('인증 링크가 만료됐거나 이미 쓴 링크예요', 'invalid');
    await this.updateUser(id, { verifiedAt: Date.now() });
    return id;
  }

  async byEmail(email: string) {
    const u = await this.findUser({ email: normEmail(email) });
    return u ? publicUser(u) : null;
  }

  /** 재설정 링크로 비밀번호 바꾸기: 메일을 받았으니 인증도 된 것으로 본다. 다른 기기 로그인은 모두 풀린다 */
  async resetPassword(token: string, password: string) {
    const bad = passwordError(password);
    if (bad) throw new RepoError(bad, 'invalid');
    const id = await this.takeToken(sha256(token), 'reset');
    if (!id) throw new RepoError('재설정 링크가 만료됐거나 이미 쓴 링크예요', 'invalid');
    const u = await this.findUser({ id });
    await this.updateUser(id, { secret: await makeSecret(password), fails: { count: 0, until: 0 }, verifiedAt: u?.verifiedAt || Date.now() });
    await this.removeSessions({ userId: id });
    return id;
  }

  async changePassword(id: string, current: string, next: string) {
    const u = await this.findUser({ id });
    if (!u) throw new RepoError('계정을 찾을 수 없어요', 'not_found');
    if (!(await checkSecret(current, u.secret))) throw new RepoError('지금 비밀번호가 맞지 않아요', 'forbidden');
    const bad = passwordError(next);
    if (bad) throw new RepoError(bad, 'invalid');
    await this.updateUser(id, { secret: await makeSecret(next) });
    await this.removeSessions({ userId: id });
  }

  async setNotify(id: string, on: boolean) {
    await this.updateUser(id, { notify: !!on });
  }

  async remove(id: string) {
    await this.removeUser(id);
  }
}

/* ---------- 개발·테스트: JSON 파일 ---------- */

interface FileDb {
  users: Record<string, UserRow>;
  sessions: Record<string, { userId: string; expires: number }>;
  tokens: Record<string, { userId: string; kind: 'verify' | 'reset'; expires: number; used: boolean }>;
  plans: { userId: string; planId: string; role: Role; at: number }[];
}

export class FileUserStore extends BaseUserStore {
  private file: string;
  private db: FileDb | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(dir = path.join(process.cwd(), '.data')) {
    super();
    this.file = path.join(dir, 'users.json');
  }

  private async load() {
    if (this.db) return this.db;
    try {
      this.db = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      this.db = { users: {}, sessions: {}, tokens: {}, plans: [] };
    }
    return this.db!;
  }
  private async save() {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file + '.tmp', JSON.stringify(this.db));
    await rename(this.file + '.tmp', this.file);
  }
  private tx<T>(fn: (db: FileDb) => T | Promise<T>, write = true): Promise<T> {
    const run = this.chain.then(async () => {
      const db = await this.load();
      const out = await fn(db);
      if (write) await this.save();
      return out;
    });
    this.chain = run.catch(() => {});
    return run;
  }

  protected insertUser(u: UserRow) {
    return this.tx((db) => {
      const all = Object.values(db.users);
      if (all.some((x) => x.email === u.email)) throw new DupError('email');
      if (all.some((x) => x.nickKey === u.nickKey)) throw new DupError('nick');
      db.users[u.id] = u;
    });
  }
  protected findUser(by: { id?: string; email?: string; nickKey?: string }) {
    return this.tx((db) => {
      const u = by.id ? db.users[by.id] : Object.values(db.users).find((x) => (by.email ? x.email === by.email : x.nickKey === by.nickKey));
      return u ? (structuredClone(u) as UserRow) : null;
    }, false);
  }
  protected updateUser(id: string, patch: Partial<UserRow>) {
    return this.tx((db) => {
      if (db.users[id]) db.users[id] = { ...db.users[id], ...patch };
    });
  }
  protected removeUser(id: string) {
    return this.tx((db) => {
      delete db.users[id];
      for (const [k, s] of Object.entries(db.sessions)) if (s.userId === id) delete db.sessions[k];
      for (const [k, s] of Object.entries(db.tokens)) if (s.userId === id) delete db.tokens[k];
      db.plans = db.plans.filter((p) => p.userId !== id);
    });
  }
  protected insertSession(hash: string, userId: string, expires: number) {
    return this.tx((db) => {
      db.sessions[hash] = { userId, expires };
    });
  }
  protected findSession(hash: string) {
    return this.tx((db) => {
      const s = db.sessions[hash];
      return s && s.expires > Date.now() ? s.userId : null;
    }, false);
  }
  protected removeSessions(by: { hash?: string; userId?: string }) {
    return this.tx((db) => {
      for (const [k, s] of Object.entries(db.sessions)) if (k === by.hash || s.userId === by.userId) delete db.sessions[k];
    });
  }
  protected insertToken(hash: string, userId: string, kind: 'verify' | 'reset', expires: number) {
    return this.tx((db) => {
      db.tokens[hash] = { userId, kind, expires, used: false };
    });
  }
  protected takeToken(hash: string, kind: 'verify' | 'reset') {
    return this.tx((db) => {
      const t = db.tokens[hash];
      if (!t || t.used || t.kind !== kind || t.expires < Date.now()) return null;
      t.used = true;
      return t.userId;
    });
  }
  link(userId: string, planId: string, role: Role) {
    return this.tx((db) => {
      const cur = db.plans.find((p) => p.userId === userId && p.planId === planId);
      if (!cur) db.plans.push({ userId, planId, role, at: Date.now() });
      else if (role === 'owner') cur.role = 'owner'; // 기장이 된 건 내려가지 않는다
    });
  }
  unlink(userId: string, planId: string) {
    return this.tx((db) => {
      db.plans = db.plans.filter((p) => !(p.userId === userId && p.planId === planId && p.role === 'member'));
    });
  }
  links(userId: string) {
    return this.tx((db) => db.plans.filter((p) => p.userId === userId).sort((a, b) => b.at - a.at).map(({ planId, role }) => ({ planId, role })), false);
  }
  owners(planId: string) {
    return this.tx((db) => db.plans.filter((p) => p.planId === planId && p.role === 'owner').map((p) => p.userId), false);
  }
  renamePlan(oldId: string, newId: string) {
    return this.tx((db) => {
      for (const p of db.plans) if (p.planId === oldId) p.planId = newId;
    });
  }
  forgetPlan(planId: string) {
    return this.tx((db) => {
      db.plans = db.plans.filter((p) => p.planId !== planId);
    });
  }
}
