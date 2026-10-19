// 생성형 아트. 사진이 없어도 글마다 고유한 표지와 풍경을 시드로 그린다.
// 결과는 SVG data URI라서 <img>, 라이트박스, 뷰 트랜지션에 그대로 쓸 수 있다.
// 실제 사진을 쓰려면 데이터에 image: 'photos/xxx.jpg'를 넣으면 그쪽이 우선한다.
import { rng, mixHex } from './util.js';

const cache = new Map();
const memo = (key, fn) => {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
};
const uri = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
const svgDoc = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
const f = (n) => Math.round(n * 10) / 10;

export const PALETTES = {
  ember: ['#F2E8D8', '#E8472B', '#1E2A44', '#F2B33D'],
  ocean: ['#0F2A3D', '#F4E9D8', '#2F8FB0', '#F06A3B'],
  moss: ['#E9E4D0', '#2F4A36', '#C9A227', '#B3542E'],
  dusk: ['#2A1B3D', '#F28C6B', '#F6D6A8', '#6B4C9A'],
  noir: ['#141414', '#EDE6D6', '#D9432F', '#8A8478'],
  sakura: ['#F6E3E1', '#C2374E', '#2B2B3A', '#E9A6A6'],
  desert: ['#E9C99B', '#8C3B1F', '#24364A', '#F4E4C1'],
  mint: ['#DDEFE6', '#145C5C', '#F2735B', '#F6D57A'],
  cobalt: ['#E8E6E1', '#1F3FBF', '#F25C2E', '#111111'],
  plum: ['#3B1F2B', '#E7C9A9', '#C4485A', '#8FB3A3'],
  sand: ['#EFE3CF', '#2E5E4E', '#D96C3B', '#2A2A2A'],
  space: ['#0B0D1A', '#F2C14E', '#5C6BC0', '#EDEAE0'],
};

/* ==========================================================================
   리뷰 표지 (600×800)
   ========================================================================== */
const W = 600;
const H = 800;

function bookCover(r, [bg, a, b, c]) {
  // 바우하우스 타일 포스터: 3×4 격자 칸마다 도형 하나
  const cols = 3;
  const rows = 4;
  const s = 200;
  const colors = [bg, a, b, c];
  let body = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const X = x * s;
      const Y = y * s;
      const cx = X + s / 2;
      const cy = Y + s / 2;
      const cellBg = r.chance(0.55) ? bg : r.pick(colors);
      const fg = r.pick(colors.filter((k) => k !== cellBg));
      const rot = r.int(0, 3) * 90;
      body += `<rect x="${X}" y="${Y}" width="${s}" height="${s}" fill="${cellBg}"/>`;
      const kind = r.int(0, 6);
      if (kind === 0) {
        // 사분원
        const dx = r.pick([1, -1]);
        const dy = r.pick([1, -1]);
        const ox = dx > 0 ? X : X + s;
        const oy = dy > 0 ? Y : Y + s;
        body += `<path d="M${ox} ${oy} L${ox + dx * s} ${oy} A${s} ${s} 0 0 ${dx * dy > 0 ? 1 : 0} ${ox} ${oy + dy * s} Z" fill="${fg}"/>`;
      } else if (kind === 1) {
        body += `<path transform="rotate(${rot} ${cx} ${cy})" d="M${X} ${Y + s} A${s / 2} ${s / 2} 0 0 1 ${X + s} ${Y + s} Z" fill="${fg}"/>`;
      } else if (kind === 2) {
        body += `<circle cx="${cx}" cy="${cy}" r="${s * 0.38}" fill="${fg}"/>`;
        if (r.chance(0.5)) body += `<circle cx="${cx}" cy="${cy}" r="${s * 0.14}" fill="${cellBg}"/>`;
      } else if (kind === 3) {
        body += `<path transform="rotate(${rot} ${cx} ${cy})" d="M${X} ${Y} L${X + s} ${Y} L${X} ${Y + s} Z" fill="${fg}"/>`;
      } else if (kind === 4) {
        for (let i = 0; i < 4; i++) body += `<rect transform="rotate(${rot} ${cx} ${cy})" x="${X}" y="${Y + 18 + i * 48}" width="${s}" height="20" fill="${fg}"/>`;
      } else if (kind === 5) {
        body += `<rect x="${X + s * 0.22}" y="${Y + s * 0.22}" width="${s * 0.56}" height="${s * 0.56}" fill="${fg}" transform="rotate(45 ${cx} ${cy})"/>`;
      } else {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) body += `<circle cx="${X + 25 + i * 50}" cy="${Y + 25 + j * 50}" r="9" fill="${fg}"/>`;
      }
    }
  }
  return body;
}

