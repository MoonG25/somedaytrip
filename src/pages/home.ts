import type { Bundle, Scope } from '../types';
import { store } from '../lib/store';
import { ownerToken, saveOwnerToken } from '../lib/identity';
import { seedPlan, SEED_PASSWORD } from '../lib/seed';
import { ago, esc, SCOPES, whenLabel } from '../lib/util';
import { stamp } from '../ui/art';
import { busy, toast } from '../ui/ui';
import { navigate } from '../router';

const WORDS = ['망원동 한 바퀴', '제주 3박 4일', '교토 단풍', '한강 피크닉', '부산 바다', '동네 빵지순례', '리스본 노을'];

export default async function home(root: HTMLElement) {
  let filter: Scope | 'all' = 'all';

  root.innerHTML = `
    <section class="hero">
      <p class="hero-kicker">언젠가 갈 여행을, 같이.</p>
      <h1 class="hero-title">
        <span class="serif">Someday,</span>
        <span class="slot" aria-label="${esc(WORDS.join(', '))}"><span class="slot-track">${[...WORDS, WORDS[0]].map((w) => `<span>${esc(w)}</span>`).join('')}</span></span>
      </h1>
      <ol class="hero-steps">
        <li><b>계획 만들기</b><span>동네 산책도, 해외여행도. 날짜가 없어도 괜찮아요</span></li>
        <li><b>링크 공유</b><span>링크를 아는 사람은 누구나 일정을 제안할 수 있어요</span></li>
        <li><b>제안 → 수락</b><span>반영은 비밀번호를 아는 주인이 골라서 해요</span></li>
      </ol>
      <div class="hero-cta">
        <a class="btn primary lg" href="/new">＋ 새 계획 만들기</a>
        <button class="btn ghost lg" data-seed>예시 계획 둘러보기</button>
      </div>
    </section>
    <section class="shelf">
      <div class="shelf-head">
        <h2>내 계획</h2>
        <div class="chips" role="tablist">
          ${(['all', 'local', 'domestic', 'abroad'] as const)
            .map((s) => `<button class="chip" role="tab" data-filter="${s}">${s === 'all' ? '전체' : `${SCOPES[s].icon} ${SCOPES[s].label}`}</button>`)
            .join('')}
        </div>
      </div>
      <div class="cards" data-cards></div>
    </section>`;

  const cardsEl = root.querySelector<HTMLElement>('[data-cards]')!;

  const card = (b: Bundle, i: number) => {
    const { plan } = b;
    const mine = !!ownerToken(plan.id);
    const open = b.proposals.filter((p) => p.status === 'open').length;
    const tilt = ((i * 37) % 5) - 2;
    return `
      <a class="postcard" href="/p/${plan.id}" style="--tilt:${tilt * 0.6}deg;--h:${plan.hue}">
        <div class="pc-stamp">${stamp(plan)}<span class="pc-emoji">${esc(plan.emoji)}</span></div>
        <div class="pc-body">
          <div class="pc-meta">
            <span class="tag">${SCOPES[plan.scope].icon} ${SCOPES[plan.scope].label}</span>
            <span class="tag ${mine ? 'owner' : ''}">${mine ? '👑 주인' : '🙋 참여'}</span>
            ${open ? `<span class="tag hot">제안 ${open}</span>` : ''}
          </div>
          <h3>${esc(plan.title)}</h3>
          <p class="pc-when">${esc(whenLabel(plan.when))}</p>
          <p class="pc-foot">${plan.place ? `📍 ${esc(plan.place.name)} · ` : ''}일정 ${b.items.length}개 · ${ago(plan.updatedAt)} 수정</p>
        </div>
      </a>`;
  };

  const paint = async () => {
    const all = (await store.list()).sort((a, b) => b.plan.updatedAt - a.plan.updatedAt);
    root.querySelectorAll<HTMLElement>('[data-filter]').forEach((c) => c.setAttribute('aria-selected', String(c.dataset.filter === filter)));
    const list = all.filter((b) => filter === 'all' || b.plan.scope === filter);
    if (!all.length) {
      cardsEl.innerHTML = `
        <div class="shelf-empty">
          <p class="serif big">아직 비어 있어요</p>
          <p>가 보고 싶은 곳 하나만 적어 두면 시작이에요. 동네 골목이어도 좋아요.</p>
        </div>`;
      return;
    }
    cardsEl.innerHTML = list.length ? list.map(card).join('') : `<p class="muted pad">이 종류의 계획은 없어요.</p>`;
  };

  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const f = t.closest<HTMLElement>('[data-filter]');
    if (f) {
      filter = f.dataset.filter as typeof filter;
      paint();
    }
    const seed = t.closest<HTMLButtonElement>('[data-seed]');
    if (seed) {
      const { id, token } = await busy(seed, seedPlan);
      saveOwnerToken(id, token, true);
      toast(`예시 계획을 만들었어요. 주인 비밀번호는 '${SEED_PASSWORD}'예요`, 'ok');
      navigate(`/p/${id}`);
    }
  });

  await paint();
  return store.subscribe('*', paint);
}
