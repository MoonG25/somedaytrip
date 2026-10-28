'use server';
// 서버 액션: 화면에서 부르는 모든 쓰기. 기장 확인과 비밀번호 검사는 여기(서버)에서만 한다.
import { revalidatePath } from 'next/cache';
import type { Bundle, Item, Op, PlanInfo } from '@/lib/types';
import { cleanItem } from '@/lib/clean';
import { repo, users, RepoError, isRepoError } from '@/server';
import { authorIds, clearOwnerToken, currentUser, ownerToken, savedMine, setOwnerToken, setSavedMine, visitorId } from '@/server/auth';
import { uid } from '@/server/secret';
import { headers } from 'next/headers';
import { after } from 'next/server';
import { allow } from '@/server/limit';
import { notifyDecided, notifyProposal } from '@/server/notify';
import { describeOps } from '@/lib/proposals';
import type { ChecklistOp } from '@/server/repo';

export type Result<T = null> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (isRepoError(e)) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    return { ok: false, error: '처리하지 못했어요. 잠시 뒤 다시 해 주세요' };
  }
}

const touch = (id: string) => {
  revalidatePath(`/p/${id}`, 'layout');
  revalidatePath('/');
  revalidatePath('/sitemap.xml');
};

/** 계정이 이 계획의 기장인지 */
async function accountOwner(id: string) {
  const u = await currentUser();
  return u && (await users().owners(id)).includes(u.id) ? u : null;
}

/** 기장 토큰. 쿠키가 없거나 풀렸어도 로그인한 계정이 기장이면 새로 받아 쿠키에 둔다 */
async function token(id: string) {
  const t = await ownerToken(id);
  if (t && (await repo().checkToken(id, t))) return t;
  if (await accountOwner(id)) {
    const fresh = await repo().grant(id);
    await setOwnerToken(id, fresh, true);
    return fresh;
  }
  if (!t) throw new RepoError('기장 인증이 필요해요', 'forbidden');
  return t;
}

export async function createPlan(input: { info: PlanInfo; items: Item[]; password: string; remember: boolean; copyFrom?: string }) {
  return run(async () => {
    let items = input.items;
    if (input.copyFrom) {
      // 복사: 원본의 일정을 새 id로 가져온다 (원본은 공개 계획이어야 한다)
      const src = await repo().get(input.copyFrom);
      if (!src || src.plan.visibility !== 'public') throw new RepoError('복사할 수 없는 계획이에요', 'forbidden');
      items = src.items.map((i) => ({ ...i, id: uid(8) }));
    }
    // 로그인했으면 계획 비밀번호 없이 계정이 기장이 된다 (안에서는 아무도 모르는 비밀번호를 둔다)
    const user = await currentUser();
    const password = user && !input.password ? uid(24) : String(input.password ?? '');
    const info = user ? { ...input.info, ownerName: input.info.ownerName || user.nick } : input.info;
    const { bundle, token: t } = await repo().create(info, items.map(cleanItem), password, input.copyFrom ? { copiedFrom: input.copyFrom } : {});
    await setOwnerToken(bundle.plan.id, t, user ? true : !!input.remember);
    if (user) await users().link(user.id, bundle.plan.id, 'owner');
    touch(bundle.plan.id);
    return { id: bundle.plan.id, slug: bundle.plan.slug };
  });
}

export async function login(id: string, password: string, remember: boolean) {
  return run(async () => {
    // 같은 곳(IP)에서 10분에 8번까지. 누가 일부러 틀려도 기장의 다른 기기는 막히지 않게 IP 단위로 센다
    const ip = ((await headers()).get('x-forwarded-for') || 'local').split(',')[0].trim();
    if (!allow(`login:${ip}:${id}`, 8, 600_000)) throw new RepoError('비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요', 'locked');
    const t = await repo().login(id, String(password ?? ''));
    await setOwnerToken(id, t, !!remember);
    // 로그인한 상태로 비밀번호를 맞히면 이 계획을 내 계정에 연결한다 (다음부터는 비밀번호 없이)
    const u = await currentUser();
    if (u) await users().link(u.id, id, 'owner');
    return { linked: !!u };
  });
}

