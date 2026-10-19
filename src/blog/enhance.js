// 렌더링된 페이지에 인터랙션을 입힌다. 라우터가 페이지를 그릴 때마다 호출된다.
//   [data-reveal]   뷰포트에 들어오면 나타남 (부모 [data-stagger]면 순차 지연)
//   [data-split]    단어 단위로 쪼개서 아래에서 올라오는 텍스트
//   [data-count]    숫자 카운트업
//   [data-tilt]     포인터를 따라 3D로 기울어짐 + 광택
//   [data-magnetic] 포인터 쪽으로 끌려옴
//   [data-scramble] 호버 시 글자가 뒤섞였다 돌아옴
//   [data-spotlight] 포인터 위치를 --mx/--my로 전달
import { $$, clamp, easeOutExpo, fmtNum, finePointer, reducedMotion } from './util.js';

function splitText(el) {
  if (el.dataset.splitDone) return;
  el.dataset.splitDone = '1';
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.append(document.createTextNode(part));
          else {
            const w = document.createElement('span');
            w.className = 'split-word';
            const inner = document.createElement('span');
            inner.style.setProperty('--i', i++);
            inner.textContent = part;
            w.append(inner);
            frag.append(w);
          }
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        // <em> 같은 강조는 통째로 한 단어처럼 다룬다
        const w = document.createElement('span');
        w.className = 'split-word';
        const inner = document.createElement('span');
        inner.style.setProperty('--i', i++);
        child.replaceWith(w);
        inner.append(child);
        w.append(inner);
      }
    });
  };
  walk(el);
}

function countUp(el) {
  const target = parseFloat(el.dataset.count);
  const digits = Number(el.dataset.digits || 0);
  const suffix = el.dataset.suffix || '';
  if (reducedMotion()) {
    el.textContent = fmtNum(target, digits) + suffix;
    return;
  }
  const dur = 1600;
  const t0 = performance.now();
  const tick = (now) => {
    const t = clamp((now - t0) / dur, 0, 1);
    el.textContent = fmtNum(target * easeOutExpo(t), digits) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const GLYPHS = '!<>-_\\/[]{}—=+*^?#ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export function scramble(el, finalText = el.dataset.text || el.textContent) {
  el.dataset.text = finalText;
  if (reducedMotion()) return;
  let frame = 0;
  const total = finalText.length * 2 + 6;
  if (!el._scr) {
    el.style.display = 'inline-block';
    el.style.width = `${el.getBoundingClientRect().width}px`;
    el.style.overflow = 'hidden';
    el.style.whiteSpace = 'nowrap';
    el.style.verticalAlign = 'bottom';
  }
  cancelAnimationFrame(el._scr);
  const tick = () => {
    el.textContent = [...finalText]
      .map((ch, i) => (ch === ' ' ? ' ' : frame / 2 > i ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
      .join('');
    if (frame++ < total) el._scr = requestAnimationFrame(tick);
    else {
      el.textContent = finalText;
      el._scr = 0;
      el.style.cssText = '';
    }
  };
  tick();
}

/** 3D 틸트. 이미 붙은 요소는 건너뛰므로 카드를 새로 그린 뒤 다시 불러도 된다 */
export function bindTilt(root = document) {
  if (!finePointer() || reducedMotion()) return;
  $$('[data-tilt]', root).forEach((el) => {
    if (el.dataset.tiltBound) return;
    el.dataset.tiltBound = '1';
    const max = Number(el.dataset.tilt) || 8;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--rx', `${(0.5 - py) * max}deg`);
      el.style.setProperty('--ry', `${(px - 0.5) * max}deg`);
      el.style.setProperty('--gx', `${px * 100}%`);
      el.style.setProperty('--gy', `${py * 100}%`);
      el.classList.add('tilting');
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    });
  });
}

export function enhance(root = document) {
  const cleanups = [];

  // 순차 지연
  $$('[data-stagger]', root).forEach((group) => {
    const step = Number(group.dataset.stagger) || 70;
    $$(':scope > [data-reveal]', group).forEach((el, i) => el.style.setProperty('--d', i * step));
  });
  $$('[data-split]', root).forEach(splitText);

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        if (e.target.dataset.count != null) countUp(e.target);
        io.unobserve(e.target);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.01 }
  );
  $$('[data-reveal]:not(.is-in), [data-split]:not(.is-in), [data-count], .score-ring[data-observe]', root).forEach((el) => io.observe(el));
  cleanups.push(() => io.disconnect());

  if (finePointer() && !reducedMotion()) {
    bindTilt(root);

    // 자석 버튼
    $$('[data-magnetic]:not([data-mag-bound])', root).forEach((el) => {
      el.dataset.magBound = '1';
      const strength = Number(el.dataset.magnetic) || 0.3;
      el.style.transition = 'transform .5s cubic-bezier(.16,1,.3,1)';
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * strength}px, ${(e.clientY - r.top - r.height / 2) * strength}px)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    });

    // 스포트라이트
    $$('[data-spotlight]:not([data-spot-bound])', root).forEach((el) => {
      el.dataset.spotBound = '1';
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  // 글자 뒤섞기
  $$('[data-scramble]:not([data-scr-bound])', root).forEach((el) => {
    el.dataset.scrBound = '1';
    const target = el.closest('a, button') || el;
    target.addEventListener('pointerenter', () => scramble(el));
  });

  return () => cleanups.forEach((fn) => fn());
}