function filmCover(r, [bg, a, b, c]) {
  // 레트로 선셋 포스터
  const sx = r.range(180, 420);
  const sy = r.range(330, 430);
  const sr = r.range(140, 200);
  const horizon = 560;
  const dark = mixHex(bg, '#000000', 0.35);
  let defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${dark}"/><stop offset="1" stop-color="${mixHex(bg, a, 0.35)}"/></linearGradient>
  <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}"/><stop offset="1" stop-color="${a}"/></linearGradient>
  <radialGradient id="glow"><stop offset="0" stop-color="${c}" stop-opacity=".45"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
  let body = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  for (let i = 0; i < 60; i++) body += `<circle cx="${f(r.range(0, W))}" cy="${f(r.range(0, horizon - 120))}" r="${f(r.range(0.6, 2))}" fill="#fff" opacity="${f(r.range(0.2, 0.8))}"/>`;
  body += `<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(sr * 2.2)}" fill="url(#glow)"/>`;
  body += `<circle cx="${f(sx)}" cy="${f(sy)}" r="${f(sr)}" fill="url(#sun)"/>`;
  // 태양을 가로로 자르는 띠
  for (let i = 0; i < 7; i++) {
    const y = sy + sr * 0.1 + i * (sr * 0.13);
    body += `<rect x="0" y="${f(y)}" width="${W}" height="${f(2 + i * 2.6)}" fill="${mixHex(bg, a, 0.35)}"/>`;
  }
  // 산 실루엣 2겹
  [0.55, 0.9].forEach((t, k) => {
    const pts = [];
    let y = horizon - r.range(40, 120) * (1 - k * 0.4);
    for (let x = 0; x <= W; x += 30) {
      y += r.range(-26, 26);
      y = Math.min(horizon - 10, Math.max(horizon - 220 + k * 60, y));
      pts.push(`L${x} ${f(y)}`);
    }
    body += `<path d="M0 ${horizon} ${pts.join(' ')} L${W} ${horizon} Z" fill="${mixHex(b, '#000000', t * 0.5)}"/>`;
  });
  body += `<rect y="${horizon}" width="${W}" height="${H - horizon}" fill="${mixHex(b, '#000000', 0.55)}"/>`;
  // 수면 반사
  for (let i = 0; i < 9; i++) {
    const y = horizon + 12 + i * i * 3.2;
    const w = sr * (1.4 - i * 0.12) * r.range(0.8, 1.1);
    body += `<rect x="${f(sx - w / 2)}" y="${f(y)}" width="${f(w)}" height="${f(2 + i * 0.8)}" rx="2" fill="${c}" opacity="${f(0.7 - i * 0.06)}"/>`;
  }
  return { defs, body };
}

function musicCover(r, [bg, a, b, c]) {
  // 동심원 + 하프톤
  const cx = r.range(160, 440);
  const cy = r.range(220, 580);
  let body = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  // 하프톤 점밭
  const hx = r.pick([0, W]);
  const hy = r.pick([0, H]);
  for (let x = 10; x < W; x += 22) {
    for (let y = 10; y < H; y += 22) {
      const d = Math.hypot(x - hx, y - hy) / 900;
      const rad = Math.max(0, 8.5 * (1 - d * 1.4));
      if (rad > 0.6) body += `<circle cx="${x}" cy="${y}" r="${f(rad)}" fill="${b}" opacity=".9"/>`;
    }
  }
  const rings = r.int(9, 15);
  const cols = [a, c, b, a];
  for (let i = rings; i > 0; i--) {
    const rad = i * r.range(19, 25);
    body += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}" fill="none" stroke="${cols[i % cols.length]}" stroke-width="${f(r.range(3, 13))}"/>`;
  }
  body += `<circle cx="${f(cx)}" cy="${f(cy)}" r="44" fill="${a}"/><circle cx="${f(cx)}" cy="${f(cy)}" r="6" fill="${bg}"/>`;
  // 대각 사선
  const lx = r.range(0, W);
  body += `<path d="M${f(lx)} 0 L${f(lx + 260)} ${H}" stroke="${c}" stroke-width="3"/>`;
  return body;
}

function gameCover(r, [bg, a, b, c]) {
  // 좌우 대칭 픽셀 스프라이트 (아이덴티콘 방식)
  const n = 10;
  const px = 30;
  const ox = (W - n * px) / 2;
  const oy = 190;
  let body = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  for (let x = 0; x < W; x += 30) for (let y = 0; y < H; y += 30) body += `<rect x="${x + 13}" y="${y + 13}" width="3" height="3" fill="${b}" opacity=".35"/>`;
  const cells = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n / 2; x++) {
      const edge = Math.abs(x - n / 2) + Math.abs(y - n / 2) * 0.6;
      if (r() < 0.78 - edge * 0.05) {
        const col = r.chance(0.18) ? c : r.chance(0.3) ? b : a;
        cells.push([x, y, col], [n - 1 - x, y, col]);
      }
    }
  }
  body += `<rect x="${ox - 30}" y="${oy + n * px + 40}" width="${n * px + 60}" height="18" rx="9" fill="${b}" opacity=".25"/>`;
  cells.forEach(([x, y, col]) => (body += `<rect x="${ox + x * px}" y="${oy + y * px}" width="${px}" height="${px}" fill="${col}"/>`));
  // 계단식 지면
  let gx = 0;
  let gy = H - r.int(2, 4) * 30;
  while (gx < W) {
    const w = r.int(2, 5) * 30;
    body += `<rect x="${gx}" y="${gy}" width="${w}" height="${H - gy}" fill="${b}"/><rect x="${gx}" y="${gy}" width="${w}" height="10" fill="${c}"/>`;
    gx += w;
    gy = Math.min(H - 30, Math.max(H - 180, gy + r.pick([-30, 0, 30])));
  }
  for (let y = 0; y < H; y += 6) body += `<rect y="${y}" width="${W}" height="2" fill="#000" opacity=".06"/>`;
  return body;
}

