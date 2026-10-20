// 로그인·가입하는 순간 이 브라우저의 "내 계획"(쿠키 백업 · 기장 쿠키)을 계정 지갑으로 합친다
import 'server-only';
import { repo, users } from './index';
import { ownerToken, savedMine } from './auth';

export async function mergeBrowserPlans(userId: string) {
  const ids = (await savedMine()).slice(0, 100);
  if (!ids.length) return 0;
  const found = new Set((await repo().getMany(ids)).map((b) => b.plan.id));
  let n = 0;
  for (const id of ids) {
    if (!found.has(id)) continue;
    const owner = await repo().checkToken(id, await ownerToken(id));
    await users().link(userId, id, owner ? 'owner' : 'member');
    n++;
  }
  return n;
}
