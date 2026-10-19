import { esc } from './util.js';

export function toast(message, icon = '✦', ms = 2400) {
  const host = document.querySelector('.toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span aria-hidden="true">${icon}</span><span>${esc(message)}</span>`;
  host.append(el);
  setTimeout(() => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, ms);
}