function placeCover(r, [bg, a, b, c]) {
  // 아치 창 너머 하늘
  const aw = r.range(260, 340);
  const ax = (W - aw) / 2 + r.range(-60, 60);
  const top = r.range(180, 260);
  const bottom = 660;
  const rad = aw / 2;
  const defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
  let body = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`;
  body += `<circle cx="${f(ax + aw * r.range(0.3, 0.7))}" cy="${f(top + rad + r.range(40, 160))}" r="${f(r.range(40, 70))}" fill="${a}"/>`;
  body += `<path d="M0 ${bottom - 60} Q ${W / 2} ${bottom - 140} ${W} ${bottom - 50} L${W} ${H} L0 ${H} Z" fill="${mixHex(b, '#000', 0.25)}" opacity=".7"/>`;
  // 아치 구멍이 뚫린 벽 (evenodd)
  body += `<path fill-rule="evenodd" fill="${bg}" d="M0 0 H${W} V${H} H0 Z M${f(ax)} ${bottom} V${f(top + rad)} A${f(rad)} ${f(rad)} 0 0 1 ${f(ax + aw)} ${f(top + rad)} V${bottom} Z"/>`;
  // 벽 그림자
  body += `<path d="M${f(ax + aw)} ${bottom} V${f(top + rad)} L${W} ${f(top + rad - 120)} V${H} Z" fill="#000" opacity=".08"/>`;
  // 계단
  for (let i = 0; i < 4; i++) {
    const y = bottom + i * 35;
    body += `<rect x="${f(ax - i * 30)}" y="${y}" width="${f(aw + i * 60)}" height="35" fill="${mixHex(bg, '#000', 0.06 + i * 0.04)}"/>`;
  }
  // 화분
  const px = r.chance(0.5) ? ax - 90 : ax + aw + 30;
  body += `<rect x="${f(px)}" y="${bottom - 60}" width="60" height="60" rx="6" fill="${a}"/>`;
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + (i - 2) * 0.38;
    const lx = px + 30 + Math.cos(ang) * 70;
    const ly = bottom - 60 + Math.sin(ang) * 90;
    body += `<path d="M${f(px + 30)} ${bottom - 60} Q ${f(px + 30 + (lx - px - 30) * 0.2)} ${f(ly + 30)} ${f(lx)} ${f(ly)}" stroke="${mixHex(b, '#1b3a2a', 0.6)}" stroke-width="10" stroke-linecap="round" fill="none"/>`;
  }
  return { defs, body };
}

function thingCover(r, [bg, a, b, c]) {
  // 아이소메트릭 블록 더미
  const u = 34;
  const cx = W / 2;
  const cy = H * 0.58;
  const iso = (x, y, z) => [cx + (x - y) * 0.866 * u, cy + (x + y) * 0.5 * u - z * u];
  const P = (p) => p.map((v) => f(v)).join(' ');
  let body = `<rect width="${W}" height="${H}" fill="${bg}"/>`;
  for (let i = -8; i <= 8; i++) {
    const p1 = iso(i, -8, 0);
    const p2 = iso(i, 8, 0);
    const p3 = iso(-8, i, 0);
    const p4 = iso(8, i, 0);
    body += `<path d="M${P(p1)} L${P(p2)} M${P(p3)} L${P(p4)}" stroke="${b}" stroke-opacity=".12" stroke-width="1.5"/>`;
  }
  const boxes = [];
  const count = r.int(4, 7);
  for (let i = 0; i < count; i++) {
    boxes.push({
      x: r.int(-3, 2),
      y: r.int(-3, 2),
      z: 0,
      w: r.int(1, 3),
      d: r.int(1, 3),
      h: r.int(1, 4),
      col: r.pick([a, b, c]),
    });
  }
  // 겹치면 위로 쌓는다
  boxes.forEach((bx, i) => {
    for (let j = 0; j < i; j++) {
      const o = boxes[j];
      if (bx.x < o.x + o.w && bx.x + bx.w > o.x && bx.y < o.y + o.d && bx.y + bx.d > o.y) bx.z = Math.max(bx.z, o.z + o.h);
    }
  });
  boxes.sort((p, q) => p.x + p.y + p.z - (q.x + q.y + q.z));
  boxes.forEach(({ x, y, z, w, d, h, col }) => {
    const top = [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
    const left = [iso(x, y + d, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x, y + d, z + h)];
    const right = [iso(x + w, y, z), iso(x + w, y + d, z), iso(x + w, y + d, z + h), iso(x + w, y, z + h)];
    const poly = (pts, fill) => `<path d="M${pts.map(P).join(' L')} Z" fill="${fill}" stroke="${mixHex(col, '#000', 0.5)}" stroke-width="1.2" stroke-linejoin="round"/>`;
    body += poly(left, mixHex(col, '#000', 0.22)) + poly(right, mixHex(col, '#000', 0.4)) + poly(top, mixHex(col, '#fff', 0.12));
  });
  body += `<circle cx="${f(r.range(80, 520))}" cy="${f(r.range(80, 220))}" r="${f(r.range(30, 60))}" fill="${a}" opacity=".9"/>`;
  return body;
}

const COVERS = { book: bookCover, film: filmCover, music: musicCover, game: gameCover, place: placeCover, thing: thingCover };

/** 리뷰 표지 */
export function cover(kind, seed, paletteName) {
  return memo(`cover:${kind}:${seed}:${paletteName}`, () => {
    const r = rng(seed);
    const pal = PALETTES[paletteName] || r.pick(Object.values(PALETTES));
    const out = (COVERS[kind] || bookCover)(r, pal);
    const { defs = '', body } = typeof out === 'string' ? { body: out } : out;
    return uri(svgDoc(W, H, defs, body));
  });
}

/* ==========================================================================
   여행 풍경 (800×600)
   ========================================================================== */
const SW = 800;
const SH = 600;

const TIMES = {
  dawn: { sky: ['#F4B9A0', '#F6E6D6'], sun: '#FFF3E2', far: '#D3AFB6', near: '#3B2C40', water: '#E9C2B2' },
  day: { sky: ['#7FB8E0', '#E6F2F5'], sun: '#FFFAEA', far: '#A6C0CC', near: '#20382F', water: '#5E9EC0' },
  dusk: { sky: ['#33244F', '#F28A5C'], sun: '#FFD27E', far: '#94607A', near: '#1C1424', water: '#C06A66' },
  night: { sky: ['#060A1C', '#1D2A52'], sun: '#F3EED6', far: '#28335E', near: '#04060D', water: '#142049' },
  autumn: { sky: ['#F2AE5A', '#F7E3C4'], sun: '#FFF5E2', far: '#CF8656', near: '#4E1C16', water: '#DE9C6C' },
  mist: { sky: ['#BFC9C6', '#EEF0EA'], sun: '#FFFFFF', far: '#B5C2BC', near: '#2D3E37', water: '#A9BDBA' },
};

function ridge(r, y0, amp, rough = 0.55) {
  let pts = [y0 + r.range(-amp, amp), y0 + r.range(-amp, amp)];
  let disp = amp;
  for (let it = 0; it < 6; it++) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + r.range(-disp, disp));
    next.push(pts[pts.length - 1]);
    pts = next;
    disp *= rough;
  }
  const step = SW / (pts.length - 1);
  return `M0 ${SH} ` + pts.map((y, i) => `L${f(i * step)} ${f(y)}`).join(' ') + ` L${SW} ${SH} Z`;
}

function skyBase(r, t, { sunY = r.range(140, 300), sunX = r.range(120, 680), sunR = r.range(36, 70), stars } = {}) {
  const defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.sky[0]}"/><stop offset="1" stop-color="${t.sky[1]}"/></linearGradient>
  <radialGradient id="sunglow"><stop offset="0" stop-color="${t.sun}" stop-opacity=".7"/><stop offset=".4" stop-color="${t.sun}" stop-opacity=".18"/><stop offset="1" stop-color="${t.sun}" stop-opacity="0"/></radialGradient>
  <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.water}"/><stop offset="1" stop-color="${mixHex(t.water, t.near, 0.6)}"/></linearGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.sky[1]}" stop-opacity="0"/><stop offset="1" stop-color="${t.sky[1]}" stop-opacity=".85"/></linearGradient>`;
  let body = `<rect width="${SW}" height="${SH}" fill="url(#sky)"/>`;
  if (stars) for (let i = 0; i < 90; i++) body += `<circle cx="${f(r.range(0, SW))}" cy="${f(r.range(0, SH * 0.6))}" r="${f(r.range(0.5, 1.8))}" fill="#fff" opacity="${f(r.range(0.25, 0.9))}"/>`;
  body += `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR * 4)}" fill="url(#sunglow)"/>`;
  body += `<circle cx="${f(sunX)}" cy="${f(sunY)}" r="${f(sunR)}" fill="${t.sun}"/>`;
  return { defs, body, sunX, sunY, sunR };
}

