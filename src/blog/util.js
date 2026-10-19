// 자주 쓰는 작은 도구들

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/** 템플릿 리터럴 헬퍼: 배열은 이어 붙이고 null/false/undefined는 지운다 (이스케이프하지 않음) */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) {
      const v = vals[i];
      out += Array.isArray(v) ? v.join('') : v == null || v === false ? '' : v;
    }
  });
  return out;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** 방금(160ms 안) 스크롤했는지. 캔버스 애니메이션은 이때 한 박자 쉬어서 스크롤에 프레임을 양보한다 */
let lastScrollAt = 0;
if (typeof window !== 'undefined') addEventListener('scroll', () => (lastScrollAt = performance.now()), { passive: true, capture: true });
export const scrollBusy = () => performance.now() - lastScrollAt < 160;

// 서버에서 그릴 때는 window가 없다. 그때는 "움직임 있음, 마우스 없음"으로 본다
export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/** 서울 기준 오늘 'YYYY-MM-DD'. 서버(UTC)와 브라우저(KST)가 같은 D-day를 보도록 늘 서울 날짜로 계산한다 */
export const seoulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
export const seoulMonth = () => Number(seoulToday().slice(5, 7));

/** 문자열 → 32bit 해시 (cyrb53 축약) */
export function hashStr(str) {
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

/** 시드 고정 난수 (mulberry32) */
export function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  const r = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (min, max) => min + r() * (max - min);
  r.int = (min, max) => Math.floor(r.range(min, max + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

/* ---------- 지리 ---------- */
const R = 6371;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

/** 두 좌표 사이 대권 거리 (km) */
export function haversine([lat1, lon1], [lat2, lon2]) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 대권 항로를 n개 점으로 (구면 선형 보간) */
export function greatCircle([lat1, lon1], [lat2, lon2], n = 64) {
  const p1 = [toRad(lat1), toRad(lon1)];
  const p2 = [toRad(lat2), toRad(lon2)];
  const v = ([la, lo]) => [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const a = v(p1);
  const b = v(p2);
  const dot = clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
  const w = Math.acos(dot);
  if (w < 1e-6) return [[lat1, lon1], [lat2, lon2]];
  const pts = [];
  let prevLon = null;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s1 = Math.sin((1 - t) * w) / Math.sin(w);
    const s2 = Math.sin(t * w) / Math.sin(w);
    const x = s1 * a[0] + s2 * b[0];
    const y = s1 * a[1] + s2 * b[1];
    const z = s1 * a[2] + s2 * b[2];
    const lat = toDeg(Math.atan2(z, Math.hypot(x, y)));
    let lon = toDeg(Math.atan2(y, x));
    // 날짜변경선을 넘을 때 경도가 튀지 않게 이어 붙인다
    if (prevLon != null) {
      while (lon - prevLon > 180) lon -= 360;
      while (lon - prevLon < -180) lon += 360;
    }
    prevLon = lon;
    pts.push([lat, lon]);
  }
  return pts;
}

/* ---------- 포맷 ---------- */
/** 'YYYY-MM-DD'는 그 지역의 자정으로 읽는다. new Date('2026-09-28')는 UTC 자정이라
    미국 같은 UTC− 지역에선 하루 전 날짜로 보인다 */
export const toDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v));

export const fmtDate = (iso, opts = { year: 'numeric', month: 'long', day: 'numeric' }) =>
  new Intl.DateTimeFormat('ko-KR', opts).format(toDate(iso));

export const fmtDot = (iso) => {
  const d = toDate(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export const fmtNum = (n, digits = 0) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(n);
export const fmtWon = (n) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);

const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
export function relTime(date) {
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  for (const [unit, sec] of units) {
    if (Math.abs(diff) >= sec || unit === 'second') return rtf.format(Math.round(diff / sec), unit);
  }
}

/** 로컬 날짜 'YYYY-MM-DD' (toISOString은 UTC라 한국 자정 근처에서 하루 밀린다) */
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDaysIso = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000) + 1;

export function readingTime(text) {
  // 한국어는 분당 약 500자로 계산
  const chars = text.replace(/\s+/g, '').length;
  return Math.max(1, Math.round(chars / 500));
}

/* ---------- 함수 도구 ---------- */
export function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function rafThrottle(fn) {
  let queued = false;
  let lastArgs;
  return (...args) => {
    lastArgs = args;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      fn(...lastArgs);
    });
  };
}

/** 뷰포트에 들어오면 한 번 실행 */
export function onceVisible(el, fn, opts = { rootMargin: '0px 0px -10% 0px' }) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        io.unobserve(e.target);
        fn(e.target);
      }
    });
  }, opts);
  io.observe(el);
  return () => io.disconnect();
}

/* ---------- 한글 초성 검색 + 퍼지 매칭 ---------- */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function choseong(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}
const isChoOnly = (q) => /^[ㄱ-ㅎ\s]+$/.test(q);

/**
 * 부분 수열 퍼지 매칭. 점수와 일치 위치를 돌려준다.
 * 연속으로 맞거나 단어 첫 글자에서 맞으면 가산점.
 */
export function fuzzy(query, text) {
  if (!query) return { score: 0, idx: [] };
  const q = query.toLowerCase().replace(/\s+/g, '');
  const src = isChoOnly(q) ? choseong(text).toLowerCase() : text.toLowerCase();
  let score = 0;
  let qi = 0;
  let prev = -2;
  const idx = [];
  for (let i = 0; i < src.length && qi < q.length; i++) {
    if (src[i] === ' ') continue;
    if (src[i] === q[qi]) {
      let s = 1;
      if (prev === i - 1) s += 3;
      if (i === 0 || /[\s\-·,(]/.test(src[i - 1])) s += 2;
      score += s;
      idx.push(i);
      prev = i;
      qi++;
    }
  }
  if (qi < q.length) return null;
  // 짧은 텍스트, 앞쪽 일치를 선호
  score += Math.max(0, 10 - idx[0]) * 0.3 - src.length * 0.01;
  if (src.includes(q)) score += 8;
  return { score, idx };
}

export function highlight(text, idx) {
  if (!idx?.length) return esc(text);
  const set = new Set(idx);
  return [...text].map((ch, i) => (set.has(i) ? `<mark>${esc(ch)}</mark>` : esc(ch))).join('');
}

/* ---------- 색 ---------- */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(lerp(v, B[i], t)));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Blob을 파일로 내려받기 */
export function download(filename, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
