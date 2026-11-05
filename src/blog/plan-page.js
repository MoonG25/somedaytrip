// 계획 상세 (moon.log pages/plan.js에서 옮김). 문자열 함수는 서버에서 그리고, mountPlanPage가 브라우저에서 움직임을 붙인다.
// 섬데트에서 바뀐 점
//  - "가 볼 곳"은 React 협업 일정(Itinerary)이 맡는다
//  - 체크리스트는 계획에 저장되고 기장만 체크한다 (모두에게 보임)
//  - 예산은 React(BudgetBoard)가 화면에서 바로 고친다. 가기 좋은 달·여행 적금은 뺐다
import { esc, fmtNum, fmtWon, fmtDot } from './util.js';
import { renderMarkdown } from './md.js';
import { STATUS, SCOPE, totalBudget, groupBudget, flight, daysUntil, nights, planCenter, readiness, hasPlace } from './plans-lib.js';
import { weatherAt, krwPer, fxLabel, tzOffsetHours, sunAt } from './live.js';
import { createFlapEngine } from './splitflap.js';
import { ticketHTML, bindTickets, readyRing } from './ticket.js';
import { toast } from './toast.js';
import { CHECK_SUGGEST } from '../lib/suggest';

export function renderPlanHero(p, { owner = false, nowMonth }) {
  const st = STATUS[p.status];
  const d = daysUntil(p.target);
  const ready = readiness(p);
  const mode = p.status === 'done' ? 'done' : p.target && d >= 0 ? 'count' : p.target ? 'past' : 'someday';
  let aside = '';
  if (mode === 'done') {
    aside = `<p class="eyebrow">Arrived · 다녀옴</p>
      <div class="count-arrived"><b class="arrived-check" aria-hidden="true">✓</b><div><strong>다녀왔어요</strong><p>${p.target ? fmtDot(p.target) : ''}</p></div></div>`;
  } else if (mode === 'past') {
    aside = `<p class="eyebrow">Past date · 출발일 지남</p>
      <div class="count-past"><b class="h-serif">D+${-d}</b><p>출발일(${fmtDot(p.target)})이 지났어요.<br><strong>다녀왔나요?</strong></p></div>
      ${owner ? `<a class="btn btn--solid btn--sm" href="/p/${esc(p.id)}/edit">상태 바꾸기 · 날짜 미루기</a>` : ''}`;
  } else if (mode === 'count') {
    aside = `<p class="eyebrow">Countdown · 출발까지</p>
      <div class="count-flaps" role="timer" aria-label="출발까지 ${d}일">
        <div><span class="cf" data-cf="d">${String(d).padStart(2, '0')}</span><small>일</small></div>
        <div><span class="cf" data-cf="h">--</span><small>시간</small></div>
        <div><span class="cf" data-cf="m">--</span><small>분</small></div>
        <div><span class="cf" data-cf="s">--</span><small>초</small></div>
      </div>
      <p class="count-note">${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full', timeZone: 'Asia/Seoul' }).format(new Date(p.target + 'T00:00:00+09:00'))} 출발 · ${st.ko}</p>`;
  } else {
    aside = `<p class="eyebrow">Someday · 언젠가</p>
      <div class="count-someday"><b class="h-serif">∞</b><p>날짜는 아직 없어요.<br>시간이 생기면 바로 떠날 수 있게 준비만 해 둡니다.</p></div>
      <a class="btn btn--sm" href="/#how">같이 짜는 법 보기 →</a>`;
  }
  return `
  <header class="container plan-hero">
    <div class="plan-hero-top">
      <a href="/" class="back-link link-u">← 떠날 곳</a>
      <div class="plan-badges">
        ${p.sample ? '<span class="badge-sample">예시 계획</span>' : ''}
        <span class="vis-badge ${p.visibility}">${p.visibility === 'public' ? '🌍 전체 공개' : '🔗 링크 공개'}</span>
        ${p.scope !== 'abroad' ? `<span class="vis-badge">${SCOPE[p.scope].icon} ${SCOPE[p.scope].ko} 여행</span>` : ''}
      </div>
    </div>
    <div class="plan-hero-grid">
      <div class="plan-ticket">${ticketHTML(p, { big: true })}</div>
      <div class="plan-count">
        ${aside}
        <div class="count-ready">${readyRing(ready.pct, 52)}<div><b>${ready.done}/${ready.total}</b><span>준비 완료</span></div></div>
      </div>
    </div>
  </header>`;
}

