// 스플릿 플랩(공항 출발 전광판) 엔진.
// 글자 칸 하나 = 정지된 위·아래 반쪽 + 넘어가는 위·아래 날개.
// 한 단계: 위 날개(이전 글자)가 0→-90°로 넘어가며 새 글자 윗부분을 드러내고,
//          아래 날개(새 글자)가 90→0°로 떨어지며 이전 글자 아랫부분을 덮는다.
// 수백 칸을 requestAnimationFrame 루프 하나로 돌린다. 소리는 WebAudio로 합성한다.
import { reducedMotion } from './util.js';

export const CHARSETS = {
  latin: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  digits: ' 0123456789',
  hangul: '가나다라마바사아자차카타파하예약완료준비중계획언젠가출발도착탑승',
  mixed: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-',
};

export function createFlapEngine() {
  const active = new Set();
  const still = reducedMotion();
  let raf = 0;
  let last = 0;
  let clicks = 0;
  let audio = null;
  let soundOn = false;

  function setStatic(f, ch) {
    f.cur = ch;
    f.t.textContent = f.b.textContent = f.ft.textContent = f.fb.textContent = ch;
    f.foldT.style.transform = '';
    f.foldB.style.transform = '';
    f.el.classList.remove('flipping'); // 멈춘 칸은 날개를 숨긴다 → 3D 레이어가 남지 않는다
    f.el.classList.toggle('blank', ch === ' ');
    f.el.classList.toggle('hg', /[가-힣]/.test(ch));
  }

  function makeFlap(parent) {
    const el = document.createElement('span');
    el.className = 'flap blank';
    el.innerHTML =
      '<span class="fh fh-t"><i> </i></span><span class="fh fh-b"><i> </i></span>' +
      '<span class="fh fh-t fold-t"><i> </i></span><span class="fh fh-b fold-b"><i> </i></span>';
    const halves = [...el.children];
    const f = {
      el,
      t: halves[0].firstChild,
      b: halves[1].firstChild,
      ft: halves[2].firstChild,
      fb: halves[3].firstChild,
      foldT: halves[2],
      foldB: halves[3],
      cur: ' ',
      queue: [],
      p: 0,
      delay: 0,
      dur: 70,
    };
    setStatic(f, ' ');
    parent.append(el);
    return f;
  }

  function tick(now) {
    const dt = Math.min(120, last ? now - last : 16);
    last = now;
    for (const f of active) {
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      if (f.p === 0) {
        const next = f.queue[0];
        f.t.textContent = next;
        f.ft.textContent = f.cur;
        f.b.textContent = f.cur;
        f.fb.textContent = next;
        f.el.classList.remove('blank');
        f.el.classList.add('flipping');
        f.el.classList.toggle('hg', /[가-힣]/.test(next) || /[가-힣]/.test(f.cur));
        f.foldB.style.transform = 'rotateX(90deg)';
      }
      f.p += dt / f.dur;
      if (f.p < 0.5) {
        f.foldT.style.transform = `rotateX(${(-f.p * 180).toFixed(1)}deg)`;
      } else {
        f.foldT.style.transform = 'rotateX(-90deg)';
        f.foldB.style.transform = `rotateX(${(90 - (f.p - 0.5) * 180).toFixed(1)}deg)`;
      }
      if (f.p >= 1) {
        setStatic(f, f.queue.shift());
        f.p = 0;
        clicks++;
        if (!f.queue.length) active.delete(f);
      }
    }
    if (clicks && soundOn && audio) playClick(clicks);
    clicks = 0;
    if (active.size) raf = requestAnimationFrame(tick);
    else {
      raf = 0;
      last = 0;
    }
  }

  function initAudio() {
    if (audio) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const len = Math.round(ctx.sampleRate * 0.014);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    audio = { ctx, buf };
  }

  let lastClick = 0;
  function playClick(n) {
    const { ctx, buf } = audio;
    if (ctx.currentTime - lastClick < 0.018) return;
    lastClick = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500 + Math.random() * 1500;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.32, 0.05 + n * 0.01);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start();
  }

  /** 글자 n칸짜리 줄 */
  function line(container, length, charset = 'latin') {
    const flaps = Array.from({ length }, () => makeFlap(container));
    const pool = CHARSETS[charset] || charset;
    return {
      flaps,
      get text() {
        return flaps.map((f) => f.queue.at(-1) ?? f.cur).join('');
      },
      set(text, { delay = 0, stagger = 26, spins = [3, 9], force = false, dur = 66 } = {}) {
        const chars = [...String(text ?? '')];
        flaps.forEach((f, j) => {
          const target = chars[j] ?? ' ';
          if (still) {
            active.delete(f);
            f.queue = [];
            f.p = 0;
            setStatic(f, target);
            return;
          }
          const finalNow = f.queue.length ? f.queue.at(-1) : f.cur;
          if (target === finalNow && !force) return;
          const n = spins[0] + Math.floor(Math.random() * (spins[1] - spins[0] + 1));
          const q = [];
          for (let k = 0; k < n; k++) q.push(pool[Math.floor(Math.random() * pool.length)]);
          q.push(target);
          if (f.p > 0) f.queue = [f.queue[0], ...q];
          else {
            f.queue = q;
            f.delay = delay + j * stagger + Math.random() * 30;
          }
          f.dur = dur * (0.85 + Math.random() * 0.3);
          active.add(f);
        });
        if (!raf && active.size) raf = requestAnimationFrame(tick);
      },
    };
  }

  return {
    line,
    get busy() {
      return active.size > 0;
    },
    setSound(on) {
      soundOn = on;
      if (on) {
        initAudio();
        audio?.ctx.resume();
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      active.clear();
      audio?.ctx.close();
    },
  };
}

