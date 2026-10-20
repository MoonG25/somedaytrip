// 계정 저장: Supabase Postgres (0003_accounts.sql). 계획 저장소와 같은 DATABASE_URL을 쓴다.
import 'server-only';
import postgres from 'postgres';
import { BaseUserStore, DupError, type Role, type UserRow } from './users';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ms = (v: unknown) => (v ? new Date(v as string).getTime() : 0);
const at = (n: number) => (n ? new Date(n) : null);

const toRow = (u: R): UserRow => ({
  id: u.id,
  email: u.email,
  nick: u.nick,
  nickKey: u.nick_key,
  secret: { salt: u.salt, hash: u.hash, iter: u.iter },
  verifiedAt: ms(u.verified_at),
  notify: u.notify,
  fails: { count: u.fail_count, until: ms(u.fail_until) },
  lastMailAt: ms(u.last_mail_at),
  createdAt: ms(u.created_at),
});

export class PgUserStore extends BaseUserStore {
  private sql: postgres.Sql;
  constructor(url: string) {
    super();
    this.sql = postgres(url, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10, ssl: 'require' });
  }

  protected async insertUser(u: UserRow) {
    try {
      await this.sql`insert into users (id, email, nick, nick_key, salt, hash, iter, notify, created_at)
        values (${u.id}, ${u.email}, ${u.nick}, ${u.nickKey}, ${u.secret.salt}, ${u.secret.hash}, ${u.secret.iter}, ${u.notify}, ${new Date(u.createdAt)})`;
    } catch (e) {
      const c = (e as { constraint_name?: string }).constraint_name;
      if (c === 'users_email_key') throw new DupError('email');
      if (c === 'users_nick_key') throw new DupError('nick');
      throw e;
    }
  }
  protected async findUser(by: { id?: string; email?: string; nickKey?: string }) {
    const [u] = by.id
      ? await this.sql`select * from users where id = ${by.id}`
      : by.email
        ? await this.sql`select * from users where email = ${by.email}`
        : await this.sql`select * from users where nick_key = ${by.nickKey ?? ''}`;
    return u ? toRow(u) : null;
  }
  protected async updateUser(id: string, p: Partial<UserRow>) {
    const set: R = {};
    if (p.secret) Object.assign(set, { salt: p.secret.salt, hash: p.secret.hash, iter: p.secret.iter });
    if (p.verifiedAt !== undefined) set.verified_at = at(p.verifiedAt);
    if (p.notify !== undefined) set.notify = p.notify;
    if (p.fails) Object.assign(set, { fail_count: p.fails.count, fail_until: at(p.fails.until) });
    if (p.lastMailAt !== undefined) set.last_mail_at = at(p.lastMailAt);
    if (!Object.keys(set).length) return;
    await this.sql`update users set ${this.sql(set)} where id = ${id}`;
  }
  protected async removeUser(id: string) {
    await this.sql`delete from users where id = ${id}`; // 세션·토큰·내 계획 연결은 CASCADE
  }
  protected async insertSession(hash: string, userId: string, expires: number) {
    await this.sql`insert into user_sessions (token_hash, user_id, expires_at) values (${hash}, ${userId}, ${new Date(expires)})`;
  }
  protected async findSession(hash: string) {
    const [s] = await this.sql`select user_id from user_sessions where token_hash = ${hash} and expires_at > now()`;
    return s ? (s.user_id as string) : null;
  }
  protected async removeSessions(by: { hash?: string; userId?: string }) {
    if (by.hash) await this.sql`delete from user_sessions where token_hash = ${by.hash}`;
    if (by.userId) await this.sql`delete from user_sessions where user_id = ${by.userId}`;
  }
  protected async insertToken(hash: string, userId: string, kind: 'verify' | 'reset', expires: number) {
    await this.sql`insert into user_tokens (token_hash, user_id, kind, expires_at) values (${hash}, ${userId}, ${kind}, ${new Date(expires)})`;
  }
  protected async takeToken(hash: string, kind: 'verify' | 'reset') {
    // 한 번만: 쓰지 않은 것만 골라 사용 처리 (동시에 눌러도 하나만 성공)
    const [t] = await this.sql`update user_tokens set used_at = now()
      where token_hash = ${hash} and kind = ${kind} and used_at is null and expires_at > now() returning user_id`;
    return t ? (t.user_id as string) : null;
  }
  async link(userId: string, planId: string, role: Role) {
    await this.sql`insert into user_plans (user_id, plan_id, role) values (${userId}, ${planId}, ${role})
      on conflict (user_id, plan_id) do update set role = case when user_plans.role = 'owner' then 'owner' else excluded.role end`;
  }
  async links(userId: string) {
    const rows = await this.sql`select plan_id, role from user_plans where user_id = ${userId} order by created_at desc limit 200`;
    return rows.map((r) => ({ planId: r.plan_id as string, role: r.role as Role }));
  }
  async owners(planId: string) {
    const rows = await this.sql`select user_id from user_plans where plan_id = ${planId} and role = 'owner'`;
    return rows.map((r) => r.user_id as string);
  }
  async renamePlan() {
    // ON UPDATE CASCADE가 따라간다
  }
  async forgetPlan() {
    // ON DELETE CASCADE가 따라간다
  }
}