export function renderPlanStory(p, { nowMonth }) {
  const fl = flight(p);
  const total = totalBudget(p);
  const offset = tzOffsetHours(p.tz || 'Asia/Seoul');
  const intro = p.intro ? renderMarkdown(p.intro).html : '';
  return `
  ${
    p.why || intro || p.tags?.length
      ? `<section class="container plan-why${p.why && (intro || p.tags?.length) ? '' : ' is-single'}${p.why ? '' : ' no-quote'}">
    ${p.why ? `<blockquote class="plan-quote h-serif" data-split>“${esc(p.why)}”</blockquote>` : ''}
    ${
      intro || p.tags?.length
        ? `<div class="plan-intro">
      ${intro ? `<div class="prose" data-reveal>${intro}</div>` : ''}
      ${p.tags?.length ? `<ul class="review-tags" role="list" data-reveal>${p.tags.map((t) => `<li class="tag">#${esc(t)}</li>`).join('')}</ul>` : ''}
    </div>`
        : ''
    }
  </section>`
      : ''
  }
  <section class="container plan-facts">
    <header class="sec-head" data-reveal><div><p class="eyebrow">알아 둘 것</p><h2>Before you <em>go</em></h2></div></header>
    <div class="facts" data-stagger="60">
      ${
        offset !== 0 || p.scope === 'abroad'
          ? `<div class="fact" data-reveal>
        <p class="eyebrow">지금 현지 시각</p>
        <b class="fact-big num" data-localtime>--:--</b>
        <p class="fact-note">${offset === 0 ? '서울과 같은 시간' : `서울보다 ${Math.abs(offset)}시간 ${offset > 0 ? '빠름' : '느림'}`}</p>
      </div>`
          : `<div class="fact" data-reveal>
        <p class="eyebrow">오늘 해 · 일출 → 일몰</p>
        <b class="fact-big num" data-sun>--:-- → --:--</b>
        <p class="fact-note">노을 보려면 일몰 30분 전에</p>
      </div>`
      }
      <div class="fact" data-reveal>
        <p class="eyebrow">지금 날씨 (실시간)</p>
        <b class="fact-big" data-weather>…</b>
        <p class="fact-note" data-weather-note>Open-Meteo</p>
      </div>
      ${
        p.currency && p.currency !== 'KRW'
          ? `<div class="fact" data-reveal>
        <p class="eyebrow">환율 (실시간)</p>
        <b class="fact-big num" data-fx>…</b>
        <p class="fact-note" data-fx-note>${esc(p.currency || '')}</p>
      </div>`
          : ''
      }
      ${
        p.scope === 'local'
          ? ''
          : `<div class="fact" data-reveal>
        <p class="eyebrow">서울에서</p>
        <b class="fact-big num">${hasPlace(p) ? `${fmtNum(fl.km)}km` : '—'}</b>
        <p class="fact-note">${!hasPlace(p) ? '목적지를 정하면 계산해요' : p.scope === 'abroad' ? `비행 ${fl.label} (직항 기준 추정)` : '직선거리'}</p>
      </div>`
      }
      <div class="fact" data-reveal>
        <p class="eyebrow">기간 · 예산${(p.travelers || 1) > 1 ? ` · ${p.travelers}명` : ''}</p>
        <b class="fact-big">${nights(p.days)}</b>
        <p class="fact-note num">${(p.travelers || 1) > 1 ? `1인 ${fmtWon(total)} · ${p.travelers}명 전체 ${fmtWon(groupBudget(p))}` : `${fmtWon(total)}${total ? ` · 하루 ${fmtWon(Math.round(total / p.days / 1000) * 1000)}` : ''}`}</p>
      </div>
    </div>
  </section>`;
}

