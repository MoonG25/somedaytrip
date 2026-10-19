// 공유 썸네일(OG 이미지): 사이트의 탑승권(blog/ticket.js + plans.css .ticket)을 1200×630 그림으로 그대로 옮긴다.
// Satori는 flex·절대 위치만 되고 CSS 마스크가 없어서,
//  - 위조방지 무늬는 상태 색으로 칠한 SVG를 겹치고
//  - 절취선 위·아래 반원 홈은 바탕색 원을 덮어서 만든다.
import { ImageResponse } from 'next/og';
import { sceneSvg } from '@/blog/art.js';
import { ARC_PATH, PLANE, STATUS, SCOPE, barcode, flagOf, guillocheSvg, nights, readiness, totalBudget, travelField } from '@/blog/plans-lib.js';
import { ddayLabel } from '@/blog/ticket.js';
import type { View } from '@/blog/plans-lib.js';

export const OG_SIZE = { width: 1200, height: 630 };

// plans.css의 라이트 테마 색
const C = {
  paper: '#f3efe6',
  ticket: '#fbf9f3',
  ink: '#17150f',
  ink2: '#4b473e',
  ink3: '#8c8678',
  line: 'rgba(23,21,15,0.22)',
};
const TONE: Record<string, string> = { booked: '#2e9e58', preparing: '#d68910', planning: '#e5603f', dream: '#4a6fd1', done: '#8d7650' };
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

/** 항로 곡선 위 t 지점과 진행 방향 (탑승권에 마우스를 올렸을 때처럼 비행기가 날아가는 중) */
function arcPoint(t: number) {
  const P = [
    [14, 46],
    [60, -6],
    [140, -6],
    [186, 46],
  ];
  const b = (i: number) => (1 - t) ** 3 * P[0][i] + 3 * (1 - t) ** 2 * t * P[1][i] + 3 * (1 - t) * t ** 2 * P[2][i] + t ** 3 * P[3][i];
  const d = (i: number) => 3 * (1 - t) ** 2 * (P[1][i] - P[0][i]) + 6 * (1 - t) * t * (P[2][i] - P[1][i]) + 3 * t ** 2 * (P[3][i] - P[2][i]);
  return { x: b(0), y: b(1), ang: (Math.atan2(d(1), d(0)) * 180) / Math.PI };
}

