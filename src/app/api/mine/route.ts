// 홈의 "내 계획"과 쿠키 백업. 서버 액션에서 쿠키를 쓰면 Next가 화면을 새로 받아 와서
// 홈이 다시 불러오기를 반복한다. 그래서 화면 새로고침이 없는 API로 둔다.
import { NextResponse, type NextRequest } from 'next/server';
import { repo, users } from '@/server';
import { currentUser, ownerToken, savedMine, setSavedMine } from '@/server/auth';
import { allow, clientIp } from '@/server/limit';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(req: NextRequest) {
  // 다른 사이트가 내 목록에 계획을 끼워 넣지 못하게 같은 사이트 요청만
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== req.headers.get('host')) return NextResponse.json({ error: 'origin' }, { status: 403 });
  if (!allow(`mine:${clientIp(req)}`, 60, 60_000)) return NextResponse.json({ error: 'limited' }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; keep?: boolean };
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 100);
  // 로그인했으면 계정의 내 계획도 합친다 (어느 기기든 같은 목록)
  const user = await currentUser();
  const fromAccount = user ? (await users().links(user.id)).map((l) => l.planId) : [];
  const want = [...new Set([...ids, ...(await savedMine()), ...fromAccount])].slice(0, 100);

  // 새로 기억한 계획을 백업에 넣기만
  if (body.keep) {
    await setSavedMine(want);
    if (user) for (const id of ids.slice(0, 20)) await users().link(user.id, id, 'member').catch(() => {}); // 없는 계획 id면 FK가 막는다
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  // 브라우저 목록 + 쿠키 백업을 합쳐 찾은 순서대로. 쿠키도 찾은 목록으로 새로 쓴다 (지운 계획·바뀐 링크는 빠진다)
  if (!want.length) return NextResponse.json({ rows: [] }, { headers: noStore });
  const byId = new Map((await repo().getMany(want)).map((b) => [b.plan.id, b]));
  const list = want.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  await setSavedMine(list.map((b) => b.plan.id));
  // 이 브라우저에만 있던 계획을 계정으로 옮겨 둔다 (로그인 직후 한 번에 합쳐진다)
  if (user) {
    const known = new Set(fromAccount);
    for (const b of list) if (!known.has(b.plan.id)) await users().link(user.id, b.plan.id, 'member').catch(() => {});
  }
  const rows = await Promise.all(
    list.map(async (b) => ({
      bundle: { plan: b.plan, items: b.items },
      owner: await repo().checkToken(b.plan.id, await ownerToken(b.plan.id)),
      open: b.proposals.filter((p) => p.status === 'open').length,
    }))
  );
  return NextResponse.json({ rows }, { headers: noStore });
}
