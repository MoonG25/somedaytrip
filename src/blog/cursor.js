// 커스텀 커서: 점은 즉시, 링은 관성으로 따라온다. [data-cursor="라벨"]에 올리면 라벨이 뜬다.
import { $, lerp, finePointer, reducedMotion } from './util.js';

export function initCursor() {
  if (!finePointer() || reducedMotion()) return;
  const root = $('.cursor');
  const dot = $('.cursor-dot', root);
  const ring = $('.cursor-ring', root);
  const label = $('.cursor-label', root);
  document.documentElement.classList.add('has-cursor');
  root.classList.add('hidden');

  const pos = { x: innerWidth / 2, y: innerHeight / 2 };
  const ringPos = { ...pos };
  let shown = false;
  // 누르면 링이 제자리에서 살짝 줄어든다. 위치 transform 안에서 함께 계산해야
  // 크기 변화가 위치까지 줄이지 않는다 (CSS scale을 따로 주면 화면 왼쪽 위로 끌려감)
  let pressed = false;
  let ringScale = 1;
  let raf = 0;
  const wake = () => (raf ||= requestAnimationFrame(loop));

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      pos.x = e.clientX;
      pos.y = e.clientY;
      if (!shown) {
        ringPos.x = pos.x;
        ringPos.y = pos.y;
        shown = true;
        root.classList.remove('hidden');
      }
      dot.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      wake();
    },
    { passive: true }
  );
  document.addEventListener('pointerleave', () => root.classList.add('hidden'));
  addEventListener('pointerdown', () => {
    pressed = true;
    root.classList.add('down');
    wake();
  });
  addEventListener('pointerup', () => {
    pressed = false;
    root.classList.remove('down');
    wake();
  });

  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-cursor], a, button, [role="button"], label, summary, select');
    const text = t?.closest('[data-cursor]')?.dataset.cursor;
    root.classList.toggle('hover', !!t && !text);
    root.classList.toggle('label', !!text);
    if (text) label.textContent = text;
    const hide = e.target.closest?.('input, textarea, .leaflet-container, canvas.drawable, [data-cursor-hide]');
    root.classList.toggle('hidden', !!hide);
  });

  function loop() {
    ringPos.x = lerp(ringPos.x, pos.x, 0.18);
    ringPos.y = lerp(ringPos.y, pos.y, 0.18);
    const scaleTarget = pressed ? 0.82 : 1;
    ringScale = lerp(ringScale, scaleTarget, 0.25);
    ring.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) scale(${ringScale.toFixed(3)})`;
    const settled = Math.abs(ringPos.x - pos.x) < 0.1 && Math.abs(ringPos.y - pos.y) < 0.1 && Math.abs(ringScale - scaleTarget) < 0.002;
    raf = settled ? 0 : requestAnimationFrame(loop);
  }
  wake();
}