function arcSvg(tone: string) {
  const t = 0.6;
  const p = arcPoint(t);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -10 200 62" width="400" height="124">
    <path d="${ARC_PATH}" fill="none" stroke="${C.ink3}" stroke-width="1.2" stroke-dasharray="2 4"/>
    <path d="${ARC_PATH}" fill="none" stroke="${tone}" stroke-width="2.2" stroke-linecap="round" pathLength="1" stroke-dasharray="${t} 1"/>
    <g transform="translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${p.ang.toFixed(1)})"><path d="${PLANE}" fill="${tone}"/></g>
  </svg>`;
}

function ringSvg(pct: number) {
  const r = 15.9155;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="72" height="72">
    <circle cx="18" cy="18" r="${r}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>
    ${pct > 0 ? `<circle cx="18" cy="18" r="${r}" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 18 18)"/>` : ''}
  </svg>`;
}

/** 쓰는 글자만 Google Fonts에서 받아 온다 (모르는 브라우저로 요청하면 ttf를 준다) */
async function font(family: string, weight: number, text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}
async function serif(text: string) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Instrument+Serif&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

const dot = (iso: string) => iso.replace(/-/g, '.');
const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;

/** 탑승권 미리보기 그림. p는 toView()로 만든 계획 (예시가 아니어도 됨) */
export async function ticketImage(p: View, { brand = false }: { brand?: boolean } = {}) {
  const tone = TONE[p.status] ?? TONE.dream;
  const st = STATUS[p.status];
  const dd = ddayLabel(p);
  const ready = readiness(p);
  const tf = travelField(p);
  const chip = brand ? '섬데트' : `${p.sample ? '예시 · ' : ''}${p.scope !== 'abroad' ? `${SCOPE[p.scope].ko} · ` : ''}${st.ko}`;
  const code = p.iata || (p.scope === 'local' ? 'LCL' : p.scope === 'domestic' ? 'DOM' : '???');
  const flag = brand ? '✈️' : p.scope === 'abroad' || p.countryCode ? flagOf(p.countryCode) : SCOPE[p.scope].icon;
  const fields = brand
    ? [
        ['출발', '언젠가'],
        ['공유', '링크 하나로'],
        ['제안', '누구나'],
        ['반영', '주인만'],
      ]
    : [
        ['출발', p.target ? dot(p.target) : '언젠가'],
        [(p.travelers || 1) > 1 ? `기간 · ${p.travelers}명` : '기간', nights(p.days)],
        [(p.travelers || 1) > 1 ? '예산 · 1인' : '예산', totalBudget(p) ? won(totalBudget(p)) : '₩0'],
        [tf.dt, tf.dd],
      ];
  // ∞·✓는 세리프 글꼴에 없어서 고딕으로
  const ddFont = /^[∞✓]$/.test(dd.big) ? 'Sans' : 'Serif';
  const now = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(new Date()));

  const sans = `∞✓SEL서울명인·${p.place}${p.title}${chip}${fields.flat().join('')}준비출발까지시간 나면다녀왔어요다녀왔나요?오늘 출발!예약 완료도착 · 다녀옴섬데트`;
  const mono = `SOMEDAY AIR · BOARDING PASS GATE CONFIRMED ARRIVED ${code} JFMASOND 0123456789%·`;
  const big = `SEL${code}0123456789`;
  const [s5, s7, s8, m4, m7, sf] = await Promise.all([
    font('Noto+Sans+KR', 500, sans),
    font('Noto+Sans+KR', 700, sans),
    font('Noto+Sans+KR', 800, sans + big),
    font('JetBrains+Mono', 400, mono),
    font('JetBrains+Mono', 700, mono),
    serif(`${dd.big}∞✓D-+`),
  ]);
  const fonts = [
    s5 && { name: 'Sans', data: s5, weight: 500 as const, style: 'normal' as const },
    s7 && { name: 'Sans', data: s7, weight: 700 as const, style: 'normal' as const },
    s8 && { name: 'Sans', data: s8, weight: 800 as const, style: 'normal' as const },
    m4 && { name: 'Mono', data: m4, weight: 400 as const, style: 'normal' as const },
    m7 && { name: 'Mono', data: m7, weight: 700 as const, style: 'normal' as const },
    sf && { name: 'Serif', data: sf, weight: 400 as const, style: 'normal' as const },
  ].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 500 | 700 | 800; style: 'normal' }[];

  const W = 1100;
  const H = 500;
  const STUB = 280;
  const MAIN = W - STUB;
  const NOTCH = 22;
  const guilloche = svgUri(guillocheSvg(p.id).replace('stroke="#000"', `stroke="${tone}"`));
  const scene = svgUri(sceneSvg(p.cover?.scene || 'mountain', p.cover?.time || 'day', p.id));
  const bars = svgUri(barcode(p.id).replace('currentColor', '#fff').replace('<svg class="barcode"', '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="56"'));

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.paper, fontFamily: 'Sans' }}>
        <div style={{ position: 'relative', display: 'flex', width: W, height: H, borderRadius: 38, background: C.ticket, color: C.ink, overflow: 'hidden', boxShadow: '0 28px 46px rgba(40,28,5,0.16), 0 3px 6px rgba(40,28,5,0.1)' }}>
          {/* 왼쪽: 탑승권 본문 */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: MAIN, height: H, padding: '38px 46px 34px' }}>
            <img src={guilloche} width={MAIN} height={H} style={{ position: 'absolute', left: 0, top: 0, width: MAIN, height: H, objectFit: 'cover', opacity: 0.28 }} />
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontFamily: 'Mono', fontSize: 17, letterSpacing: 3, color: C.ink3, marginRight: 'auto' }}>SOMEDAY AIR · BOARDING PASS</span>
              <span style={{ padding: '5px 18px', borderRadius: 999, fontSize: 20, fontWeight: 700, color: tone, background: `${tone}24` }}>{chip}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1 }}>SEL</span>
                <span style={{ marginTop: 10, fontSize: 21, color: C.ink3 }}>서울</span>
              </div>
              <img src={svgUri(arcSvg(tone))} width={300} height={93} style={{ flex: 1, margin: '0 18px 30px', height: 93 }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 82, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1 }}>{code}</span>
                <span style={{ marginTop: 10, fontSize: 21, color: C.ink3 }}>{p.place}</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 34, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.25 }}>
              <span style={{ fontSize: 36 }}>{flag}</span>
              <span style={{ display: 'flex', maxWidth: 650, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.title}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 20, borderTop: `2px dashed ${C.line}` }}>
              {fields.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontFamily: 'Mono', fontSize: 16, letterSpacing: 1.6, color: C.ink3 }}>{k}</span>
                  <span style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {MONTHS.map((m, i) => {
                const best = p.months?.includes(i + 1);
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 30,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 7,
                      fontFamily: 'Mono',
                      fontSize: 15,
                      fontWeight: best ? 700 : 400,
                      background: best ? tone : 'rgba(23,21,15,0.06)',
                      color: best ? C.ticket : C.ink3,
                      border: now === i + 1 ? `2.5px solid ${C.ink}` : '2.5px solid transparent',
                    }}
                  >
                    {m}
                  </div>
                );
              })}
            </div>
            {p.status === 'booked' || p.status === 'done' ? (
              <div style={{ position: 'absolute', right: 40, bottom: 168, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 20px 7px', border: `4px solid ${tone}`, borderRadius: 12, color: tone, transform: 'rotate(-11deg)', opacity: 0.8 }}>
                <span style={{ fontFamily: 'Mono', fontWeight: 700, fontSize: 26, letterSpacing: 4, lineHeight: 1.1 }}>{p.status === 'booked' ? 'CONFIRMED' : 'ARRIVED'}</span>
                <span style={{ fontSize: 16, letterSpacing: 6, fontWeight: 700 }}>{p.status === 'booked' ? '예약 완료' : '도착 · 다녀옴'}</span>
              </div>
            ) : null}
          </div>

          {/* 오른쪽: 스텁 (풍경 위에 흰 글씨) */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: STUB, height: H, padding: '36px 30px 32px 38px', color: '#fff', borderLeft: `3px dashed ${C.line}` }}>
            <img src={scene} width={STUB} height={H} style={{ position: 'absolute', left: 0, top: 0, width: STUB, height: H, objectFit: 'cover' }} />
            <div style={{ position: 'absolute', left: 0, top: 0, width: STUB, height: H, background: 'linear-gradient(180deg, rgba(8,8,12,0.2), rgba(8,8,12,0.62))' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: 'Mono', fontSize: 17, letterSpacing: 2, color: 'rgba(255,255,255,0.75)' }}>GATE</span>
              <span style={{ fontFamily: 'Mono', fontWeight: 700, fontSize: 46, lineHeight: 1 }}>{String(p.priority ?? 0).padStart(2, '0')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: ddFont, fontSize: ddFont === 'Sans' ? 64 : 70, fontWeight: 500, lineHeight: 0.95, letterSpacing: -1.5 }}>{dd.big}</span>
              <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>{dd.small}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ position: 'relative', display: 'flex', width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
                <img src={svgUri(ringSvg(ready.pct))} width={72} height={72} style={{ position: 'absolute', left: 0, top: 0 }} />
                <span style={{ fontFamily: 'Serif', fontSize: 28 }}>
                  {ready.pct}
                  <span style={{ fontSize: 15 }}>%</span>
                </span>
              </div>
              <span style={{ fontSize: 20, color: 'rgba(255,255,255,0.8)' }}>준비</span>
            </div>
            <img src={bars} width={210} height={52} style={{ opacity: 0.88 }} />
          </div>

          {/* 절취선 위·아래 반원 홈 */}
          <div style={{ position: 'absolute', left: MAIN - NOTCH, top: -NOTCH, width: NOTCH * 2, height: NOTCH * 2, borderRadius: 999, background: C.paper }} />
          <div style={{ position: 'absolute', left: MAIN - NOTCH, bottom: -NOTCH, width: NOTCH * 2, height: NOTCH * 2, borderRadius: 999, background: C.paper }} />
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts,
      emoji: 'twemoji',
      // 주소에 버전이 붙어 있어서 같은 주소면 늘 같은 그림이다 → CDN에 오래 둔다
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400' },
    }
  );
}

/** 홈·계획 쓰기 공유용 대표 탑승권 */
export const BRAND_VIEW = {
  id: 'somedaytrip-brand',
  slug: 'brand',
  href: '/',
  title: '언젠가 갈 여행을, 같이.',
  place: '어디든',
  placeEn: 'SOMEDAY',
  country: '',
  countryCode: '',
  iata: '???',
  scope: 'abroad',
  status: 'dream',
  priority: 1,
  target: null,
  days: 5,
  months: [4, 5, 9, 10],
  tz: 'Asia/Seoul',
  currency: 'KRW',
  cover: { scene: 'mountain', time: 'dusk' },
  why: '',
  tags: [],
  intro: '',
  coords: [41.0, 29.0],
  budget: {},
  checklist: [
    ['링크 보내기', true],
    ['제안 받기', true],
    ['떠나기', false],
  ],
  ownerName: '섬데트',
  visibility: 'public',
  version: 1,
  createdAt: 0,
  updatedAt: 0,
  items: [],
  stops: [],
} as unknown as View;
