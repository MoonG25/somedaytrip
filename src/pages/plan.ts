// 계획 화면. 주인은 고치면 바로 반영되고, 손님은 "제안 바구니"에 모았다가 한 번에 제안한다.
import type { HistoryKind, Item, Op, Proposal, ProposalStatus } from '../types';
import { store, StoreError } from '../lib/store';
import { clearOwnerToken, loadDraft, me, ownerToken, saveDraft, setViewAsGuest, viewAsGuest, type Draft } from '../lib/identity';
import { describeOps, diffItem, findConflicts, opCounts, stage, stagedView, type Mark } from '../lib/proposals';
import { ago, dayColor, dayCount, dayLabel, distanceLabel, esc, KINDS, km, SCOPES, whenLabel, won } from '../lib/util';
import { ItemLayer, makeMap } from '../ui/map';
import { stamp } from '../ui/art';
import { opCard } from '../ui/opcards';
import { itemModal, loginModal, metaModal, nameModal, passwordModal, shareModal } from '../ui/plan-modals';
import { busy, confirmBox, modal, toast } from '../ui/ui';
import { navigate } from '../router';

type Tab = 'plan' | 'proposals' | 'history';

export const STATUS: Record<ProposalStatus, { label: string; cls: string }> = {
  open: { label: '검토 대기', cls: 'open' },
  accepted: { label: '수락됨', cls: 'ok' },
  partial: { label: '일부 수락', cls: 'ok' },
  rejected: { label: '거절됨', cls: 'no' },
  withdrawn: { label: '철회됨', cls: 'muted' },
};

const HIST_ICON: Record<HistoryKind, string> = {
  created: '🌱',
  direct: '✏️',
  meta: '🛠️',
  proposed: '📮',
  accepted: '✅',
  partial: '☑️',
  rejected: '🙅',
  withdrawn: '↩️',
};

export function notFoundHere(root: HTMLElement) {
  root.innerHTML = `
    <section class="empty-page">
      <div class="big-emoji">🔍</div>
      <h1>이 브라우저에서는 계획을 찾을 수 없어요</h1>
      <p>지금은 1단계(서버 없음)라 계획이 만든 브라우저 안에만 저장돼요.<br/>2단계에서 서버를 붙이면 링크만으로 어디서든 열려요.</p>
      <a class="btn primary" href="/">내 계획으로</a>
    </section>`;
}

