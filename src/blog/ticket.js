// 탑승권 카드: 위조방지 무늬, 항로 위를 나는 비행기, 홀로그램, 찢어지는 스텁 (moon.log ui/ticket.js에서 옮김)
// ticketHTML 등 문자열 함수는 서버에서도 돈다. bindTickets만 브라우저 전용.
import { esc, fmtDot, fmtWon, clamp, easeOutCubic, reducedMotion, seoulMonth } from './util.js';
import { STATUS, SCOPE, totalBudget, travelField, daysUntil, flagOf, nights, readiness, guilloche, barcode, ARC_PATH, sceneUrl, ticketKind } from './plans-lib.js';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export const planCover = (p) => sceneUrl(p);

export function ddayLabel(p) {
  if (p.status === 'done') return { big: '✓', small: '다녀왔어요' };
  const d = daysUntil(p.target);
  if (d == null) return { big: '∞', small: '시간 나면' };
  if (d > 0) return { big: `D-${d}`, small: '출발까지' };
  if (d === 0) return { big: 'D-DAY', small: '오늘 출발!' };
  return { big: `D+${-d}`, small: '다녀왔나요?' };
}

export function monthsStrip(months = [], { big = false } = {}) {
  const now = seoulMonth();
  return `<ol class="months${big ? ' months--big' : ''}" role="list" aria-label="가기 좋은 달: ${months.length ? months.join(', ') + '월' : '아무 때나'}">${MONTHS.map(
    (m, i) => `<li class="${months.includes(i + 1) ? 'best' : ''}${now === i + 1 ? ' now' : ''}"><span>${big ? i + 1 : m}</span></li>`
  ).join('')}</ol>`;
}

export function readyRing(pct, size = 44) {
  return `<span class="ready-ring" style="--size:${size}px;--v:${pct}" role="img" aria-label="준비 ${pct}%">
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle class="track" cx="18" cy="18" r="15.9155"/><circle class="bar" pathLength="100" cx="18" cy="18" r="15.9155"/></svg>
    <b>${pct}<small>%</small></b></span>`;
}


export function ticketHTML(p, { big = false, fit = null, mine = false, preview = false, open = 0 } = {}) {
  const st = STATUS[p.status] || STATUS.dream;
  const dd = ddayLabel(p);
  const ready = readiness(p);
  const tf = travelField(p);
  const chip = `${p.sample ? '예시 · ' : ''}${p.scope !== 'abroad' ? `${SCOPE[p.scope].ko} · ` : ''}${st.ko}`;
  const tk = ticketKind(p);
  return `<article class="ticket tone-${p.status}${big ? ' ticket--big' : ''}${mine ? ' is-mine' : ''}" data-slug="${esc(p.id)}" data-reveal>
    <a ${preview ? 'tabindex="-1" aria-hidden="true"' : `href="${esc(p.href)}"`} class="ticket-link" data-tilt="6" data-cursor="${big || preview ? '' : p.status === 'done' ? '추억' : '탑승'}" aria-label="${esc(p.title)} 계획 보기${p.status === 'done' ? ' (다녀옴)' : ''}">
      <div class="tk-main">
        ${guilloche(p.id)}
        <header class="tk-head">
          <span class="tk-brand mono">${tk.brand}</span>
          ${fit ? `<span class="tk-fit${fit.fit ? ' ok' : ''}">${fit.fit ? '딱 맞아요 ' : '적합 '}${fit.score}%</span>` : ''}
          ${open ? `<span class="tk-open" title="검토를 기다리는 제안">📮 제안 ${open}</span>` : ''}
          <span class="tk-chip">${esc(chip)}</span>
        </header>
        <div class="tk-route">
          <div class="tk-port"><b>${tk.from[0]}</b><span>${tk.from[1]}</span></div>
          <svg class="tk-arc" viewBox="0 0 200 52" aria-hidden="true">
            <path class="tk-arc-base" d="${ARC_PATH}"/>
            <path class="tk-arc-trail" d="${ARC_PATH}" pathLength="1"/>
            <g class="tk-plane${tk.upright ? ' upright' : ''}" transform="translate(14 46)${tk.upright ? ' scale(0.9)' : ' rotate(-48)'}"><path d="${tk.icon}" fill-rule="evenodd"/></g>
          </svg>
          <div class="tk-port to"><b>${esc(tk.to)}</b><span>${esc(p.place)}</span></div>
        </div>
        <${big ? 'h1' : 'h3'} class="tk-title"><span class="tk-flag" aria-hidden="true">${p.scope === 'abroad' || p.countryCode ? flagOf(p.countryCode) : SCOPE[p.scope].icon}</span>${esc(p.title)}</${big ? 'h1' : 'h3'}>
        <dl class="tk-fields">
          <div><dt>출발</dt><dd>${p.target ? fmtDot(p.target) : '언젠가'}</dd></div>
          <div><dt>기간${(p.travelers || 1) > 1 ? ` · ${p.travelers}명` : ''}</dt><dd>${nights(p.days)}</dd></div>
          <div><dt>예산${(p.travelers || 1) > 1 ? ' · 1인' : ''}</dt><dd class="num">${fmtWon(totalBudget(p))}</dd></div>
          <div><dt>${tf.dt}</dt><dd>${tf.dd}</dd></div>
        </dl>
        ${monthsStrip(p.months)}
        ${p.status === 'booked' ? `<span class="tk-stamp" aria-hidden="true">CONFIRMED<small>예약 완료</small></span>` : ''}
        ${p.status === 'done' ? `<span class="tk-stamp tk-stamp--arrived" aria-hidden="true">ARRIVED<small>도착 · 다녀옴</small></span>` : ''}
      </div>
      <div class="tk-stub">
        <img class="tk-photo" src="${planCover(p)}" alt="" loading="lazy" decoding="async">
        <div class="tk-gate"><span class="eyebrow">Gate</span><b class="mono">${String(p.priority ?? 0).padStart(2, '0')}</b></div>
        <div class="tk-dday"><b class="h-serif">${dd.big}</b><span>${dd.small}</span></div>
        <div class="tk-ready">${readyRing(ready.pct)}<span>준비</span></div>
        ${barcode(p.id)}
      </div>
      <span class="glare"></span>
      <span class="tk-holo" aria-hidden="true"></span>
    </a>
  </article>`;
}

