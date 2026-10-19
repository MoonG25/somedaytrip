// 떠날 곳 (홈): 출발 전광판 · "시간 났다!" · 골라줘 · 탑승권 그리드 (moon.log pages/plans.js에서 옮김)
// renderPlansPage는 서버에서도 돈다(검색엔진이 읽는 HTML). mountPlansPage는 브라우저에서 움직임을 붙인다.
import { html, esc, fmtWon, reducedMotion, seoulMonth } from './util.js';
import { sortPlans, STATUS, totalBudget, fitScore, daysUntil, nights } from './plans-lib.js';
import { createFlapEngine, createBoard } from './splitflap.js';
import { ticketHTML, bindTickets } from './ticket.js';
import { bindTilt } from './enhance.js';
import { toast } from './toast.js';

const COLUMNS = [
  { key: 'gate', label: 'GATE', ko: '탑승구', len: 2, charset: 'digits', optional: true },
  { key: 'when', label: 'WHEN', ko: '출발', len: 5, charset: 'mixed' },
  { key: 'dest', label: 'DESTINATION', ko: '목적지', len: 13, charset: 'latin' },
  { key: 'code', label: 'CODE', ko: '공항', len: 3, charset: 'latin' },
  { key: 'days', label: 'DAYS', ko: '기간', len: 3, charset: 'digits', optional: true },
  { key: 'status', label: 'STATUS', ko: '상태', len: 4, charset: 'hangul' },
];

const SORTS = { status: '상태순', soon: '출발 빠른 순', priority: '우선순위', budget: '예산 적은 순', distance: '가까운 순', recent: '최근 수정순' };

// 전광판은 영문 대문자 칸이라, 영문 이름이 없는 동네 여행은 공항 코드 자리에 LCL/DOM을 쓴다
const rowOf = (p) => ({
  id: p.id,
  href: p.href,
  tone: p.status,
  label: `${p.place}, ${STATUS[p.status].ko}${p.target ? `, ${p.target} 출발` : ''}`,
  cells: {
    gate: String(p.priority ?? 0).padStart(2, '0'),
    when: p.target ? p.target.slice(2, 7).replace('-', '.') : '언젠가',
    dest: (p.placeEn || p.place).toUpperCase().slice(0, 13),
    code: (p.iata || (p.scope === 'local' ? 'LCL' : p.scope === 'domestic' ? 'DOM' : '---')).toUpperCase(),
    days: `${p.days}일`,
    status: STATUS[p.status].flap,
  },
});

const NO_MATCH = { id: '', tone: 'none', cells: { gate: '--', when: '-----', dest: 'NO DEPARTURE', code: '---', days: '--', status: '없음' } };

/** 서버가 그리는 전광판 기본 글자 (JS가 붙기 전에도 읽을 수 있게) */
const staticBoard = (rows) => `
  <div class="sf-cols" role="row">${COLUMNS.map((c) => `<span class="sf-col col-${c.key}" style="--len:${c.len}" role="columnheader">${c.label}<small>${c.ko}</small></span>`).join('')}</div>
  <div class="sf-rows sf-static">${rows
    .map(
      (r) =>
        `<a class="sf-row tone-${r.tone} has-id" role="row" href="${esc(r.href)}" aria-label="${esc(r.label)}">${COLUMNS.map((c) => `<span class="sf-cell col-${c.key}" style="--len:${c.len}" role="cell">${esc(r.cells[c.key])}</span>`).join('')}</a>`
    )
    .join('')}</div>`;