export async function logout(id: string) {
  return run(async () => {
    const t = await ownerToken(id);
    if (t) await repo().logout(id, t);
    await clearOwnerToken(id);
    return null;
  });
}

export async function changePassword(id: string, current: string, next: string) {
  return run(async () => {
    // 계정 기장은 지금 비밀번호 없이 정할 수 있다 (계정으로 만든 계획은 비밀번호를 아무도 모른다)
    if (!current && (await accountOwner(id))) await repo().setPassword(id, await token(id), String(next ?? ''));
    else await repo().changePassword(id, await token(id), String(current ?? ''), String(next ?? ''));
    return null;
  });
}

/** 탑승권을 내 지갑(계정)에 저장. 지금 기장이면 기장으로, 아니면 탑승한 계획으로 */
export async function saveTicket(id: string) {
  return run(async () => {
    const u = await currentUser();
    if (!u) throw new RepoError('로그인이 필요해요', 'forbidden');
    if (!(await repo().get(id))) throw new RepoError('계획을 찾을 수 없어요', 'not_found');
    const owner = await repo().checkToken(id, await ownerToken(id));
    await users().link(u.id, id, owner ? 'owner' : 'member');
    return { role: owner ? 'owner' : 'member' };
  });
}

/** 지갑에서 빼기 (기장인 계획은 뺄 수 없다). 이 브라우저의 쿠키 백업에서도 지운다 */
export async function unsaveTicket(id: string) {
  return run(async () => {
    const u = await currentUser();
    if (!u) throw new RepoError('로그인이 필요해요', 'forbidden');
    if ((await users().owners(id)).includes(u.id)) throw new RepoError('기장인 계획은 지갑에서 뺄 수 없어요', 'invalid');
    await users().unlink(u.id, id);
    await setSavedMine((await savedMine()).filter((x) => x !== id));
    return null;
  });
}

/** 지금 기장인 계획을 내 계정에 연결 (기존 계획 가져오기) */
export async function claimPlan(id: string) {
  return run(async () => {
    const u = await currentUser();
    if (!u) throw new RepoError('로그인이 필요해요', 'forbidden');
    const t = await ownerToken(id);
    if (!(await repo().checkToken(id, t))) throw new RepoError('기장 인증이 필요해요', 'forbidden');
    await users().link(u.id, id, 'owner');
    return null;
  });
}

export async function updatePlan(id: string, info: PlanInfo) {
  return run(async () => {
    const plan = await repo().updateInfo(id, await token(id), info);
    touch(id);
    return { slug: plan.slug };
  });
}

/** 체크리스트는 모두의 것 (링크를 가진 누구나). 장난·도배를 막으려고 IP당 1분에 60번까지 */
async function checklistLimit(id: string) {
  const ip = ((await headers()).get('x-forwarded-for') || 'local').split(',')[0].trim();
  if (!allow(`ck:${ip}:${id}`, 60, 60_000)) throw new RepoError('너무 빠르게 고치고 있어요. 잠시 뒤에 다시 해 주세요', 'limited');
}

export async function setCheck(id: string, index: number, done: boolean, text?: string) {
  return run(async () => {
    await checklistLimit(id);
    await repo().setCheck(id, Number(index), !!done, text == null ? undefined : String(text));
    touch(id);
    return null;
  });
}

/** 준비물 더하기·지우기·고치기 (누구나) */
export async function editChecklist(id: string, op: ChecklistOp) {
  return run(async () => {
    await checklistLimit(id);
    await repo().editChecklist(id, op);
    touch(id);
    return null;
  });
}

export async function applyDirect(id: string, ops: Op[]) {
  return run(async () => {
    await repo().applyDirect(id, await token(id), ops);
    touch(id);
    return null;
  });
}

