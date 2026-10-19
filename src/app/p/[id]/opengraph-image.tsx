// 링크 미리보기 그림 (카톡·슬랙·X): 탑승권 모양. 한글 글꼴은 그림에 쓰는 글자만 Google Fonts에서 받아 온다
import { ImageResponse } from 'next/og';
import { repo } from '@/server';
import { STATUS, flagOf, nights, totalBudget } from '@/blog/plans-lib.js';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = '섬데트 여행 계획';

async function font(text: string, weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await repo().get(id);
  const p = b?.plan;
  const title = p?.title ?? '섬데트';
  const code = p?.iata || (p?.scope === 'local' ? 'LCL' : p?.scope === 'domestic' ? 'DOM' : '???');
  const facts = p ? [p.target ? p.target.replace(/-/g, '.') : '언젠가', nights(p.days), totalBudget(p) ? `₩${totalBudget(p).toLocaleString('ko-KR')}` : '예산 미정', STATUS[p.status].ko] : [];
  const text = `SEL${code}SOMEDAYAIRBOARDINGPASSGATE0123456789·₩.,${title}${p?.place ?? ''}서울${facts.join('')}출발기간예산상태섬데트언젠가 갈 여행을, 같이.일정 ${b?.items.length ?? 0}곳`;
  const [bold, regular] = await Promise.all([font(text, 800), font(text, 500)]);
  const fonts = [bold && { name: 'K', data: bold, weight: 800 as const }, regular && { name: 'K', data: regular, weight: 500 as const }].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 800 | 500 }[];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#f3efe6', padding: 56, fontFamily: 'K' }}>
        <div style={{ flex: 1, display: 'flex', background: '#fbf9f3', borderRadius: 28, boxShadow: '0 30px 60px -20px rgba(40,30,10,.35)', overflow: 'hidden' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '44px 52px', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, color: '#8c8678', letterSpacing: 3 }}>
              <span>SOMEDAY AIR · BOARDING PASS</span>
              <span style={{ color: '#e8643c' }}>섬데트</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 96, fontWeight: 800, color: '#17150f', lineHeight: 1 }}>SEL</span>
                <span style={{ fontSize: 22, color: '#8c8678' }}>서울</span>
              </div>
              <div style={{ flex: 1, height: 3, margin: '0 36px', background: 'repeating-linear-gradient(90deg,#e8643c 0 14px,transparent 14px 26px)', display: 'flex' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 96, fontWeight: 800, color: '#17150f', lineHeight: 1 }}>{code}</span>
                <span style={{ fontSize: 22, color: '#8c8678' }}>{p?.place ?? ''}</span>
              </div>
            </div>
            <div style={{ display: 'flex', fontSize: 54, fontWeight: 800, color: '#17150f', marginTop: 18, lineHeight: 1.2 }}>
              {p?.scope === 'abroad' || p?.countryCode ? `${flagOf(p?.countryCode)} ` : ''}
              {title}
            </div>
            <div style={{ display: 'flex', gap: 40, marginTop: 'auto', fontSize: 26, color: '#17150f' }}>
              {['출발', '기간', '예산', '상태'].map((k, i) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 18, color: '#8c8678' }}>{k}</span>
                  <span style={{ fontWeight: 800 }}>{facts[i]}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ width: 250, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#17150f', color: '#f3efe6', padding: '44px 32px', borderLeft: '4px dashed #f3efe6' }}>
            <span style={{ fontSize: 18, letterSpacing: 3, color: '#aaa499' }}>GATE {String(p?.priority ?? 0).padStart(2, '0')}</span>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 30, fontWeight: 800, lineHeight: 1.3 }}>
              <span>언젠가 갈</span>
              <span>여행을, 같이.</span>
            </div>
            <span style={{ fontSize: 22, color: '#e8643c' }}>일정 {b?.items.length ?? 0}곳</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