export function renderPlansPage({ list, mine = [], sort = 'status', status = 'all', open = {} }) {
  const sorted = sortPlans(list, sort);
  const counts = Object.fromEntries(Object.keys(STATUS).map((k) => [k, sorted.filter((p) => p.status === k).length]));
  const next = sorted.filter((p) => p.status !== 'done' && p.target && daysUntil(p.target) >= 0).sort((a, b) => a.target.localeCompare(b.target))[0];
  const month = seoulMonth();
  const mineSet = new Set(mine);
  const departing = sorted.filter((p) => p.status !== 'done');
  return html`
<section class="container page-head plans-head">
  <div class="page-head-row">
    <div>
      <p class="eyebrow" data-reveal>Departures · 떠날 곳</p>
      <h1 class="display" data-split>Someday, <em>soon.</em></h1>
      <p class="lede" data-reveal>언젠가 갈 여행을 미리 짜 두고, 시간이 생기면 떠나요. 링크를 보내면 친구가 일정을 <b>제안</b>하고, 기장이 <b>수락</b>하면 반영돼요. 해외여행이 아니어도, 동네 한 바퀴도 좋아요.</p>
      <div class="hero-cta" data-reveal><a class="btn btn--solid" href="/new" data-magnetic>+ 계획 쓰기</a><a class="btn btn--ghost" href="#how">어떻게 같이 짜나요?</a></div>
    </div>
    <dl class="plans-stats" data-stagger="70">
      ${Object.entries(STATUS).map(([k, s]) => `<div class="tone-${k}" data-reveal><dt>${s.ko}</dt><dd class="h-serif num">${counts[k]}</dd></div>`)}
    </dl>
  </div>
</section>

<section class="container">
  <div class="board" data-reveal>
    <header class="board-head">
      <div class="board-title"><svg viewBox="-10 -8 20 16" aria-hidden="true"><path d="M8 0 L2 -1.2 L-2 -7 L-4 -7 L-2.2 -1.2 L-6 -1 L-7.6 -3 L-8.6 -3 L-7.8 0 L-8.6 3 L-7.6 3 L-6 1 L-2.2 1.2 L-4 7 L-2 7 L2 1.2 Z"/></svg><b>DEPARTURES</b><span>떠날 곳</span></div>
      <div class="board-clock"><span class="board-clock-flaps" aria-label="서울 현재 시각"></span><small>SEOUL</small></div>
      <button type="button" class="board-sound" aria-pressed="false" aria-label="전광판 소리 켜기">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Z"/><path class="wave" d="M16.5 8.5a5 5 0 0 1 0 7"/><path class="mute" d="m16 9 5 6m0-6-5 6"/></svg>
      </button>
    </header>
    <div class="board-body" role="table" aria-label="여행 계획 전광판">${staticBoard((departing.length ? departing : []).slice(0, 12).map(rowOf))}</div>
    <footer class="board-foot"><span class="board-ticker mono">${next ? `NEXT ▸ ${esc((next.placeEn || next.place).toUpperCase())} · D-${daysUntil(next.target)}` : 'ALL GATES OPEN'} · ${departing.length} PLANS · ARRIVED ${counts.done || 0} · 시간 났다면 아래에서 찾아보세요</span></footer>
  </div>
</section>

<section class="container matcher-sec">
  <form class="matcher" data-reveal>
    <div class="m-title"><p class="eyebrow">I have time!</p><h2>시간 <em>났다!</em></h2><p class="muted">남는 날, 달, 예산을 넣으면 지금 떠날 수 있는 곳을 찾아요.</p></div>
    <label class="m-field">
      <span class="m-label">며칠이나?</span><output class="m-out" name="daysOut">5일</output>
      <input type="range" name="days" min="1" max="30" value="5" aria-label="남는 날">
    </label>
    <div class="m-field">
      <span class="m-label">언제?</span><output class="m-out" name="monthOut">${month}월</output>
      <div class="m-months" role="radiogroup" aria-label="떠날 달">
        ${Array.from({ length: 12 }, (_, i) => `<button type="button" role="radio" data-m="${i + 1}" aria-checked="${i + 1 === month}">${i + 1}</button>`)}
      </div>
    </div>
    <label class="m-field">
      <span class="m-label">예산은?</span><output class="m-out num" name="budgetOut">${fmtWon(2000000)}</output>
      <input type="range" name="budget" min="0" max="8000000" step="100000" value="2000000" aria-label="예산">
    </label>
    <div class="m-actions">
      <button class="btn btn--solid" type="submit"><svg viewBox="-10 -8 20 16" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M8 0 L2 -1.2 L-2 -7 L-4 -7 L-2.2 -1.2 L-6 -1 L-7.6 -3 L-8.6 -3 L-7.8 0 L-8.6 3 L-7.6 3 L-6 1 L-2.2 1.2 L-4 7 L-2 7 L2 1.2 Z"/></svg>갈 수 있는 곳 찾기</button>
      <button class="btn" type="button" data-pick>🎲 골라줘</button>
      <button class="link-u faint" type="button" data-reset hidden>전체 보기</button>
    </div>
  </form>
  <p class="matcher-result" aria-live="polite"></p>
</section>

<section class="container plans-list">
  <header class="sec-head" data-reveal>
    <div><p class="eyebrow">Boarding passes</p><h2>All <em>plans</em></h2></div>
    <a class="btn btn--solid btn--sm" href="/new" data-magnetic>+ 계획 쓰기</a>
  </header>
  <div class="plans-tools" data-reveal>
    <div class="chips" role="group" aria-label="상태">
      ${mine.length ? `<button type="button" class="chip chip-mine" data-mine aria-pressed="false">내 계획 <span class="count">${mine.length}</span></button>` : ''}
      <button type="button" class="chip" data-status="all" aria-pressed="${status === 'all'}">전체 <span class="count">${sorted.length}</span></button>
      ${Object.entries(STATUS).map(([k, s]) => `<button type="button" class="chip" data-status="${k}" aria-pressed="${status === k}">${s.ko} <span class="count">${counts[k]}</span></button>`)}
    </div>
    <label class="field sort-field"><select aria-label="정렬">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${v}</option>`)}</select></label>
  </div>
  <div class="tickets" data-stagger="70">${sorted.map((p) => ticketHTML(p, { mine: mineSet.has(p.id), open: open[p.id] || 0 }))}</div>
  <div class="empty" ${sorted.length ? 'hidden' : ''}><b>텅.</b>${sorted.length ? '이 조건에 맞는 계획이 없어요.' : '아직 계획이 없어요. 첫 계획을 써 보세요.'}</div>
