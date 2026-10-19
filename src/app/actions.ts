'use server';
// 서버 액션: 화면에서 부르는 모든 쓰기. 주인 확인과 비밀번호 검사는 여기(서버)에서만 한다.
import { revalidatePath } from 'next/cache';
import type { Bundle, Item, Op, PlanInfo } from '@/lib/types';
import { cleanItem } from '@/lib/clean';
import { repo, RepoError, isRepoError } from '@/server';
import { clearOwnerToken, ownerToken, setOwnerToken, visitorId } from '@/server/auth';
import { uid } from '@/server/secret';
import { headers } from 'next/headers';
import { allow } from '@/server/limit';

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

async function token(id: string) {
  const t = await ownerToken(id);
  if (!t) throw new RepoError('주인 인증이 필요해요', 'forbidden');
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
    const { bundle, token: t } = await repo().create(input.info, items.map(cleanItem), String(input.password ?? ''), input.copyFrom ? { copiedFrom: input.copyFrom } : {});
    await setOwnerToken(bundle.plan.id, t, !!input.remember);
    touch(bundle.plan.id);
    return { id: bundle.plan.id, slug: bundle.plan.slug };
  });
}

export async function login(id: string, password: string, remember: boolean) {
  return run(async () => {
    // 같은 곳(IP)에서 10분에 8번까지. 누가 일부러 틀려도 주인의 다른 기기는 막히지 않게 IP 단위로 센다
    const ip = ((await headers()).get('x-forwarded-for') || 'local').split(',')[0].trim();
    if (!allow(`login:${ip}:${id}`, 8, 600_000)) throw new RepoError('비밀번호를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요', 'locked');
    const t = await repo().login(id, String(password ?? ''));
    await setOwnerToken(id, t, !!remember);
    return null;
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
  return run(async () => repo().changePassword(id, await token(id), String(current ?? ''), String(next ?? '')).then(() => null));
}

export async function updatePlan(id: string, info: PlanInfo) {
  return run(async () => {
    const plan = await repo().updateInfo(id, await token(id), info);
    touch(id);
    return { slug: plan.slug };
  });
}

export async function setCheck(id: string, index: number, done: boolean) {
  return run(async () => {
    await repo().setCheck(id, await token(id), Number(index), !!done);
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
    const me = (await visitorId(true))!;
    const pr = await repo().propose(id, { ...p, authorId: me });
    touch(id);
    return { no: pr.no };
  });
}

export async function decide(id: string, no: number, decision: 'accept' | 'reject', note: string, skipConflicts = false) {
  return run(async () => {
    const pr = await repo().decide(id, await token(id), Number(no), decision === 'accept' ? 'accept' : 'reject', String(note ?? ''), !!skipConflicts);
    touch(id);
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
    const me = await visitorId();
    if (!me) throw new RepoError('제안한 사람만 철회할 수 있어요', 'forbidden');
    await repo().withdraw(id, Number(no), me);
    touch(id);
    return null;
  });
}

export async function deletePlan(id: string) {
  return run(async () => {
    await repo().remove(id, await token(id));
    await clearOwnerToken(id);
    touch(id);
    return null;
  });
}

/** 링크 새로 만들기: 새 id로 옮기고, 주인 쿠키도 새 id로 옮긴다 */
export async function rekeyPlan(id: string) {
  return run(async () => {
    const t = await token(id);
    const next = await repo().rekey(id, t);
    await setOwnerToken(next, t, true);
    await clearOwnerToken(id);
    touch(id);
    touch(next);
    const b = await repo().get(next);
    return { id: next, slug: b?.plan.slug ?? '' };
  });
}

/** "내 계획": 이 브라우저가 기억하는 계획 id들 → 계획 묶음 (일정 수만 필요해서 가볍게) */
export async function myPlans(ids: string[]): Promise<{ bundle: Pick<Bundle, 'plan' | 'items'>; owner: boolean; open: number }[]> {
  const list = await repo().getMany((Array.isArray(ids) ? ids : []).slice(0, 100).map(String));
  return Promise.all(
    list.map(async (b) => ({
      bundle: { plan: b.plan, items: b.items },
      owner: await repo().checkToken(b.plan.id, await ownerToken(b.plan.id)),
      open: b.proposals.filter((p) => p.status === 'open').length,
    }))
  );
}