/** 호버하면 비행기가 항로를 따라 날고, 누르면 스텁이 찢어진 뒤 이동 */
export function bindTickets(root, navigate) {
  const anims = new WeakMap();
  const fly = (ticket, to) => {
    const path = ticket.querySelector('.tk-arc-base');
    const trail = ticket.querySelector('.tk-arc-trail');
    const plane = ticket.querySelector('.tk-plane');
    if (!path || !plane) return;
    const len = path.getTotalLength();
    const st = anims.get(ticket) || { p: 0, raf: 0 };
    cancelAnimationFrame(st.raf);
    const from = st.p;
    const t0 = performance.now();
    const dur = reducedMotion() ? 1 : 1300 * Math.abs(to - from) + 1;
    const step = (now) => {
      const k = clamp((now - t0) / dur, 0, 1);
      st.p = from + (to - from) * easeOutCubic(k);
      const a = path.getPointAtLength(st.p * len);
      const b = path.getPointAtLength(Math.min(len, st.p * len + 1));
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      // 기차·걷는 사람은 기울이지 않고 똑바로 (비행기만 항로 방향으로 돈다)
      plane.setAttribute('transform', plane.classList.contains('upright') ? `translate(${a.x.toFixed(2)} ${(a.y - 4).toFixed(2)}) scale(0.9)` : `translate(${a.x.toFixed(2)} ${a.y.toFixed(2)}) rotate(${ang.toFixed(1)})`);
      trail.style.strokeDashoffset = String(1 - st.p);
      if (k < 1) st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
    anims.set(ticket, st);
  };

  const over = (e) => {
    const t = e.target.closest?.('.ticket');
    if (t && !t.contains(e.relatedTarget)) fly(t, 1);
  };
  const out = (e) => {
    const t = e.target.closest?.('.ticket');
    if (t && !t.contains(e.relatedTarget)) fly(t, 0);
  };
  const click = (e) => {
    const a = e.target.closest('.ticket-link');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const ticket = a.closest('.ticket');
    e.preventDefault();
    e.stopPropagation();
    if (ticket.classList.contains('ticket--big') || !a.getAttribute('href')) return;
    const href = a.getAttribute('href');
    const stub = ticket.querySelector('.tk-stub');
    if (reducedMotion() || !stub.animate) return navigate(href);
    // 스텁은 탑승권 안에서 움직이면 잘리고, 떠난 자리에 탑승권 바탕(흰색)이 남는다.
    // 그래서 복제본을 맨 위 층에 띄워 날리고, 원래 자리는 비운다 (바탕·그림자도 본문까지만)
    const r = stub.getBoundingClientRect();
    const fly = document.createElement('div');
    fly.className = `tk-tear tone-${[...ticket.classList].find((c) => c.startsWith('tone-'))?.slice(5) || 'dream'}`;
    // 좁은 화면에선 탑승권이 세로라 스텁이 아래에 붙는다 → 아래쪽 모서리만 둥글게
    const vertical = r.width > ticket.getBoundingClientRect().width * 0.8;
    Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: vertical ? '0 0 22px 22px' : '0 22px 22px 0' });
    fly.append(stub.cloneNode(true));
    document.body.append(fly);
    ticket.classList.add('tearing');
    fly
      .animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: 'translate(10px, 6px) rotate(4deg)', opacity: 1, offset: 0.35 },
          { transform: 'translate(70px, 110px) rotate(20deg)', opacity: 0 },
        ],
        { duration: 460, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }
      )
      .finished.then(() => {
        fly.remove();
        if (ticket.isConnected) navigate(href);
      });
  };
  root.addEventListener('pointerover', over);
  root.addEventListener('pointerout', out);
  root.addEventListener('click', click);
  return () => {
    root.removeEventListener('pointerover', over);
    root.removeEventListener('pointerout', out);
    root.removeEventListener('click', click);
  };
}