export default async function planPage(root: HTMLElement, { id }: Record<string, string>, query: URLSearchParams) {
  let b = await store.get(id);
  if (!b) return notFoundHere(root);
  store.remember(id);

  let tab: Tab = (['plan', 'proposals', 'history'].includes(query.get('tab') ?? '') ? query.get('tab') : 'plan') as Tab;
  let token = ownerToken(id);
  let owner = false;
  let draft: Draft | null = loadDraft(id);
  let fitted = false;

  const resolveRole = async () => {
    const valid = await store.checkToken(id, token);
    if (!valid && token) {
      // 비밀번호가 바뀌었거나 인증이 풀렸다
      clearOwnerToken(id);
      token = null;
    }
    owner = valid && !viewAsGuest(id);
  };
  await resolveRole();

  root.innerHTML = `
    <section class="plan-hero" data-hero></section>
    <div class="role-bar" data-role></div>
    <nav class="tabs" role="tablist" data-tabs></nav>
    <div class="plan-layout">
      <div class="plan-main" data-main></div>
      <aside class="plan-map"><div class="map" data-map></div><p class="map-empty" data-map-empty hidden>장소를 넣으면 지도에 핀이 꽂혀요</p></aside>
    </div>
    <div class="basket" data-basket hidden></div>`;

  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const map = makeMap($('[data-map]'), b.plan.place, SCOPES[b.plan.scope].zoom);
  const layer = new ItemLayer(map, (itemId) => {
    if (tab !== 'plan') setTab('plan');
    const row = root.querySelector<HTMLElement>(`.item[data-id="${itemId}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row?.classList.add('flash');
    setTimeout(() => row?.classList.remove('flash'), 1200);
  });

  // ---- 화면 그리기 ----
  const rows = () => (owner || !draft ? b!.items.map((item) => ({ item, mark: null as Mark, fields: [] as string[] })) : stagedView(b!.items, draft.ops));

  const paintHero = () => {
    const { plan } = b!;
    const open = b!.proposals.filter((p) => p.status === 'open').length;
    $('[data-hero]').style.setProperty('--h', String(plan.hue));
    $('[data-hero]').innerHTML = `
      <div class="ph-stamp">${stamp(plan)}<span class="pc-emoji">${esc(plan.emoji)}</span></div>
      <div class="ph-text">
        <div class="pc-meta">
          <span class="tag">${SCOPES[plan.scope].icon} ${SCOPES[plan.scope].label}</span>
          <span class="tag">${esc(whenLabel(plan.when))}</span>
          ${plan.place ? `<span class="tag">📍 ${esc(plan.place.name)}</span>` : ''}
          <span class="tag">👑 ${esc(plan.ownerName)}</span>
        </div>
        <h1>${esc(plan.title)}</h1>
        ${plan.memo ? `<p class="ph-memo">${esc(plan.memo)}</p>` : ''}
      </div>
      <div class="ph-actions">
        <button class="btn primary" data-act="share">🔗 공유</button>
        ${
          owner
            ? `<details class="menu">
                <summary class="btn ghost" aria-label="주인 메뉴">⋯</summary>
                <div class="menu-pop">
                  <button data-act="meta">🛠️ 계획 정보 고치기</button>
                  <button data-act="password">🔑 비밀번호 바꾸기</button>
                  <button data-act="guestview">🙋 손님 화면 미리보기</button>
                  <button data-act="logout">🚪 이 브라우저에서 주인 인증 풀기</button>
                  <hr/>
                  <button data-act="delete" class="danger">🗑️ 계획 삭제</button>
                </div>
              </details>`
            : ''
        }
      </div>`;
    $('[data-role]').className = `role-bar ${owner ? 'is-owner' : 'is-guest'}`;
    $('[data-role]').innerHTML = owner
      ? `<span>👑 <b>주인</b>으로 보는 중이에요. 고치면 바로 반영돼요.</span>${open ? `<button class="link-btn" data-tab="proposals">검토할 제안 ${open}개 →</button>` : ''}`
      : token && viewAsGuest(id)
        ? `<span>🙋 손님 화면을 미리 보는 중이에요.</span><button class="link-btn" data-act="ownerview">주인 화면으로 돌아가기</button>`
        : `<span>🙋 ${me() ? `<b>${esc(me()!.name)}</b>님, ` : ''}고친 내용은 <b>제안</b>으로 모였다가 주인이 수락하면 반영돼요.</span><button class="link-btn" data-act="login">주인이신가요? 비밀번호로 인증 →</button>`;
    $('[data-tabs]').innerHTML = (
      [
        ['plan', '일정', b!.items.length],
        ['proposals', '제안', open],
        ['history', '기록', 0],
      ] as const
    )
      .map(([k, label, n]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${label}${n ? `<span class="count ${k === 'proposals' ? 'hot' : ''}">${n}</span>` : ''}</button>`)
      .join('');
  };

  const itemRow = (r: { item: Item; mark: Mark; fields: string[] }, n: number, prev: Item | null, canMove: { up: boolean; down: boolean }) => {
    const { item, mark } = r;
    const k = KINDS[item.kind];
    const gap = prev?.place && item.place ? km(prev.place, item.place) : null;
    const badge = mark === 'add' ? '추가 예정' : mark === 'remove' ? '삭제 예정' : mark === 'update' ? '수정 예정' : '';
    const actions =
      mark === 'remove' || (mark && !owner)
        ? `<button class="link-btn" data-act="undo" data-id="${item.id}">되돌리기</button>${mark !== 'remove' ? `<button class="icon-btn" data-act="edit" data-id="${item.id}" aria-label="고치기">✎</button>` : ''}`
        : `${canMove.up ? `<button class="icon-btn" data-act="up" data-id="${item.id}" aria-label="위로">↑</button>` : ''}${canMove.down ? `<button class="icon-btn" data-act="down" data-id="${item.id}" aria-label="아래로">↓</button>` : ''}
           <button class="icon-btn" data-act="edit" data-id="${item.id}" aria-label="고치기">✎</button>
           <button class="icon-btn" data-act="remove" data-id="${item.id}" aria-label="지우기">🗑</button>`;
    return `
      ${gap != null && mark !== 'remove' ? `<div class="it-gap">${gap < 1.5 ? '🚶' : gap < 30 ? '🚌' : '🚄'} ${distanceLabel(gap)}</div>` : ''}
      <article class="item ${mark ? `is-${mark}` : ''}" data-id="${item.id}" style="--c:${dayColor(item.day)}">
        <div class="it-time">${esc(item.time) || '<span class="muted">—</span>'}</div>
        <div class="it-dot"><span>${item.day == null ? '?' : n}</span></div>
        <div class="it-body" data-act="focus" data-id="${item.id}">
          <div class="it-title">${k.icon} ${esc(item.title)} ${badge ? `<span class="badge ${mark}">${badge}</span>` : ''}</div>
          <div class="it-sub">${item.place ? `📍 ${esc(item.place.name)}` : ''}${item.place && item.cost ? ' · ' : ''}${item.cost ? won(item.cost) : ''}</div>
          ${item.memo ? `<p class="it-memo">${esc(item.memo)}</p>` : ''}
        </div>
        <div class="it-actions">${actions}</div>
      </article>`;
  };

  const paintPlan = () => {
    const all = rows();
    const n = dayCount(b!.plan.when);
    const groups: { day: number | null; label: string }[] = [
      ...Array.from({ length: n }, (_, i) => ({ day: i + 1, label: dayLabel(b!.plan.when, i + 1) })),
      { day: null, label: '날짜 미정 · 언젠가 가 볼 곳' },
    ];
    const html = groups
      .map(({ day, label }) => {
        const list = all.filter((r) => r.item.day === day);
        const live = list.filter((r) => r.mark !== 'remove');
        const cost = live.reduce((s, r) => s + (r.item.cost ?? 0), 0);
        let prev: Item | null = null;
        const body = list
          .map((r, i) => {
            const liveIdx = live.indexOf(r);
            const html = itemRow(r, i + 1, prev, { up: liveIdx > 0, down: liveIdx >= 0 && liveIdx < live.length - 1 });
            if (r.mark !== 'remove') prev = r.item;
            return html;
          })
          .join('');
        if (day == null && !list.length) {
          return `<section class="day cand"><header><h3>${esc(label)}</h3></header>
            <button class="add-row" data-act="add" data-day="">＋ 후보 장소 적어 두기</button></section>`;
        }
        return `
          <section class="day ${day == null ? 'cand' : ''}" style="--c:${dayColor(day)}">
            <header>
              <h3><i class="day-dot"></i>${esc(label)}</h3>
              <span class="muted small">${live.length ? `${live.length}곳` : ''}${cost ? ` · ${won(cost)}` : ''}</span>
            </header>
            ${body || `<p class="day-empty">아직 비어 있어요</p>`}
            <button class="add-row" data-act="add" data-day="${day ?? ''}">＋ ${day == null ? '후보 추가' : '이 날에 일정 추가'}</button>
          </section>`;
      })
      .join('');
    const total = all.filter((r) => r.mark !== 'remove').reduce((s, r) => s + (r.item.cost ?? 0), 0);
    $('[data-main]').innerHTML = `${html}${total ? `<p class="total">예상 비용 합계 <b>${won(total)}</b></p>` : ''}`;
  };

  const prRow = (p: Proposal) => `
    <a class="pr-row ${p.status}" href="/p/${id}/pr/${p.no}">
      <span class="pill ${STATUS[p.status].cls}">${STATUS[p.status].label}</span>
      <span class="pr-main"><b>#${p.no} ${esc(p.title)}</b><small>${esc(p.authorName)} · ${ago(p.createdAt)} · ${opCounts(p.ops)}</small></span>
      <span class="pr-go">${p.status === 'open' && owner ? '검토하기 →' : '보기 →'}</span>
    </a>`;

  const paintProposals = () => {
    const open = b!.proposals.filter((p) => p.status === 'open');
    const done = b!.proposals.filter((p) => p.status !== 'open');
    $('[data-main]').innerHTML = b!.proposals.length
      ? `${open.length ? `<h3 class="sub">열린 제안 ${open.length}</h3>${open.map(prRow).join('')}` : `<p class="muted pad">검토를 기다리는 제안이 없어요.</p>`}
         ${done.length ? `<h3 class="sub">지난 제안</h3>${done.map(prRow).join('')}` : ''}`
      : `<div class="tab-empty">
           <div class="big-emoji">📮</div>
           <p><b>아직 제안이 없어요</b></p>
           <p class="muted">링크를 받은 친구가 일정을 고치면 여기에 제안으로 쌓여요.<br/>주인은 하나씩 보고 수락하거나 거절할 수 있어요.</p>
           <button class="btn ghost" data-act="share">🔗 링크 공유하기</button>
         </div>`;
  };

  const paintHistory = () => {
    $('[data-main]').innerHTML = `<ol class="history">${b!.history
      .map(
        (h) => `<li>
          <span class="h-ico">${HIST_ICON[h.kind]}</span>
          <div><p>${h.proposalNo ? `<a href="/p/${id}/pr/${h.proposalNo}">${esc(h.summary)}</a>` : esc(h.summary)}</p><small>${esc(h.actor)} · ${ago(h.at)} · v${h.version}</small></div>
        </li>`
      )
      .join('')}</ol>`;
  };

  const paintBasket = () => {
    const el = $('[data-basket]');
    const ops = !owner && draft ? draft.ops : [];
    el.hidden = !ops.length;
    if (!ops.length) return;
    const conflicts = findConflicts(b!.items, ops);
    const moved = b!.plan.version - draft!.baseVersion;
    el.innerHTML = `
      <div class="basket-in">
        <span class="basket-ico">🧺</span>
        <div class="basket-text"><b>제안 바구니</b><small>${opCounts(ops)}${moved > 0 ? ` · 그 사이 계획이 ${moved}번 바뀌었어요` : ''}${conflicts.length ? ` · ⚠️ 겹치는 변경 ${conflicts.length}개` : ''}</small></div>
        <button class="btn ghost sm" data-act="clear-draft">비우기</button>
        <button class="btn primary sm" data-act="send">제안 보내기 →</button>
      </div>`;
  };

  const paintMain = () => {
    if (tab === 'plan') paintPlan();
    else if (tab === 'proposals') paintProposals();
    else paintHistory();
  };

  const paintMap = () => {
    const all = rows();
    const counter = new Map<number | null, number>();
    const pins = all.map((r) => {
      const n = (counter.get(r.item.day) ?? 0) + 1;
      counter.set(r.item.day, n);
      return { item: r.item, mark: r.mark, n };
    });
    const hasPlaces = pins.some((p) => p.item.place);
    $('[data-map-empty]').hidden = hasPlaces || !!b!.plan.place;
    layer.draw(pins, !fitted && hasPlaces);
    if (hasPlaces) fitted = true;
  };

  const paint = () => {
    paintHero();
    paintMain();
    paintBasket();
    paintMap();
  };

  const setTab = (t: Tab) => {
    tab = t;
    const u = new URL(location.href);
    if (t === 'plan') u.searchParams.delete('tab');
    else u.searchParams.set('tab', t);
    history.replaceState(null, '', u.pathname + u.search);
    paint();
  };

  const refresh = async () => {
    const next = await store.get(id);
    if (!next) {
      toast('계획이 삭제됐어요', 'err');
      return navigate('/', true);
    }
    b = next;
    token = ownerToken(id);
    draft = loadDraft(id);
    await resolveRole();
    paint();
  };

  // ---- 바꾸기 ----
  const commit = async (ops: Op[]) => {
    if (!ops.length) return;
    if (owner) {
      try {
        await store.applyDirect(id, token!, ops, b!.plan.ownerName);
      } catch (e) {
        toast(e instanceof StoreError ? e.message : '반영하지 못했어요', 'err');
        if (e instanceof StoreError && e.code === 'forbidden') refresh();
      }
      return;
    }
    if (!me() && !(await nameModal())) return;
    const d: Draft = draft ?? { baseVersion: b!.plan.version, ops: [] };
    for (const op of ops) d.ops = stage(d.ops, op);
    draft = d.ops.length ? d : null;
    saveDraft(id, draft);
    paint();
    toast(draft ? '제안 바구니에 담았어요 🧺' : '바구니가 비었어요');
  };

  const viewItem = (itemId: string) => rows().find((r) => r.item.id === itemId)?.item;
  const nextOrder = (day: number | null) => Math.max(-1, ...rows().filter((r) => r.item.day === day).map((r) => r.item.order)) + 1;

  const sendModal = () => {
    const ops = draft!.ops;
    const conflicts = findConflicts(b!.items, ops);
    modal({
      title: '제안 보내기',
      wide: true,
      body: `
        <form class="stack" novalidate>
          <label class="field-label">제목<input class="input lg" name="title" maxlength="60" value="${esc(describeOps(ops, b!.items))}" /></label>
          <label class="field-label">하고 싶은 말 <small>(선택)</small><textarea class="input" name="message" rows="3" maxlength="500" placeholder="왜 이렇게 바꾸면 좋을지 적어 주면 주인이 판단하기 쉬워요"></textarea></label>
          <p class="field-label">변경 ${ops.length}개</p>
          <div class="opcards">${ops.map((op, i) => opCard(op, i, b!.plan, b!.items, conflicts.find((c) => c.op === i))).join('')}</div>
          <p class="hint">보낸 뒤에는 주인이 수락해야 반영돼요. 그 전까지는 철회할 수 있어요.</p>
          <div class="modal-actions"><button class="btn primary" type="submit">📮 ${esc(b!.plan.ownerName)}님에게 제안</button></div>
        </form>`,
      setup(el, close) {
        const form = el.querySelector('form')!;
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const m = me()!;
          const f = (k: string) => (form.elements.namedItem(k) as HTMLInputElement).value.trim();
          try {
            const pr = await busy(form.querySelector('button[type=submit]'), () =>
              store.propose(id, { authorId: m.id, authorName: m.name, title: f('title') || describeOps(ops, b!.items), message: f('message'), baseVersion: draft!.baseVersion, ops })
            );
            saveDraft(id, null);
            draft = null;
            close();
            toast('제안을 보냈어요. 주인이 수락하면 반영돼요', 'ok');
            navigate(`/p/${id}/pr/${pr.no}`);
          } catch (e2) {
            toast(e2 instanceof StoreError ? e2.message : '보내지 못했어요', 'err');
          }
        });
      },
    });
  };

  root.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const tabBtn = t.closest<HTMLElement>('[data-tab]');
    if (tabBtn) return setTab(tabBtn.dataset.tab as Tab);
    const a = t.closest<HTMLElement>('[data-act]');
    if (!a) return;
    const act = a.dataset.act!;
    const itemId = a.dataset.id;
    a.closest('details')?.removeAttribute('open');

    switch (act) {
      case 'share':
        return shareModal(b!.plan);
      case 'login':
        if (await loginModal(b!.plan)) refresh();
        return;
      case 'guestview':
        setViewAsGuest(id, true);
        return refresh();
      case 'ownerview':
        setViewAsGuest(id, false);
        return refresh();
      case 'logout':
        if (!(await confirmBox('주인 인증 풀기', '이 브라우저에서 주인 인증을 풀까요? 비밀번호를 넣으면 언제든 다시 주인이 될 수 있어요.', '풀기'))) return;
        await store.logout(id, token!);
        clearOwnerToken(id);
        toast('주인 인증을 풀었어요');
        return refresh();
      case 'meta':
        return metaModal(b!.plan, token!);
      case 'password':
        return passwordModal(b!.plan, token!);
      case 'delete':
        if (!(await confirmBox('계획 삭제', `'${esc(b!.plan.title)}' 계획과 제안, 기록이 모두 사라져요. 되돌릴 수 없어요.`, '삭제', true))) return;
        await store.remove(id, token!);
        clearOwnerToken(id);
        saveDraft(id, null);
        toast('삭제했어요');
        return navigate('/', true);
      case 'focus':
        if (itemId && !layer.focus(itemId)) toast('장소가 없는 일정이에요');
        return;
      case 'add': {
        const day = a.dataset.day ? Number(a.dataset.day) : null;
        const item = await itemModal(b!.plan, { day, order: nextOrder(day), owner });
        if (item) commit([{ type: 'add', item }]);
        return;
      }
      case 'edit': {
        const cur = viewItem(itemId!);
        if (!cur) return;
        const next = await itemModal(b!.plan, { item: cur, order: nextOrder(null) + 1000, owner });
        if (!next) return;
        // 날짜를 옮겼으면 그 날의 맨 뒤로
        if (next.day !== cur.day) next.order = nextOrder(next.day);
        const op = diffItem(cur, next);
        if (op) commit([op]);
        return;
      }
      case 'remove': {
        const cur = viewItem(itemId!);
        if (!cur) return;
        if (owner && !(await confirmBox('일정 지우기', `'${esc(cur.title)}'을(를) 지울까요?`, '지우기', true))) return;
        commit([{ type: 'remove', id: cur.id, before: b!.items.find((x) => x.id === cur.id) ?? cur }]);
        return;
      }
      case 'up':
      case 'down': {
        const cur = viewItem(itemId!);
        if (!cur) return;
        const sameDay = rows().filter((r) => r.item.day === cur.day && r.mark !== 'remove').map((r) => r.item);
        const i = sameDay.findIndex((x) => x.id === cur.id);
        const other = sameDay[act === 'up' ? i - 1 : i + 1];
        if (!other) return;
        const ops = [diffItem(cur, { ...cur, order: other.order }), diffItem(other, { ...other, order: cur.order })].filter((o): o is Op => !!o);
        commit(ops);
        return;
      }
      case 'undo': {
        if (!draft) return;
        draft.ops = draft.ops.filter((o) => (o.type === 'add' ? o.item.id : o.id) !== itemId);
        if (!draft.ops.length) draft = null;
        saveDraft(id, draft);
        paint();
        return;
      }
      case 'clear-draft':
        if (!(await confirmBox('바구니 비우기', '아직 보내지 않은 변경을 모두 버릴까요?', '비우기', true))) return;
        draft = null;
        saveDraft(id, null);
        return paint();
      case 'send':
        return sendModal();
    }
  });

  paint();
  if (query.get('welcome')) {
    history.replaceState(null, '', `/p/${id}`);
    shareModal(b.plan, true);
  }
  setTimeout(() => map.invalidateSize(), 50);

  const unsub = store.subscribe(id, refresh);
  return () => {
    unsub();
    map.remove();
  };
}
