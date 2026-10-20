import type { Metadata, Viewport } from 'next';
import '@/styles/blog/base.css';
import '@/styles/blog/components.css';
import '@/styles/blog/pages-plan.css';
import '@/styles/blog/plans.css';
import '@/styles/sdt.css';
import Chrome from '@/components/Chrome';
import { PLANE } from '@/blog/plans-lib.js';
import { SITE } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} · 언젠가 갈 여행을, 같이`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { type: 'website', siteName: SITE.name, locale: 'ko_KR' },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/icon.svg' },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3EFE6' },
    { media: '(prefers-color-scheme: dark)', color: '#0F0F12' },
  ],
  viewportFit: 'cover',
};

// 첫 페인트 전에 테마와 포인트 색을 적용해 깜빡임을 막는다 (moon.log index.html과 같음)
// 로그인했는지 (머리말 버튼을 그리기 전에 정한다. sdt_authed는 비밀이 아닌 표시용 쿠키)
const AUTH_SCRIPT = `(function(){try{if(/(?:^|; )sdt_authed=1/.test(document.cookie))document.documentElement.dataset.authed='1'}catch(e){}})();`;
// 탑승 수속을 마친 계획 id (그리기 전에 게이트를 숨기려고)
const BOARDED_SCRIPT = `(function(){try{var b=[];for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf('sdt:boarded:')===0)b.push(k.slice(12))}var t=sessionStorage.getItem('sdt:tore');if(t)b.push(t);document.documentElement.dataset.boarded=b.join(' ')}catch(e){}})();`;
const THEME_SCRIPT = `(function(){try{var g=function(k){var v=localStorage.getItem('sdt:'+k);return v?JSON.parse(v):null};var t=g('theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var h=g('hue');if(h!=null)document.documentElement.style.setProperty('--hue',h)}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: BOARDED_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: AUTH_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
      </head>
      <body>
        <a className="skip-link" href="#main" data-skip>
          본문으로 건너뛰기
        </a>
        <header className="site-header">
          <a href="/" className="logo" data-magnetic aria-label="섬데트 홈">
            <span className="logo-moon logo-plane" aria-hidden="true">
              <svg viewBox="-10 -8 20 16">
                <path d={PLANE} />
              </svg>
            </span>
            <span className="logo-word">
              someday<em>trip</em>
            </span>
            <span className="logo-ko">섬데트</span>
          </a>
          <nav className="nav" aria-label="주요 메뉴">
            <a href="/" data-nav="">
              <span className="nav-num">01</span>
              <span data-scramble>Departures</span>
            </a>
            <a href="/new" data-nav="new">
              <span className="nav-num">02</span>
              <span data-scramble>New plan</span>
            </a>
            <span className="nav-indicator" aria-hidden="true" />
          </nav>
          <div className="header-tools">
            <a className="btn btn--solid btn--sm header-cta" href="/new">
              + 계획 쓰기
            </a>
            <a className="btn btn--ghost btn--sm auth-in" href="/login">
              로그인
            </a>
            <a className="icon-btn auth-me" href="/account" aria-label="내 계정">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="8.5" r="3.6" />
                <path d="M4.5 20c1.3-3.6 4.2-5.4 7.5-5.4s6.2 1.8 7.5 5.4" />
              </svg>
            </a>
            <button className="icon-btn" type="button" popoverTarget="accent-pop" aria-label="포인트 색상 바꾸기">
              <span className="accent-dot" aria-hidden="true" />
            </button>
            <div id="accent-pop" className="accent-pop" popover="auto">
              <p className="eyebrow">Accent</p>
              <div className="swatches" />
              <input className="hue-range" type="range" min="0" max="360" step="1" aria-label="색상 직접 고르기" />
            </div>
            <button className="icon-btn theme-btn" type="button" data-action="theme" aria-label="밝은 테마와 어두운 테마 전환">
              <svg className="i-sun" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
              </svg>
              <svg className="i-moon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
              </svg>
            </button>
            <button className="icon-btn menu-btn" type="button" aria-label="메뉴 열기" aria-expanded="false" aria-controls="mobile-menu">
              <span />
              <span />
            </button>
          </div>
        </header>

        <div id="mobile-menu" className="mobile-menu" hidden>
          <nav aria-label="모바일 메뉴">
            <a href="/">
              <span>01</span>Departures<small>떠날 곳</small>
            </a>
            <a href="/new">
              <span>02</span>New plan<small>계획 쓰기</small>
            </a>
            <a href="/login" className="auth-in">
              <span>03</span>Sign in<small>로그인 · 가입</small>
            </a>
            <a href="/account" className="auth-me">
              <span>03</span>Account<small>내 계정</small>
            </a>
          </nav>
        </div>

        <main id="main" tabIndex={-1}>
          {children}
        </main>

        <footer className="site-footer">
          <div className="container footer-top">
            <div>
              <p className="footer-lede">언젠가 갈 여행을, 같이. 해외여행부터 동네 여행까지, 계획을 만들고 링크로 친구와 함께 다듬어요.</p>
              <p className="footer-clock">
                <span className="live-dot" />
                <span>서울</span> <span data-clock />
              </p>
            </div>
            <div>
              <h3>Index</h3>
              <ul>
                <li>
                  <a href="/">Departures · 떠날 곳</a>
                </li>
                <li>
                  <a href="/new">New plan · 계획 쓰기</a>
                </li>
                <li>
                  <a href="/privacy">Privacy · 개인정보처리방침</a>
                </li>
              </ul>
            </div>
            <div>
              <h3>How it works</h3>
              <ul>
                <li>
                  <span className="faint">링크를 받은 사람은 누구나 일정을 제안</span>
                </li>
                <li>
                  <span className="faint">반영은 기장만 (계획 비밀번호 또는 계정)</span>
                </li>
              </ul>
            </div>
            <div>
              <h3>Elsewhere</h3>
              <ul>
                <li>
                  <a href="https://github.com/MoonG25/somedaytrip" target="_blank" rel="noopener">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href="https://moonglog.vercel.app" target="_blank" rel="noopener">
                    moon.log
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-word" aria-hidden="true">
            someday<em>trip</em>
          </div>
          <div className="container footer-bottom">
            <span>© {new Date().getFullYear()} SomedayTrip · 섬데트</span>
            <button type="button" className="to-top" aria-label="맨 위로">
              <svg viewBox="0 0 36 36" aria-hidden="true">
                <circle className="t-track" cx="18" cy="18" r="15.9155" />
                <circle className="t-bar" cx="18" cy="18" r="15.9155" pathLength={100} />
              </svg>
              맨 위로
            </button>
          </div>
        </footer>

        <div className="cursor" aria-hidden="true">
          <div className="cursor-ring">
            <span className="cursor-label" />
          </div>
          <div className="cursor-dot" />
        </div>
        <div className="toasts" role="status" aria-live="polite" />
        <div className="grain" aria-hidden="true" />
        <Chrome />
      </body>
    </html>
  );
}
