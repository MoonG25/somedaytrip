import './styles/base.css';
import './styles/app.css';
import { route, startRouter } from './router';

route('/', () => import('./pages/home'));
route('/new', () => import('./pages/new'));
route('/p/:id', () => import('./pages/plan'));
route('/p/:id/pr/:no', () => import('./pages/proposal'));
route('.*', () => import('./pages/notfound'));

// 지금 페이지에 맞춰 상단 메뉴 표시
document.addEventListener('routed', () => {
  const p = location.pathname;
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
    a.classList.toggle('is-on', (a.dataset.nav === 'home' && p === '/') || (a.dataset.nav === 'new' && p === '/new'));
  });
});

startRouter(document.getElementById('main')!);