/**
 * 출발 전광판. columns: [{ key, label, ko, len, charset }]
 * 열 폭은 칸 수로 정하고, 컨테이너 폭에 맞춰 칸 크기(--fw)를 계산한다.
 * 좁아지면 optional 열부터 숨긴다.
 */
export function createBoard(root, { columns, rows, engine }) {
  root.innerHTML = `
    <div class="sf-cols" role="row">${columns.map((c) => `<span class="sf-col col-${c.key}" style="--len:${c.len}" role="columnheader">${c.label}<small>${c.ko}</small></span>`).join('')}</div>
    <div class="sf-rows"></div>`;
  const rowsEl = root.querySelector('.sf-rows');
  const list = Array.from({ length: rows }, (_, i) => {
    const el = document.createElement('div');
    el.className = 'sf-row';
    el.setAttribute('role', 'row');
    el.dataset.i = i;
    const lines = {};
    columns.forEach((c) => {
      const cell = document.createElement('span');
      cell.className = `sf-cell col-${c.key}`;
      cell.style.setProperty('--len', c.len);
      cell.setAttribute('role', 'cell');
      el.append(cell);
      lines[c.key] = engine.line(cell, c.len, c.charset);
    });
    rowsEl.append(el);
    return { el, lines, data: null };
  });

  // 폭 맞추기
  const fit = () => {
    const w = root.clientWidth;
    let cols = columns;
    let fw = 0;
    for (const drop of [[], ...columns.filter((c) => c.optional).map((_, i, arr) => arr.slice(0, i + 1))]) {
      const vis = columns.filter((c) => !drop.includes(c));
      const boxes = vis.reduce((s, c) => s + c.len, 0);
      const gaps = (vis.length - 1) * 14;
      fw = Math.floor((w - gaps) / boxes) - 2;
      cols = vis;
      if (fw >= 15) break;
    }
    root.style.setProperty('--fw', `${Math.max(9, Math.min(34, fw))}px`);
    columns.forEach((c) => root.classList.toggle(`hide-${c.key}`, !cols.includes(c)));
  };
  const ro = new ResizeObserver(fit);
  ro.observe(root);
  fit();

  const api = {
    rows: list,
    setRow(i, data, opts = {}) {
      const row = list[i];
      if (!row) return;
      row.data = data || null;
      row.el.dataset.id = data?.id || '';
      row.el.className = `sf-row${data?.tone ? ' tone-' + data.tone : ''}${data?.id ? ' has-id' : ''}`;
      row.el.tabIndex = data?.id ? 0 : -1;
      if (data?.label) row.el.setAttribute('aria-label', data.label);
      else row.el.removeAttribute('aria-label');
      columns.forEach((c, ci) => row.lines[c.key].set(data?.cells?.[c.key] ?? '', { ...opts, delay: (opts.delay || 0) + ci * 40 }));
    },
    setRows(data, opts = {}) {
      list.forEach((_, i) => api.setRow(i, data[i], { ...opts, delay: (opts.delay || 0) + i * 110 }));
    },
    destroy() {
      ro.disconnect();
    },
  };
  return api;
}