/** 준비할 것 (모두의 체크리스트). 예산은 옆의 BudgetBoard가 그린다 */
export function renderPrep(p, { owner = false, editable = true }) {
  const ready = readiness(p);
  return `
    <div class="prep-check" data-reveal>
      <header class="sec-head"><div><p class="eyebrow">준비할 것</p><h2>Check<em>list</em></h2></div>${readyRing(ready.pct, 48)}</header>
      ${
        (p.checklist || []).length
          ? `<ul class="checklist" role="list">
        ${p.checklist
          .map(
            ([text, done], k) =>
              `<li data-ck="${k}"><label class="check"><input type="checkbox" data-check="${k}" ${done ? 'checked' : ''}><span class="check-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5"/></svg></span><span class="check-text">${esc(text)}</span></label>${
                editable ? `<span class="ck-tools"><button type="button" class="ck-btn" data-ckedit="${k}" aria-label="${esc(text)} 고치기">✎</button><button type="button" class="ck-btn" data-ckdel="${k}" aria-label="${esc(text)} 지우기">✕</button></span>` : ''
              }</li>`
          )
          .join('')}
      </ul>`
          : `<p class="muted">아직 준비할 것이 없어요.${editable ? ' 생각날 때마다 아래에 적어 두세요.' : ''}</p>`
      }
      ${
        editable
          ? (() => {
              const have = new Set((p.checklist || []).map(([t]) => t));
              const sug = (CHECK_SUGGEST[p.scope] || []).filter((t) => !have.has(t));
              return `<form class="ck-add" autocomplete="off"><span class="ba-ico" aria-hidden="true">+</span><input name="ck" maxlength="80" placeholder="준비할 것 추가 (예: JR패스 교환)" aria-label="준비할 것 추가"><button type="submit" class="btn btn--sm">추가</button></form>
      ${sug.length ? `<details class="ck-suggest"><summary>추천 보기</summary><div class="chips">${sug.map((t) => `<button type="button" class="chip" data-cksug="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div></details>` : ''}`;
            })()
          : ''
      }
      <p class="faint check-note">${editable ? '모두의 체크리스트예요. 누구나 체크하고, 생각날 때마다 더해요.' : ''}</p>
    </div>`;
}

/** 브라우저에서: 카운트다운 플랩 · 현지 시각 · 날씨 · 환율 · 체크리스트 · 탑승권 */
export function mountPlanPage(root, p, { owner = false, onCheck, onChecklist, navigate } = {}) {
  const cleanups = [];
  let alive = true;
  cleanups.push(bindTickets(root, navigate || (() => {})));

  /* 카운트다운 플랩 */
  const target = p.target ? new Date(p.target + 'T00:00:00+09:00').getTime() : 0;
  if (p.status !== 'done' && p.target && daysUntil(p.target) >= 0 && root.querySelector('[data-cf="d"]')) {
    const engine = createFlapEngine();
    cleanups.push(() => engine.destroy());
    const dayDigits = Math.max(2, String(Math.floor((target - Date.now()) / 86400000)).length);
    const lines = {};
    for (const k of ['d', 'h', 'm', 's']) {
      const el = root.querySelector(`[data-cf="${k}"]`);
      el.textContent = '';
      lines[k] = engine.line(el, k === 'd' ? dayDigits : 2, 'digits');
    }
    let first = true;
    const tick = () => {
      const left = Math.max(0, target - Date.now());
      const v = { d: Math.floor(left / 86400000), h: Math.floor(left / 3600000) % 24, m: Math.floor(left / 60000) % 60, s: Math.floor(left / 1000) % 60 };
      Object.entries(v).forEach(([k, n]) => lines[k].set(String(n).padStart(k === 'd' ? dayDigits : 2, '0'), first ? { spins: [4, 10], delay: 300 } : { spins: [0, 0], stagger: 0, dur: 160 }));
      first = false;
    };
    tick();
    const iv = setInterval(tick, 1000);
    cleanups.push(() => clearInterval(iv));
  }

  /* 현지 시각 · 날씨 · 환율 */
  const clock = root.querySelector('[data-localtime]');
  if (clock) {
    const tfmt = new Intl.DateTimeFormat('ko-KR', { timeZone: p.tz || 'Asia/Seoul', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
    const tickTime = () => (clock.textContent = tfmt.format(new Date()));
    tickTime();
    const tv = setInterval(tickTime, 10000);
    cleanups.push(() => clearInterval(tv));
  }
  const ctrl = new AbortController();
  cleanups.push(() => ctrl.abort());
  if (root.querySelector('[data-weather]') && !hasPlace(p)) root.querySelector('[data-weather]').textContent = '—';
  else if (root.querySelector('[data-weather]')) {
    weatherAt(planCenter(p), ctrl.signal)
      .then((w) => {
        root.querySelector('[data-weather]').textContent = `${w.icon} ${w.temp}°`;
        root.querySelector('[data-weather-note]').textContent = `${w.label} · 바람 ${w.wind}km/h`;
      })
      .catch(() => alive && (root.querySelector('[data-weather]').textContent = '—'));
  }
  const sunEl = root.querySelector('[data-sun]');
  if (sunEl && hasPlace(p)) {
    sunAt(planCenter(p), ctrl.signal)
      .then((s) => (sunEl.textContent = `${s.rise} → ${s.set}`))
      .catch(() => alive && (sunEl.textContent = '—'));
  }
  if (root.querySelector('[data-fx]') && p.currency && p.currency !== 'KRW') {
    krwPer(p.currency, ctrl.signal)
      .then((per) => {
        const fx = fxLabel(p.currency, per);
        root.querySelector('[data-fx]').textContent = `${fmtNum(fx.krw)}원`;
        root.querySelector('[data-fx-note]').innerHTML = `${fmtNum(fx.unit)} ${esc(p.currency)} (${esc(fx.name)}) · <a class="link-u" href="https://www.exchangerate-api.com" target="_blank" rel="noopener">Rates by Exchange Rate API</a>`;
      })
      .catch(() => alive && (root.querySelector('[data-fx]').textContent = '—'));
  }

  /* 체크리스트 (기장만) */
  const updateReady = (list) => {
    const done = list.filter(([, d]) => d).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    root.querySelectorAll('.ready-ring').forEach((ring) => {
      ring.style.setProperty('--v', pct);
      ring.querySelector('b').innerHTML = `${pct}<small>%</small>`;
    });
    const c = root.querySelector('.count-ready b');
    if (c) c.textContent = `${done}/${list.length}`;
    return pct;
  };
  const checklist = (p.checklist || []).map(([t, d]) => [t, d]);
  const onChange = async (e) => {
    const box = e.target.closest('[data-check]');
    if (!box) return;
    const k = Number(box.dataset.check);
    checklist[k][1] = box.checked;
    const pct = updateReady(checklist);
    if (box.checked) navigator.vibrate?.(8);
    if (pct === 100 && box.checked) toast('준비 완료! 이제 떠나기만 하면 돼요', '✈');
    const ok = await onCheck?.(k, box.checked, checklist[k][0]);
    if (ok === false && alive) {
      box.checked = !box.checked;
      checklist[k][1] = box.checked;
      updateReady(checklist);
    }
  };
  root.querySelector('.checklist')?.addEventListener('change', onChange);

  /* 준비물 더하기·지우기·고치기 (기장): 저장하면 화면이 새 목록으로 다시 그려진다 */
  const prepBox = root.querySelector('.prep-check');
  const onPrepClick = async (e) => {
    if (!onChecklist) return;
    const del = e.target.closest('[data-ckdel]');
    const ed = e.target.closest('[data-ckedit]');
    const sug = e.target.closest('[data-cksug]');
    if (sug) {
      sug.disabled = true;
      if (!(await onChecklist({ type: 'add', text: sug.dataset.cksug }))) sug.disabled = false;
      return;
    }
    if (del) {
      const k = Number(del.dataset.ckdel);
      const li = del.closest('li');
      li.classList.add('ck-going');
      if (!(await onChecklist({ type: 'remove', index: k, text: checklist[k][0] }))) li.classList.remove('ck-going');
      return;
    }
    if (ed) {
      const k = Number(ed.dataset.ckedit);
      const li = ed.closest('li');
      if (li.querySelector('.ck-edit')) return;
      const span = li.querySelector('.check-text');
      const input = document.createElement('input');
      input.className = 'inp ck-edit';
      input.maxLength = 80;
      input.value = checklist[k][0];
      input.setAttribute('aria-label', '준비할 것 고치기');
      span.hidden = true;
      span.after(input);
      input.focus();
      input.select();
      let done = false;
      const finish = async (save) => {
        if (done) return;
        done = true;
        const to = input.value.trim();
        if (save && to && to !== checklist[k][0]) {
          if (await onChecklist({ type: 'rename', index: k, from: checklist[k][0], to })) return;
        }
        input.remove();
        span.hidden = false;
      };
      // 라벨 안이라 누르면 체크가 바뀌지 않게
      input.addEventListener('click', (ev) => ev.preventDefault());
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.isComposing) {
          ev.preventDefault();
          finish(true);
        } else if (ev.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', () => finish(true));
    }
  };
  const onPrepSubmit = async (e) => {
    const f = e.target.closest('.ck-add');
    if (!f || !onChecklist) return;
    e.preventDefault();
    const text = f.ck.value.trim();
    if (!text) return f.ck.focus();
    f.ck.disabled = true;
    const ok = await onChecklist({ type: 'add', text });
    f.ck.disabled = false;
    if (ok) f.ck.value = '';
    f.ck.focus();
  };
  prepBox?.addEventListener('click', onPrepClick);
  prepBox?.addEventListener('submit', onPrepSubmit);
  cleanups.push(() => {
    prepBox?.removeEventListener('click', onPrepClick);
    prepBox?.removeEventListener('submit', onPrepSubmit);
  });

  return () => {
    alive = false;
    root.querySelector('.checklist')?.removeEventListener('change', onChange);
    cleanups.forEach((fn) => fn());
  };
}