const layerColor = (t, i, n) => mixHex(t.far, t.near, n === 1 ? 1 : i / (n - 1));

function sceneMountain(r, t) {
  const base = skyBase(r, t, { stars: t === TIMES.night });
  let body = base.body;
  const n = 5;
  for (let i = 0; i < n; i++) {
    body += `<path d="${ridge(r, 260 + i * 62, 70 - i * 8)}" fill="${layerColor(t, i, n)}"/>`;
    if (i < n - 1) body += `<rect y="${280 + i * 62}" width="${SW}" height="${SH}" fill="url(#fade)" opacity="${0.25 - i * 0.04}"/>`;
  }
  return { defs: base.defs, body };
}

function sceneSea(r, t) {
  const horizon = r.range(330, 380);
  const base = skyBase(r, t, { sunY: horizon - r.range(20, 120), stars: t === TIMES.night });
  let body = base.body;
  if (r.chance(0.6)) body += `<path d="${ridge(r, horizon - 30, 22, 0.5)}" fill="${t.far}" opacity=".8"/>`;
  body += `<rect y="${f(horizon)}" width="${SW}" height="${SH}" fill="url(#water)"/>`;
  for (let i = 0; i < 14; i++) {
    const y = horizon + 6 + i * i * 1.4;
    const w = base.sunR * (2.6 - i * 0.14) * r.range(0.7, 1.2);
    body += `<rect x="${f(base.sunX - w / 2 + r.range(-8, 8))}" y="${f(y)}" width="${f(w)}" height="${f(1.5 + i * 0.35)}" rx="2" fill="${t.sun}" opacity="${f(0.75 - i * 0.045)}"/>`;
  }
  for (let i = 0; i < 26; i++) {
    const y = r.range(horizon + 20, SH);
    const x = r.range(0, SW);
    body += `<path d="M${f(x)} ${f(y)} q 10 -4 20 0 t 20 0" stroke="${mixHex(t.water, '#fff', 0.4)}" stroke-width="1.4" fill="none" opacity=".45"/>`;
  }
  // 한쪽 절벽
  const side = r.pick([0, 1]);
  const cw = r.range(160, 280);
  const pts = [];
  for (let y = 180; y <= SH; y += 30) pts.push(`${f(side ? SW - cw + r.range(-30, 30) + (SH - y) * 0.12 : cw + r.range(-30, 30) - (SH - y) * 0.12)} ${y}`);
  body += `<path d="M${side ? SW : 0} ${SH} L${side ? SW : 0} 200 L${pts.join(' L')} Z" fill="${t.near}"/>`;
  return { defs: base.defs, body };
}