</section>

<section class="container how" id="how">
  <header class="sec-head" data-reveal><div><p class="eyebrow">How it works</p><h2>Plan it <em>together</em></h2></div></header>
  <ol class="how-steps" role="list" data-stagger="80">
    <li data-reveal><span class="mono">01</span><b>계획 쓰기</b><p>어디로, 언제, 얼마나. 날짜가 없어도 괜찮아요. 만들 때 정한 <b>비밀번호</b>를 아는 사람이 기장이에요.</p></li>
    <li data-reveal><span class="mono">02</span><b>링크 보내기</b><p>링크를 받은 친구는 누구나 일정을 고칠 수 있어요. 바로 바뀌지 않고 <b>제안</b>으로 쌓여요.</p></li>
    <li data-reveal><span class="mono">03</span><b>수락 · 거절</b><p>기장이 제안을 보고 골라서 반영해요. 겹치는 변경은 알려 줘요. 원하면 <b>전체 공개</b>로 누구나 보게 할 수도 있어요.</p></li>
  </ol>
</section>`;
}

export function mountPlansPage(root, { list, mine = [], navigate, open = {} }) {
  const cleanups = [];
  let sort = root.querySelector('.sort-field select').value || 'status';
  let all = sortPlans(list, sort);
  let status = 'all';
  let onlyMine = false;
  let match = null;
  const mineSet = new Set(mine);

  /* 전광판: 서버가 그린 정적 글자를 플랩 엔진으로 바꾼다 */
  const engine = createFlapEngine();
  cleanups.push(() => engine.destroy());
  const visible = () => all.filter((p) => (status === 'all' || p.status === status) && (!onlyMine || mineSet.has(p.id)));
  const departing = (rows) => rows.filter((p) => p.status !== 'done');
  const board = createBoard(root.querySelector('.board-body'), { columns: COLUMNS, rows: Math.max(6, Math.min(12, departing(all).length)), engine });
  cleanups.push(() => board.destroy());
  const clock = engine.line(root.querySelector('.board-clock-flaps'), 5, 'digits');
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
  const tickClock = () => clock.set(fmt.format(new Date()), { spins: [1, 3], stagger: 40 });
  tickClock();
  const iv = setInterval(tickClock, 15000);
  cleanups.push(() => clearInterval(iv));

  const showBoard = (rows, opts) => {
    const r = departing(rows).slice(0, 12);
    board.setRows(r.length ? r.map(rowOf) : [NO_MATCH], opts);
  };
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    showBoard(visible(), { delay: 200 });
  });
  io.observe(root.querySelector('.board'));
  cleanups.push(() => io.disconnect());

  const boardBody = root.querySelector('.board-body');
  const tickets = root.querySelector('.tickets');
  const openPlan = (id) => {
    const t = tickets.querySelector(`.ticket[data-slug="${CSS.escape(id)}"] .ticket-link`);
    if (t) t.click();
    else {
      const p = all.find((x) => x.id === id);
      if (p) navigate(p.href);
    }
  };
  boardBody.addEventListener('click', (e) => {
    const row = e.target.closest('.sf-row.has-id');
    if (row) openPlan(row.dataset.id);
  });
  boardBody.addEventListener('keydown', (e) => {
    const row = e.target.closest('.sf-row.has-id');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openPlan(row.dataset.id);
    }
  });
  boardBody.addEventListener('pointerover', (e) => {
    const id = e.target.closest('.sf-row')?.dataset.id;
    tickets.querySelectorAll('.ticket').forEach((t) => t.classList.toggle('lit', !!id && t.dataset.slug === id));
  });
  boardBody.addEventListener('pointerleave', () => tickets.querySelectorAll('.ticket.lit').forEach((t) => t.classList.remove('lit')));

  /* 소리 */
  const soundBtn = root.querySelector('.board-sound');
  soundBtn.addEventListener('click', () => {
    const on = soundBtn.getAttribute('aria-pressed') !== 'true';
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.setAttribute('aria-label', on ? '전광판 소리 끄기' : '전광판 소리 켜기');
    engine.setSound(on);
    if (on) showBoard(match ? matched() : visible(), { force: true });
  });

  /* 탑승권 그리드: 필터·정렬·적합도 (FLIP) */
  cleanups.push(bindTickets(root, navigate));
  let alive = true;
  cleanups.push(() => (alive = false));
  const flip = (mutate) => {
    const before = new Map([...tickets.children].filter((c) => !c.hidden).map((c) => [c.dataset.slug, c.getBoundingClientRect()]));
    mutate();
    if (reducedMotion()) return;
    [...tickets.children].forEach((c) => {
      if (c.hidden) return;
      const b = before.get(c.dataset.slug);
      const a = c.getBoundingClientRect();
      if (b) {
        const dx = b.left - a.left;
        const dy = b.top - a.top;
        if (dx || dy) c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
      } else c.animate([{ opacity: 0, transform: 'translateY(20px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.16,1,.3,1)' });
    });
  };

  const matched = () =>
    departing(visible())
      .map((p) => ({ p, f: fitScore(p, match) }))
      .filter((x) => x.f.fit)
      .sort((a, b) => b.f.score - a.f.score || a.p.priority - b.p.priority)
      .map((x) => x.p);

  const renderTickets = () => {
    flip(() => {
      const order = match
        ? visible()
            .map((p) => ({ p, f: fitScore(p, match) }))
            .sort((a, b) => b.f.fit - a.f.fit || b.f.score - a.f.score)
        : visible().map((p) => ({ p, f: null }));
      const shown = new Set(order.map((x) => x.p.id));
      const existing = new Map([...tickets.children].map((c) => [c.dataset.slug, c]));
      order.forEach(({ p, f }) => {
        const holder = document.createElement('div');
        holder.innerHTML = ticketHTML(p, { fit: f, mine: mineSet.has(p.id), open: open[p.id] || 0 });
        const next = holder.firstElementChild;
        next.classList.add('is-in');
        next.classList.toggle('dim', !!f && !f.fit);
        if (existing.get(p.id)?.classList.contains('picked')) next.classList.add('picked');
        existing.get(p.id)?.remove();
        tickets.append(next);
      });
      [...tickets.children].forEach((c) => (c.hidden = !shown.has(c.dataset.slug)));
      const empty = root.querySelector('.plans-list .empty');
      empty.hidden = shown.size > 0;
      empty.innerHTML = '<b>텅.</b>이 조건에 맞는 계획이 없어요.';
    });
    bindTilt(tickets);
  };

  root.querySelector('.plans-tools .chips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    if (b.hasAttribute('data-mine')) {
      onlyMine = !onlyMine;
      b.setAttribute('aria-pressed', String(onlyMine));
    } else {
      status = b.dataset.status;
      root.querySelectorAll('.plans-tools .chip[data-status]').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    }
    renderTickets();
    showBoard(match ? matched() : visible());
  });
  root.querySelector('.sort-field select').addEventListener('change', (e) => {
    sort = e.target.value;
    all = sortPlans(list, sort);
    renderTickets();
    if (!match) showBoard(visible());
  });

  /* 시간 났다! */
  const form = root.querySelector('.matcher');
  const result = root.querySelector('.matcher-result');
  const reset = root.querySelector('[data-reset]');
  const readForm = () => ({
    days: Number(form.days.value),
    month: Number(form.querySelector('[aria-checked="true"]').dataset.m),
    budget: Number(form.budget.value),
  });
  form.addEventListener('input', () => {
    form.daysOut.value = `${form.days.value}일`;
    form.budgetOut.value = fmtWon(Number(form.budget.value));
  });
  form.querySelector('.m-months').addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    form.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    form.monthOut.value = `${b.dataset.m}월`;
  });
  const runMatch = () => {
    match = readForm();
    const hits = matched();
    showBoard(hits, { force: true });
    renderTickets();
    reset.hidden = false;
    if (hits.length) {
      result.innerHTML = `<b>${hits.length}곳</b>에 지금 떠날 수 있어요. ${match.days}일 · ${match.month}월 · ${fmtWon(match.budget)} 이하`;
    } else {
      const near = departing(visible())
        .map((p) => ({ p, f: fitScore(p, match) }))
        .sort((a, b) => b.f.score - a.f.score)[0];
      result.innerHTML = near
        ? `딱 맞는 곳은 없어요. <b>${esc(near.p.place)}</b>는 ${near.f.missing.join(', ')}이면 갈 수 있어요.`
        : '계획이 없어요. 먼저 계획을 써 보세요.';
    }
    return hits;
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    runMatch();
    root.querySelector('.board').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  reset.addEventListener('click', () => {
    match = null;
    reset.hidden = true;
    result.textContent = '';
    showBoard(visible(), { force: true });
    renderTickets();
  });

  /* 골라줘: 첫 줄이 슬롯머신처럼 돌다가 멈춘다 */
  let spinning = false;
  root.querySelector('[data-pick]').addEventListener('click', async () => {
    if (spinning) return;
    spinning = true;
    const hits = runMatch();
    const pool = hits.length ? hits : departing(visible());
    if (!pool.length) {
      spinning = false;
      return;
    }
    const weights = pool.map((p) => 1 / Math.sqrt(p.priority || 1));
    let r = Math.random() * weights.reduce((s, w) => s + w, 0);
    const winner = pool.find((_, i) => (r -= weights[i]) <= 0) || pool[0];
    root.querySelector('.board').scrollIntoView({ behavior: 'smooth', block: 'center' });
    board.setRows([], { force: false });
    const steps = reducedMotion() ? 1 : 16;
    for (let i = 0; i < steps; i++) {
      const p = pool[i % pool.length];
      board.setRow(0, rowOf(p), { spins: [0, 1], stagger: 4, dur: 34, force: true });
      await new Promise((res) => setTimeout(res, 70 + Math.pow(i / steps, 3) * 420));
      if (!alive) return;
    }
    board.setRow(0, rowOf(winner), { spins: [2, 4], stagger: 18, force: true });
    await new Promise((res) => setTimeout(res, 900));
    if (!alive) return;
    toast(`이번엔 ${winner.place} 어때요? 탑승구 ${String(winner.priority).padStart(2, '0')}`, '✈');
    result.innerHTML = `🎲 <b>${esc(winner.place)}</b>로 정했어요. ${nights(winner.days)} · ${fmtWon(totalBudget(winner))} · <a class="link-u" href="${esc(winner.href)}">계획 보기 →</a>`;
    const t = tickets.querySelector(`.ticket[data-slug="${CSS.escape(winner.id)}"]`);
    tickets.querySelectorAll('.ticket.picked').forEach((x) => x.classList.remove('picked'));
    t?.classList.add('picked');
    spinning = false;
  });

  // 처음 보는 '다녀옴' 탑승권엔 도착 도장이 쾅 찍힌다
  try {
    const seen = new Set(JSON.parse(localStorage.getItem('sdt:arrivedSeen') || '[]'));
    all
      .filter((p) => p.status === 'done' && !seen.has(p.id))
      .forEach((p) => {
        tickets.querySelector(`.ticket[data-slug="${CSS.escape(p.id)}"]`)?.classList.add('stamp-in');
        seen.add(p.id);
      });
    localStorage.setItem('sdt:arrivedSeen', JSON.stringify([...seen]));
  } catch {}

  return () => cleanups.forEach((fn) => fn());
}