/** 예산 도넛 (moon.log ui/parts.js) */
export function donut(budget) {
  const entries = Object.entries(budget).filter(([, v]) => Number(v) > 0);
  const total = entries.reduce((s, [, v]) => s + Number(v), 0);
  if (!total) return `<div class="donut-empty muted">아직 예산을 적지 않았어요.</div>`;
  let acc = 0;
  const gap = 0.6;
  const segs = entries.map(([, v], i) => {
    const pct = (v / total) * 100;
    const seg = `<circle class="dn-seg" data-i="${i}" cx="21" cy="21" r="15.9155" pathLength="100" style="--c:var(--c${(i % 5) + 1});--len:${Math.max(0, pct - gap)};--off:${-acc}"/>`;
    acc += pct;
    return seg;
  });
  const legend = entries
    .map(
      ([k, v], i) =>
        `<li data-i="${i}"><i style="background:var(--c${(i % 5) + 1})"></i><span>${esc(k)}</span><b class="num">${fmtWon(v)}</b><em class="num">${Math.round((v / total) * 100)}%</em></li>`
    )
    .join('');
  return `<div class="donut" data-total="${total}">
    <div class="donut-chart">
      <svg viewBox="0 0 42 42" role="img" aria-label="총 경비 ${fmtWon(total)}">${segs.join('')}</svg>
      <div class="donut-center"><span class="dn-label eyebrow">Total</span><strong class="dn-value num">${fmtWon(total)}</strong></div>
    </div>
    <ul class="donut-legend" role="list">${legend}</ul>
  </div>`;
}

export function bindDonut(root) {
  root.querySelectorAll('.donut').forEach((d) => {
    if (d.dataset.bound) return;
    d.dataset.bound = '1';
    const label = d.querySelector('.dn-label');
    const value = d.querySelector('.dn-value');
    const items = [...d.querySelectorAll('.donut-legend li')];
    const segs = [...d.querySelectorAll('.dn-seg')];
    const total = Number(d.dataset.total);
    const set = (i) => {
      d.classList.toggle('focus', i != null);
      segs.forEach((s, k) => s.classList.toggle('on', k === i));
      items.forEach((s, k) => s.classList.toggle('on', k === i));
      if (i == null) {
        label.textContent = 'Total';
        value.textContent = fmtWon(total);
      } else {
        label.textContent = items[i].querySelector('span').textContent;
        value.textContent = items[i].querySelector('b').textContent;
      }
    };
    [...segs, ...items].forEach((el) => {
      el.addEventListener('pointerenter', () => set(Number(el.dataset.i)));
      el.addEventListener('pointerleave', () => set(null));
    });
  });
}