function sceneCity(r, t) {
  const night = t === TIMES.night || t === TIMES.dusk;
  const base = skyBase(r, t, { sunY: r.range(90, 200), sunR: r.range(26, 44), stars: t === TIMES.night });
  let body = base.body;
  [0, 1, 2].forEach((layer) => {
    const col = layerColor(t, layer, 3);
    let x = -20;
    const ground = SH - 40 + layer * 10;
    while (x < SW) {
      const w = r.range(36, 90) - layer * 6;
      const h = r.range(120, 330) - layer * 60 + (layer === 0 ? 40 : 0);
      const top = ground - h;
      body += `<rect x="${f(x)}" y="${f(top)}" width="${f(w)}" height="${f(h + 60)}" fill="${col}"/>`;
      if (r.chance(0.25)) body += `<rect x="${f(x + w / 2 - 2)}" y="${f(top - r.range(20, 50))}" width="4" height="60" fill="${col}"/>`;
      if (layer === 2 || (layer === 1 && night)) {
        for (let wy = top + 12; wy < ground - 10; wy += 16) {
          for (let wx = x + 7; wx < x + w - 8; wx += 12) {
            if (r.chance(night ? 0.35 : 0.12)) body += `<rect x="${f(wx)}" y="${f(wy)}" width="5" height="7" fill="${night ? '#FFD98A' : mixHex(col, '#fff', 0.35)}" opacity="${f(r.range(0.5, 1))}"/>`;
          }
        }
      }
      x += w + r.range(2, 10);
    }
  });
  body += `<rect y="${SH - 30}" width="${SW}" height="30" fill="${t.near}"/>`;
  return { defs: base.defs, body };
}

function pagoda(x, baseY, scale, col) {
  let p = '';
  let y = baseY;
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const w = (90 - i * 12) * scale;
    const bh = 22 * scale;
    p += `<rect x="${f(x - w * 0.32)}" y="${f(y - bh)}" width="${f(w * 0.64)}" height="${f(bh)}" fill="${col}"/>`;
    y -= bh;
    const rw = w * 0.62;
    p += `<path d="M${f(x - rw - 10 * scale)} ${f(y + 2)} Q ${f(x - rw * 0.4)} ${f(y - 4 * scale)} ${f(x - rw * 0.3)} ${f(y - 12 * scale)} L${f(x + rw * 0.3)} ${f(y - 12 * scale)} Q ${f(x + rw * 0.4)} ${f(y - 4 * scale)} ${f(x + rw + 10 * scale)} ${f(y + 2)} Z" fill="${col}"/>`;
    y -= 12 * scale;
  }
  p += `<rect x="${f(x - 2 * scale)}" y="${f(y - 46 * scale)}" width="${f(4 * scale)}" height="${f(46 * scale)}" fill="${col}"/>`;
  return p;
}

function torii(x, baseY, s, col) {
  const pw = 14 * s;
  const span = 150 * s;
  const h = 170 * s;
  return `<rect x="${f(x - span / 2)}" y="${f(baseY - h)}" width="${f(pw)}" height="${f(h)}" fill="${col}"/>
  <rect x="${f(x + span / 2 - pw)}" y="${f(baseY - h)}" width="${f(pw)}" height="${f(h)}" fill="${col}"/>
  <rect x="${f(x - span / 2 - 6 * s)}" y="${f(baseY - h + 26 * s)}" width="${f(span + 12 * s)}" height="${f(10 * s)}" fill="${col}"/>
  <path d="M${f(x - span / 2 - 26 * s)} ${f(baseY - h - 6 * s)} Q ${f(x)} ${f(baseY - h + 8 * s)} ${f(x + span / 2 + 26 * s)} ${f(baseY - h - 6 * s)} L${f(x + span / 2 + 22 * s)} ${f(baseY - h + 8 * s)} Q ${f(x)} ${f(baseY - h + 20 * s)} ${f(x - span / 2 - 22 * s)} ${f(baseY - h + 8 * s)} Z" fill="${col}"/>`;
}

function sceneTemple(r, t) {
  const base = skyBase(r, t, { stars: t === TIMES.night });
  let body = base.body;
  body += `<path d="${ridge(r, 300, 50)}" fill="${layerColor(t, 0, 4)}"/>`;
  body += `<path d="${ridge(r, 360, 40)}" fill="${layerColor(t, 1, 4)}"/>`;
  body += pagoda(r.range(160, 640), 430, r.range(0.9, 1.25), layerColor(t, 2, 4));
  body += `<path d="${ridge(r, 450, 20, 0.4)}" fill="${layerColor(t, 2, 4)}"/>`;
  body += `<rect y="500" width="${SW}" height="100" fill="${t.near}"/>`;
  body += torii(r.range(220, 580), 560, r.range(1, 1.5), '#C8322B');
  // 단풍잎·꽃잎
  for (let i = 0; i < 70; i++) {
    const x = r.range(0, SW);
    const y = r.range(0, SH);
    body += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r.range(1.5, 4.5))}" fill="${r.pick(['#E2572E', '#F2A541', '#B8321E', '#F6C177'])}" opacity="${f(r.range(0.5, 0.95))}"/>`;
  }
  return { defs: base.defs, body };
}

