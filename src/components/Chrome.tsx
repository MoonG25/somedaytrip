'use client';
// 전역 UI (moon.log main.js에서 옮김): 헤더 스크롤·메뉴 인디케이터·모바일 메뉴·테마·포인트 색·커서·푸터 시계,
// 그리고 페이지가 바뀔 때마다 [data-reveal] 같은 연출을 다시 입힌다.
// 블로그 템플릿이 만든 일반 <a href="/..."> 링크도 Next 라우터로 이동하게 가로챈다.
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { enhance } from '@/blog/enhance.js';
import { initCursor } from '@/blog/cursor.js';
import { initTheme, toggleTheme } from '@/blog/theme.js';
import { rafThrottle, clamp } from '@/blog/util.js';

declare global {
  interface Window {
    __sdtNavigate?: (href: string) => void;
  }
}

export default function Chrome() {
  const router = useRouter();
  const pathname = usePathname();

  // 한 번만: 헤더·테마·커서·링크 가로채기
  useEffect(() => {
    window.__sdtNavigate = (href: string) => router.push(href);
    const offTheme = initTheme();
    initCursor();
    const header = document.querySelector<HTMLElement>('.site-header')!;
    const menu = document.querySelector<HTMLElement>('.mobile-menu')!;
    const menuBtn = document.querySelector<HTMLButtonElement>('.menu-btn')!;
    const main = document.getElementById('main')!;
    const footer = document.querySelector<HTMLElement>('.site-footer')!;

    let lastY = scrollY;
    const toTop = document.querySelector<HTMLElement>('.to-top');
    const onScroll = rafThrottle(() => {
      const y = scrollY;
      header.classList.toggle('scrolled', y > 8);
      header.classList.toggle('hide', !menu.classList.contains('open') && y > 400 && y > lastY + 2 && !document.body.dataset.noHide);
      if (y < lastY - 2) header.classList.remove('hide');
      lastY = y;
      const total = document.documentElement.scrollHeight - innerHeight;
      toTop?.style.setProperty('--p', String(total > 0 ? clamp(y / total, 0, 1) : 0));
    });
    addEventListener('scroll', onScroll, { passive: true });

    const closeMenu = (instant = false) => {
      if (!menu.classList.contains('open')) return;
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.setAttribute('aria-label', '메뉴 열기');
      main.inert = false;
      footer.inert = false;
      document.body.style.overflow = '';
      if (instant) {
        menu.style.transition = 'none';
        menu.classList.remove('open');
        menu.hidden = true;
        requestAnimationFrame(() => (menu.style.transition = ''));
      } else {
        menu.classList.remove('open');
        setTimeout(() => !menu.classList.contains('open') && (menu.hidden = true), 700);
      }
    };
    const onMenuBtn = () => {
      if (menuBtn.getAttribute('aria-expanded') === 'true') return closeMenu();
      menuBtn.setAttribute('aria-expanded', 'true');
      menuBtn.setAttribute('aria-label', '메뉴 닫기');
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('open'));
      document.body.style.overflow = 'hidden';
      main.inert = true;
      footer.inert = true;
    };
    menuBtn.addEventListener('click', onMenuBtn);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    document.addEventListener('keydown', onKey);

    const themeBtn = document.querySelector<HTMLElement>('[data-action="theme"]')!;
    const onTheme = (e: MouseEvent) => {
      const r = themeBtn.getBoundingClientRect();
      toggleTheme(e.detail ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
    themeBtn.addEventListener('click', onTheme);
    const onTop = () => scrollTo({ top: 0, behavior: 'smooth' });
    toTop?.addEventListener('click', onTop);

    // 메뉴 인디케이터
    const nav = document.querySelector<HTMLElement>('.nav')!;
    const ind = document.querySelector<HTMLElement>('.nav-indicator')!;
    const move = (a: HTMLElement | null, hover: boolean) => {
      if (!a) return void (ind.style.opacity = '0');
      ind.style.opacity = hover && !a.classList.contains('active') ? '0.12' : '1';
      ind.style.width = `${a.offsetWidth}px`;
      ind.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    const onOver = (e: PointerEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('a');
      if (a) move(a, true);
    };
    const onLeave = () => move(nav.querySelector('a.active'), false);
    nav.addEventListener('pointerover', onOver);
    nav.addEventListener('pointerleave', onLeave);
    document.fonts?.ready.then(onLeave);

    // 푸터 서울 시계
    const clock = document.querySelector('[data-clock]');
    const fmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
    const tick = () => clock && (clock.textContent = fmt.format(new Date()));
    tick();
    const iv = setInterval(tick, 15000);

    // 블로그 템플릿의 일반 링크 → Next 라우터
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest('a');
      if (!a || !a.getAttribute('href') || a.target || a.hasAttribute('download') || a.origin !== location.origin) return;
      if (a.getAttribute('href')!.startsWith('#')) return;
      e.preventDefault();
      if (menu.classList.contains('open')) closeMenu(true);
      router.push(a.pathname + a.search + a.hash);
    };
    document.addEventListener('click', onClick);

    // 새로 그려진 부분에도 연출 입히기 (서버 응답으로 HTML이 바뀔 때)
    let t: ReturnType<typeof setTimeout>;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => enhance(main), 60);
    });
    mo.observe(main, { childList: true, subtree: true });

    return () => {
      offTheme?.();
      removeEventListener('scroll', onScroll);
      menuBtn.removeEventListener('click', onMenuBtn);
      document.removeEventListener('keydown', onKey);
      themeBtn.removeEventListener('click', onTheme);
      toTop?.removeEventListener('click', onTop);
      nav.removeEventListener('pointerover', onOver);
      nav.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('click', onClick);
      clearInterval(iv);
      mo.disconnect();
    };
  }, [router]);

  // 페이지가 바뀔 때마다: 메뉴 표시, 연출, 헤더 다시 보이기
  useEffect(() => {
    const section = pathname.split('/')[1] || '';
    document.querySelectorAll<HTMLElement>('.nav a').forEach((a) => {
      const on = a.dataset.nav === section;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const ind = document.querySelector<HTMLElement>('.nav-indicator');
    const active = document.querySelector<HTMLElement>('.nav a.active');
    if (ind) {
      if (active) {
        ind.style.opacity = '1';
        ind.style.width = `${active.offsetWidth}px`;
        ind.style.transform = `translateX(${active.offsetLeft}px)`;
      } else ind.style.opacity = '0';
    }
    document.querySelector('.site-header')?.classList.remove('hide');
    const main = document.getElementById('main')!;
    const off = enhance(main);
    return () => off?.();
  }, [pathname]);

  return null;
}
