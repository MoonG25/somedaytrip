// 테마(라이트/다크)와 포인트 색 (moon.log ui/theme.js). 저장 키만 sdt:로 바꿨다.
import { reducedMotion } from './util.js';

const get = (k, f) => {
  try {
    const v = localStorage.getItem('sdt:' + k);
    return v == null ? f : JSON.parse(v);
  } catch {
    return f;
  }
};
const set = (k, v) => {
  try {
    localStorage.setItem('sdt:' + k, JSON.stringify(v));
  } catch {}
};

export const HUES = [32, 70, 145, 200, 258, 320];
let media;
const resolved = () => {
  const t = get('theme', 'system');
  return t === 'system' ? (media.matches ? 'dark' : 'light') : t;
};

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

export function initTheme() {
  media = matchMedia('(prefers-color-scheme: dark)');
  apply(resolved());
  const onChange = () => get('theme', 'system') === 'system' && apply(resolved());
  media.addEventListener('change', onChange);
  initAccent();
  return () => media.removeEventListener('change', onChange);
}

export function toggleTheme(origin) {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  set('theme', next);
  if (!document.startViewTransition || reducedMotion()) return apply(next);
  const x = origin?.x ?? innerWidth - 60;
  const y = origin?.y ?? 34;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.documentElement.classList.add('theme-vt', 'vt-running');
  const vt = document.startViewTransition(() => apply(next));
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 700, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' }
    );
  });
  vt.finished.finally(() => document.documentElement.classList.remove('theme-vt', 'vt-running'));
}

export function setHue(h) {
  document.documentElement.style.setProperty('--hue', h);
  set('hue', h);
  syncAccentUI(h);
}

function syncAccentUI(h) {
  document.querySelectorAll('.swatches button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.h) === Number(h))));
  const range = document.querySelector('.hue-range');
  if (range) range.value = h;
}

function initAccent() {
  const wrap = document.querySelector('.swatches');
  if (!wrap || wrap.dataset.ready) return;
  wrap.dataset.ready = '1';
  wrap.innerHTML = HUES.map((h) => `<button type="button" data-h="${h}" style="--h:${h}" aria-label="색상 ${h}"></button>`).join('');
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setHue(Number(b.dataset.h));
  });
  document.querySelector('.hue-range').addEventListener('input', (e) => setHue(Number(e.target.value)));
  syncAccentUI(get('hue', 32));
}