function sceneForest(r, t) {
  const base = skyBase(r, t, { sunY: r.range(100, 200) });
  let body = base.body;
  const rows = 5;
  for (let i = 0; i < rows; i++) {
    const col = layerColor(t, i, rows);
    const y0 = 270 + i * 70;
    body += `<path d="${ridge(r, y0 + 30, 16, 0.5)}" fill="${col}"/>`;
    let x = r.range(-20, 10);
    while (x < SW + 20) {
      const h = r.range(60, 120) * (0.6 + i * 0.14);
      const w = h * r.range(0.32, 0.42);
      const y = y0 + 40 + r.range(-10, 10);
      body += `<path d="M${f(x)} ${f(y - h)} L${f(x + w / 2)} ${f(y)} L${f(x - w / 2)} ${f(y)} Z" fill="${col}"/>`;
      x += w * r.range(0.5, 0.9);
    }
    if (i < rows - 1) body += `<rect y="${y0}" width="${SW}" height="${SH}" fill="url(#fade)" opacity=".3"/>`;
  }
  return { defs: base.defs, body };
}

function sceneIce(r, t) {
  const horizon = r.range(340, 380);
  const base = skyBase(r, t, { sunR: r.range(20, 34), sunY: r.range(70, 150), stars: true });
  let defs = base.defs + `<linearGradient id="aur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7CFFC4" stop-opacity="0"/><stop offset=".6" stop-color="#5CF2B0" stop-opacity=".55"/><stop offset="1" stop-color="#2EC4B6" stop-opacity="0"/></linearGradient>`;
  let body = base.body;
  if (t === TIMES.night || t === TIMES.dusk) {
    for (let k = 0; k < 3; k++) {
      const amp = r.range(20, 50);
      const ph = r.range(0, 6);
      const y0 = r.range(60, 180);
      let top = '';
      let bot = '';
      for (let x = 0; x <= SW; x += 20) {
        const y = y0 + Math.sin(x * 0.008 + ph) * amp + Math.sin(x * 0.021 + ph * 2) * amp * 0.3;
        top += `L${x} ${f(y)} `;
        bot = `L${x} ${f(y + 110)} ` + bot;
      }
      body += `<path d="M0 ${f(y0)} ${top} ${bot} Z" fill="url(#aur)" opacity="${f(0.5 + k * 0.15)}"/>`;
    }
  }
  body += `<path d="${ridge(r, horizon - 30, 30, 0.6)}" fill="${t.far}"/>`;
  body += `<rect y="${f(horizon)}" width="${SW}" height="${SH}" fill="url(#water)"/>`;
  const bergs = r.int(3, 5);
  for (let i = 0; i < bergs; i++) {
    const cx = r.range(60, 740);
    const w = r.range(70, 180);
    const h = r.range(40, 110);
    const pts = [];
    const n = 6;
    for (let k = 0; k <= n; k++) pts.push(`${f(cx - w / 2 + (w * k) / n)} ${f(horizon - (k === 0 || k === n ? 0 : r.range(h * 0.4, h)))}`);
    body += `<path d="M${pts.join(' L')} Z" fill="#EAF6FB"/>`;
    body += `<path d="M${f(cx)} ${f(horizon)} L${pts.slice(Math.floor(n / 2)).join(' L')} Z" fill="#B9DCEB"/>`;
    body += `<path d="M${f(cx - w / 2)} ${f(horizon)} L${f(cx + w / 2)} ${f(horizon)} L${f(cx + w * 0.3)} ${f(horizon + h * 0.5)} L${f(cx - w * 0.3)} ${f(horizon + h * 0.4)} Z" fill="#CFE9F3" opacity=".35"/>`;
  }
  return { defs, body };
}

function sceneFacades(r, t) {
  const base = skyBase(r, t, { sunY: r.range(60, 140), sunR: 30 });
  let body = base.body;
  const pastel = ['#F2C14E', '#E9897E', '#7FB7BE', '#F4E3C1', '#C8553D', '#88A2C8', '#E8B4BC', '#F6E7D7'];
  let x = -10;
  const slope = r.range(-0.12, 0.12);
  while (x < SW) {
    const w = r.range(90, 150);
    const ground = 520 + (x - SW / 2) * slope;
    const h = r.range(220, 360);
    const top = ground - h;
    const col = r.pick(pastel);
    body += `<rect x="${f(x)}" y="${f(top)}" width="${f(w)}" height="${f(h + 120)}" fill="${col}"/>`;
    body += `<path d="M${f(x - 4)} ${f(top)} L${f(x + w / 2)} ${f(top - r.range(20, 40))} L${f(x + w + 4)} ${f(top)} Z" fill="#B5502F"/>`;
    // 아줄레주 패턴 띠
    if (r.chance(0.5)) for (let i = 0; i < w; i += 10) body += `<rect x="${f(x + i)}" y="${f(top + 6)}" width="5" height="5" fill="#2F5DA8" opacity=".55"/>`;
    for (let wy = top + 30; wy < ground - 40; wy += 54) {
      for (let wx = x + 14; wx < x + w - 28; wx += 34) {
        body += `<rect x="${f(wx)}" y="${f(wy)}" width="18" height="30" rx="9" fill="${mixHex(col, '#1a1a1a', 0.55)}"/>`;
        body += `<rect x="${f(wx - 3)}" y="${f(wy + 30)}" width="24" height="3" fill="#2a2a2a" opacity=".6"/>`;
      }
    }
    x += w;
  }
  body += `<path d="M0 ${f(520 - (SW / 2) * slope)} L${SW} ${f(520 + (SW / 2) * slope)} L${SW} ${SH} L0 ${SH} Z" fill="#8C8A84"/>`;
  // 노란 트램
  const tx = r.range(120, 520);
  const ty = 520 + (tx + 120 - SW / 2) * slope;
  body += `<g transform="rotate(${f((Math.atan(slope) * 180) / Math.PI)} ${f(tx + 120)} ${f(ty)})"><rect x="${f(tx)}" y="${f(ty - 100)}" width="240" height="96" rx="14" fill="#F2B90C"/><rect x="${f(tx)}" y="${f(ty - 40)}" width="240" height="20" fill="#F7F1E1"/>${[0, 1, 2, 3, 4]
    .map((i) => `<rect x="${f(tx + 14 + i * 44)}" y="${f(ty - 88)}" width="34" height="38" rx="5" fill="#2B3440"/>`)
    .join('')}<path d="M${f(tx + 120)} ${f(ty - 100)} L${f(tx + 150)} ${f(ty - 160)}" stroke="#222" stroke-width="3"/></g>`;
  return { defs: base.defs, body };
}