export async function propose(id: string, p: { authorName: string; title: string; message: string; baseVersion: number; ops: Op[] }) {
  return run(async () => {
    // 로그인했으면 계정으로 (기기가 달라도 같은 사람), 아니면 이 브라우저로
    const u = await currentUser();
    const me = u ? `u:${u.id}` : (await visitorId(true))!;
    const pr = await repo().propose(id, { ...p, authorId: me, authorName: u ? u.nick : p.authorName });
    if (u) await users().link(u.id, id, 'member');
    touch(id);
    const summary = describeOps(pr.ops, []);
    after(() => notifyProposal(id, pr.no, pr.authorName, summary).catch((e) => console.error('[notify]', e)));
    return { no: pr.no };
  });
}

export async function decide(id: string, no: number, decision: 'accept' | 'reject', note: string, skipConflicts = false) {
  return run(async () => {
    const pr = await repo().decide(id, await token(id), Number(no), decision === 'accept' ? 'accept' : 'reject', String(note ?? ''), !!skipConflicts);
    touch(id);
    const acc = pr.ops.filter((o) => o.state === 'accepted' || o.state === 'superseded').length;
    after(() => notifyDecided(id, [pr.authorId], acc, pr.ops.length - acc).catch((e) => console.error('[notify]', e)));
    return { status: pr.status };
  });
}

export async function rejectAll(id: string, note: string) {
  return run(async () => {
    const n = await repo().rejectAllOpen(id, await token(id), String(note ?? ''));
    touch(id);
    return { n };
  });
}

export async function withdraw(id: string, no: number) {
  return run(async () => {
    const ids = await authorIds();
    if (!ids.length) throw new RepoError('제안한 사람만 철회할 수 있어요', 'forbidden');
    await repo().withdraw(id, Number(no), ids);
    touch(id);
    return null;
  });
}

/** 일정 위에서 변경 하나씩 반영·거절 (기장) */
export async function decideOps(id: string, list: { no: number; index: number; decision: 'accept' | 'reject' | 'supersede' }[], force = false) {
  return run(async () => {
    const clean = (Array.isArray(list) ? list : []).slice(0, 100).map((d) => ({
      no: Number(d.no),
      index: Number(d.index),
      decision: d.decision === 'accept' ? ('accept' as const) : d.decision === 'supersede' ? ('supersede' as const) : ('reject' as const),
    }));
    const r = await repo().decideOps(id, await token(id), clean, !!force);
    touch(id);
    // 제안한 사람(계정)에게 알림: 결정한 변경의 제안 작성자들
    const b = await repo().get(id);
    const authors = clean.filter((d) => d.decision !== 'supersede').map((d) => b?.proposals.find((x) => x.no === d.no)?.authorId).filter(Boolean) as string[];
    after(() => notifyDecided(id, authors, r.accepted, r.rejected).catch((e) => console.error('[notify]', e)));
    return r;
  });
}

/** 내가 낸 변경 하나 철회 (승객) */
export async function withdrawOp(id: string, no: number, index: number) {
  return run(async () => {
    const ids = await authorIds();
    if (!ids.length) throw new RepoError('제안한 사람만 철회할 수 있어요', 'forbidden');
    await repo().withdrawOp(id, Number(no), Number(index), ids);
    touch(id);
    return null;
  });
}

export async function deletePlan(id: string) {
  return run(async () => {
    await repo().remove(id, await token(id));
    await users().forgetPlan(id);
    await clearOwnerToken(id);
    touch(id);
    return null;
  });
}

/** 링크 새로 만들기: 새 id로 옮기고, 기장 쿠키도 새 id로 옮긴다 */
export async function rekeyPlan(id: string) {
  return run(async () => {
    const t = await token(id);
    const next = await repo().rekey(id, t);
    await users().renamePlan(id, next);
    await setOwnerToken(next, t, true);
    await clearOwnerToken(id);
    touch(id);
    touch(next);
    const b = await repo().get(next);
    return { id: next, slug: b?.plan.slug ?? '' };
  });
}

/** "내 계획": 이 브라우저가 기억하는 계획 id들 → 계획 묶음 (일정 수만 필요해서 가볍게) */
