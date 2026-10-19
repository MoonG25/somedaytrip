// 제안 한 건 (PR 화면). 주인은 수락·거절, 제안한 사람은 철회할 수 있다.
import { store, StoreError } from '../lib/store';
import { clearOwnerToken, me, ownerToken, viewAsGuest } from '../lib/identity';
import { findConflicts } from '../lib/proposals';
import { ago, esc } from '../lib/util';
import { opCard } from '../ui/opcards';
import { loginModal } from '../ui/plan-modals';
import { busy, confirmBox, toast } from '../ui/ui';
import { notFoundHere, STATUS } from './plan';

export default async function proposalPage(root: HTMLElement, { id, no }: Record<string, string>) {
  const paint = async () => {
    const b = await store.get(id);
    if (!b) return notFoundHere(root);
    const pr = b.proposals.find((p) => p.no === Number(no));
    if (!pr) {
      root.innerHTML = `<section class="empty-page"><div class="big-emoji">📭</div><h1>제안을 찾을 수 없어요</h1><a class="btn primary" href="/p/${id}?tab=proposals">제안 목록으로</a></section>`;
      return;
    }
    let token = ownerToken(id);
    if (token && !(await store.checkToken(id, token))) {
      clearOwnerToken(id);
      token = null;
    }
    const owner = !!token && !viewAsGuest(id);
    const mine = me()?.id === pr.authorId;
    const open = pr.status === 'open';
    const conflicts = open ? findConflicts(b.items, pr.ops) : [];
    const moved = b.plan.version - pr.baseVersion;
    const skipped = new Set(pr.skipped ?? []);

    root.innerHTML = `
      <nav class="crumbs"><a href="/p/${id}">${esc(b.plan.emoji)} ${esc(b.plan.title)}</a><span>›</span><a href="/p/${id}?tab=proposals">제안</a><span>›</span><span>#${pr.no}</span></nav>
      <section class="pr-head">
        <span class="pill lg ${STATUS[pr.status].cls}">${STATUS[pr.status].label}</span>
        <h1>${esc(pr.title)} <span class="muted">#${pr.no}</span></h1>
        <p class="muted"><b>${esc(pr.authorName)}</b>님이 ${ago(pr.createdAt)} 변경 ${pr.ops.length}개를 제안했어요${pr.decidedAt ? ` · ${ago(pr.decidedAt)} 처리됨` : ''}</p>
      </section>
      <div class="pr-layout">
        <div class="pr-body">
          ${pr.message ? `<blockquote class="pr-msg"><b>${esc(pr.authorName)}</b><p>${esc(pr.message)}</p></blockquote>` : ''}
          ${open && moved > 0 ? `<div class="callout ${conflicts.length ? 'warn' : ''}">제안을 만든 뒤 계획이 <b>${moved}번</b> 바뀌었어요. ${conflicts.length ? `그중 <b>${conflicts.length}개</b>가 이 제안과 겹쳐요.` : '겹치는 부분은 없어서 그대로 반영할 수 있어요.'}</div>` : ''}
          <div class="opcards">${pr.ops.map((op, i) => opCard(op, i, b.plan, b.items, conflicts.find((c) => c.op === i), skipped.has(i))).join('')}</div>
          ${pr.note ? `<blockquote class="pr-msg owner"><b>👑 ${esc(b.plan.ownerName)}</b><p>${esc(pr.note)}</p></blockquote>` : ''}
        </div>
        <aside class="pr-side">
          ${
            open && owner
              ? `<div class="decide">
                  <h3>검토하기</h3>
                  <textarea class="input" name="note" rows="3" maxlength="300" placeholder="한마디 남기기 (선택) — 거절할 땐 이유를 적어 주면 좋아요"></textarea>
                  ${
                    conflicts.length
                      ? conflicts.length < pr.ops.length
                        ? `<button class="btn primary block" data-act="accept-partial">겹치지 않는 ${pr.ops.length - conflicts.length}개만 수락</button>
                           <p class="hint">겹치는 변경은 지금 계획을 그대로 둬요.</p>`
                        : `<p class="hint">모든 변경이 지금 계획과 겹쳐서 수락할 수 없어요. 거절하고 다시 제안해 달라고 하세요.</p>`
                      : `<button class="btn primary block" data-act="accept">✅ 수락하고 반영</button>`
                  }
                  <button class="btn ghost block" data-act="reject">🙅 거절</button>
                </div>`
              : open && !owner
                ? `<div class="decide">
                    <p class="muted">주인(<b>${esc(b.plan.ownerName)}</b>)이 검토하면 결과가 여기에 보여요.</p>
                    ${mine ? `<button class="btn ghost block" data-act="withdraw">↩️ 제안 철회</button>` : ''}
                    <button class="link-btn" data-act="login">주인이신가요? 인증하고 검토 →</button>
                  </div>`
                : `<div class="decide"><p class="muted">${STATUS[pr.status].label} 제안이에요.</p></div>`
          }
          <a class="btn ghost block" href="/p/${id}">계획으로 돌아가기</a>
        </aside>
      </div>`;

    const note = () => root.querySelector<HTMLTextAreaElement>('[name=note]')?.value ?? '';
    root.onclick = async (e) => {
      const a = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]');
      if (!a) return;
      try {
        switch (a.dataset.act) {
          case 'accept':
            await busy(a, () => store.decide(id, token!, pr.no, 'accept', note()));
            toast('수락했어요. 계획에 반영됐어요 ✅', 'ok');
            break;
          case 'accept-partial':
            if (!(await confirmBox('일부만 수락', `겹치는 변경 ${conflicts.length}개는 빼고 나머지만 반영할까요?`, '수락'))) return;
            await busy(a, () => store.decide(id, token!, pr.no, 'accept', note(), true));
            toast('겹치지 않는 변경만 반영했어요', 'ok');
            break;
          case 'reject':
            if (!(await confirmBox('제안 거절', `${esc(pr.authorName)}님의 제안을 거절할까요?`, '거절', true))) return;
            await busy(a, () => store.decide(id, token!, pr.no, 'reject', note()));
            toast('거절했어요');
            break;
          case 'withdraw':
            if (!(await confirmBox('제안 철회', '이 제안을 거둘까요?', '철회'))) return;
            await busy(a, () => store.withdraw(id, pr.no, me()!.id));
            toast('철회했어요');
            break;
          case 'login':
            if (await loginModal(b.plan)) paint();
            return;
        }
      } catch (err) {
        toast(err instanceof StoreError ? err.message : '처리하지 못했어요', 'err');
        paint();
      }
    };
  };

  await paint();
  return store.subscribe(id, paint);
}