function sceneMarket(r, t) {
  const base = skyBase(r, TIMES.night, { sunR: 18, sunY: 80, stars: true });
  let defs = base.defs + `<radialGradient id="lan"><stop offset="0" stop-color="#FFE3A3"/><stop offset=".45" stop-color="#F28C28"/><stop offset="1" stop-color="#F28C28" stop-opacity="0"/></radialGradient>`;
  let body = base.body;
  for (let k = 0; k < 4; k++) {
    const y0 = 80 + k * 70;
    const sag = r.range(40, 90);
    body += `<path d="M-20 ${y0} Q ${SW / 2} ${y0 + sag * 2} ${SW + 20} ${y0}" stroke="#000" stroke-opacity=".5" fill="none"/>`;
    for (let i = 0; i <= 14; i++) {
      const tt = i / 14;
      const x = -20 + tt * (SW + 40);
      const y = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * (y0 + sag * 2) + tt * tt * y0;
      const rad = r.range(9, 15) * (1 + k * 0.2);
      body += `<circle cx="${f(x)}" cy="${f(y + rad)}" r="${f(rad * 2.6)}" fill="url(#lan)" opacity=".55"/><ellipse cx="${f(x)}" cy="${f(y + rad)}" rx="${f(rad * 0.8)}" ry="${f(rad)}" fill="${r.pick(['#F2542D', '#F5A623', '#E63946', '#FFB627'])}"/>`;
    }
  }
  let x = -10;
  while (x < SW) {
    const w = r.range(80, 140);
    const h = r.range(90, 150);
    body += `<path d="M${f(x)} ${SH} V${f(SH - h)} L${f(x + w / 2)} ${f(SH - h - 30)} L${f(x + w)} ${f(SH - h)} V${SH} Z" fill="#0B0A10"/>`;
    body += `<rect x="${f(x + 10)}" y="${f(SH - h + 20)}" width="${f(w - 20)}" height="${f(h * 0.4)}" fill="#F2A541" opacity=".25"/>`;
    x += w + 6;
  }
  return { defs, body };
}

function sceneField(r, t) {
  const base = skyBase(r, t, { sunY: r.range(90, 180) });
  let body = base.body;
  body += `<path d="${ridge(r, 250, 40)}" fill="${t.far}"/>`;
  const greens = ['#9DBF5A', '#6E9A44', '#B9CF6A', '#5B8A3C', '#86AD4B', '#4E7A35'];
  for (let i = 0; i < 9; i++) {
    const y = 280 + i * 38 + i * i * 1.8;
    const amp = r.range(10, 30);
    const ph = r.range(0, 6);
    let d = `M0 ${SH} L0 ${f(y)}`;
    for (let x = 0; x <= SW; x += 25) d += ` L${x} ${f(y + Math.sin(x * 0.006 + ph) * amp)}`;
    d += ` L${SW} ${SH} Z`;
    body += `<path d="${d}" fill="${greens[i % greens.length]}"/>`;
    body += `<path d="${d.replace(/^M0 600 L/, 'M')}" fill="none" stroke="#2E4A22" stroke-opacity=".25" stroke-width="2"/>`;
  }
  return { defs: base.defs, body };
}

function sceneWaterfall(r, t) {
  const base = skyBase(r, t, { sunR: 28, sunY: 90, stars: t === TIMES.night });
  let defs = base.defs + `<linearGradient id="fall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4FAFF"/><stop offset="1" stop-color="#CFE6F2"/></linearGradient>`;
  let body = base.body;
  body += `<path d="${ridge(r, 200, 30)}" fill="${t.far}"/>`;
  const fx = r.range(300, 500);
  const fw = r.range(40, 80);
  body += `<path d="M0 ${SH} L0 150 L${f(fx - 30)} 160 L${f(fx)} 180 L${f(fx)} ${SH} Z" fill="${mixHex(t.near, t.far, 0.25)}"/>`;
  body += `<path d="M${SW} ${SH} L${SW} 140 L${f(fx + fw + 30)} 165 L${f(fx + fw)} 180 L${f(fx + fw)} ${SH} Z" fill="${t.near}"/>`;
  body += `<rect x="${f(fx)}" y="178" width="${f(fw)}" height="${SH}" fill="url(#fall)"/>`;
  for (let i = 0; i < 12; i++) body += `<rect x="${f(fx + r.range(0, fw))}" y="${f(r.range(180, 460))}" width="2" height="${f(r.range(40, 120))}" fill="#9CC4D8" opacity=".5"/>`;
  for (let i = 0; i < 30; i++) body += `<circle cx="${f(fx + fw / 2 + r.range(-140, 140))}" cy="${f(r.range(470, 560))}" r="${f(r.range(18, 50))}" fill="#fff" opacity="${f(r.range(0.15, 0.4))}"/>`;
  body += `<path d="${ridge(r, 545, 14, 0.4)}" fill="${t.near}"/>`;
  return { defs, body };
}

