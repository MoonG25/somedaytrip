// 알림 메일: 기장에게 "새 제안", 제안한 승객(계정)에게 "반영됐어요". 응답을 기다리지 않게 after()로 부른다.
// 인증된 계정 · 알림 켬 · 한 사람에게 5분에 한 통까지 (users.mailable)
import 'server-only';
import { repo, users } from './index';
import { link, sendMail } from './mail';

export async function notifyProposal(planId: string, no: number, authorName: string, summary: string) {
  const [b, owners] = await Promise.all([repo().get(planId), users().owners(planId)]);
  if (!b) return;
  for (const id of owners) {
    const u = await users().mailable(id);
    if (!u) continue;
    await sendMail(u.email, `'${b.plan.title}'에 새 제안이 왔어요`, [`${authorName}님이 제안을 보냈어요.`, summary, '일정 위에서 바로 반영하거나 거절할 수 있어요.'], {
      label: '제안 보러 가기',
      url: link(`/p/${planId}/${b.plan.slug}#suggestions`),
    });
  }
}

export async function notifyDecided(planId: string, authorIds: string[], accepted: number, rejected: number) {
  const ids = [...new Set(authorIds.filter((a) => a.startsWith('u:')).map((a) => a.slice(2)))];
  if (!ids.length) return;
  const b = await repo().get(planId);
  if (!b) return;
  const what = [accepted ? `${accepted}개 반영` : '', rejected ? `${rejected}개 거절` : ''].filter(Boolean).join(' · ');
  for (const id of ids) {
    const u = await users().mailable(id);
    if (!u) continue;
    await sendMail(u.email, `'${b.plan.title}' 제안이 처리됐어요`, [`${b.plan.ownerName} 기장이 제안을 확인했어요 (${what}).`], {
      label: '계획 보러 가기',
      url: link(`/p/${planId}/${b.plan.slug}#itinerary`),
    });
  }
}