function sceneWat(r, t) {
  // 황금 체디와 야자수
  const base = skyBase(r, t, { sunY: r.range(120, 220), stars: t === TIMES.night });
  let body = base.body;
  body += `<path d="${ridge(r, 330, 40)}" fill="${layerColor(t, 0, 4)}"/>`;
  const gold = t === TIMES.night ? '#B8892E' : '#E2A93B';
  const goldDark = mixHex(gold, '#5a3a10', 0.45);
  const chedi = (x, base, s) => {
    let p = '';
    for (let i = 0; i < 3; i++) {
      const w = (150 - i * 30) * s;
      p += `<rect x="${f(x - w / 2)}" y="${f(base - (i + 1) * 18 * s)}" width="${f(w)}" height="${f(18 * s)}" fill="${i % 2 ? gold : goldDark}"/>`;
    }
    const by = base - 54 * s;
    p += `<path d="M${f(x - 52 * s)} ${f(by)} C ${f(x - 52 * s)} ${f(by - 70 * s)}, ${f(x - 12 * s)} ${f(by - 90 * s)}, ${f(x)} ${f(by - 150 * s)} C ${f(x + 12 * s)} ${f(by - 90 * s)}, ${f(x + 52 * s)} ${f(by - 70 * s)}, ${f(x + 52 * s)} ${f(by)} Z" fill="${gold}"/>`;
    p += `<path d="M${f(x)} ${f(by - 150 * s)} C ${f(x + 12 * s)} ${f(by - 90 * s)}, ${f(x + 52 * s)} ${f(by - 70 * s)}, ${f(x + 52 * s)} ${f(by)} L${f(x)} ${f(by)} Z" fill="${goldDark}" opacity=".35"/>`;
    p += `<rect x="${f(x - 1.5 * s)}" y="${f(by - 200 * s)}" width="${f(3 * s)}" height="${f(52 * s)}" fill="${gold}"/>`;
    return p;
  };
  const cx = r.range(280, 520);
  body += chedi(cx - 170, 470, 0.6) + chedi(cx + 170, 470, 0.6) + chedi(cx, 480, 1);
  body += `<rect y="470" width="${SW}" height="130" fill="${layerColor(t, 2, 4)}"/>`;
  const palm = (x, base, h, lean) => {
    const tx = x + lean;
    const ty = base - h;
    let p = `<path d="M${f(x)} ${f(base)} Q ${f(x + lean * 0.2)} ${f(base - h * 0.5)} ${f(tx)} ${f(ty)}" stroke="${t.near}" stroke-width="7" fill="none"/>`;
    for (let k = 0; k < 7; k++) {
      const a = (k / 6) * Math.PI + Math.PI + r.range(-0.15, 0.15);
      const ex = tx + Math.cos(a) * 70;
      const ey = ty + Math.sin(a) * 30 + 30;
      p += `<path d="M${f(tx)} ${f(ty)} Q ${f((tx + ex) / 2)} ${f(ty - 30)} ${f(ex)} ${f(ey)}" stroke="${t.near}" stroke-width="6" stroke-linecap="round" fill="none"/>`;
    }
    return p;
  };
  body += palm(r.range(40, 140), 600, r.range(220, 300), r.range(10, 60));
  body += palm(r.range(660, 760), 600, r.range(200, 280), -r.range(10, 60));
  return { defs: base.defs, body };
}

const SCENES = {
  wat: sceneWat,
  mountain: sceneMountain,
  sea: sceneSea,
  city: sceneCity,
  temple: sceneTemple,
  forest: sceneForest,
  ice: sceneIce,
  facades: sceneFacades,
  market: sceneMarket,
  field: sceneField,
  waterfall: sceneWaterfall,
};

/** 여행 풍경 SVG 원문 (섬데트는 /art/scene/... 주소로 내려보낸다. 페이지 HTML에 수십 KB씩 박지 않으려고) */
export function sceneSvg(type, time, seed) {
  const r = rng(seed);
  const t = TIMES[time] || TIMES.day;
  const { defs, body } = (SCENES[type] || sceneMountain)(r, t);
  return svgDoc(SW, SH, defs, body);
}

/** 여행 풍경 */
export function scene(type, time, seed) {
  return memo(`scene:${type}:${time}:${seed}`, () => {
    const r = rng(seed);
    const t = TIMES[time] || TIMES.day;
    const { defs, body } = (SCENES[type] || sceneMountain)(r, t);
    return uri(svgDoc(SW, SH, defs, body));
  });
}

/** 데이터에 실제 사진이 있으면 그걸, 없으면 생성 이미지 */
export const imgOf = (item, seed) => item.image || scene(item.scene, item.time, seed);

/** 오늘의 달 모양 아이콘 (헤더 로고용) */
export function moonIcon(phase, ink = 'currentColor') {
  // phase: 0=삭, 0.5=망. 밝은 부분을 두 개의 호로 그린다.
  const r = 10;
  const k = Math.cos(phase * 2 * Math.PI); // 1 → -1 → 1
  const waxing = phase < 0.5;
  const rx = Math.abs(k) * r;
  const sweepOuter = waxing ? 1 : 0;
  const sweepInner = (k > 0) === waxing ? 0 : 1;
  const lit = `M12 2 A${r} ${r} 0 0 ${sweepOuter} 12 22 A${f(rx)} ${r} 0 0 ${sweepInner} 12 2 Z`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="${r}" fill="none" stroke="${ink}" stroke-width="1.4" opacity=".5"/><path d="${lit}" fill="${ink}"/></svg>`;
}
