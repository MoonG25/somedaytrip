// 작은 화면 부품: 토스트, 모달(<dialog>), 확인창
import { esc } from '../lib/util';

export function toast(msg: string, kind: 'ok' | 'err' | '' = '') {
  let wrap = document.querySelector('.toasts');
  if (!wrap) {
    wrap = Object.assign(document.createElement('div'), { className: 'toasts' });
    wrap.setAttribute('role', 'status');
    document.body.append(wrap);
  }
  const t = Object.assign(document.createElement('div'), { className: `toast ${kind}`, textContent: msg });
  wrap.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 2600);
}

export interface ModalOpts {
  title: string;
  body: string;
  wide?: boolean;
  /** 열린 뒤 이벤트를 붙인다. close()를 부르면 닫힌다 */
  setup?: (el: HTMLDialogElement, close: () => void) => void | (() => void);
  onClose?: () => void;
}

export function modal({ title, body, wide, setup, onClose }: ModalOpts) {
  const d = document.createElement('dialog');
  d.className = `modal${wide ? ' wide' : ''}`;
  d.innerHTML = `
    <div class="modal-head">
      <h2>${esc(title)}</h2>
      <button type="button" class="icon-btn" data-close aria-label="닫기">✕</button>
    </div>
    <div class="modal-body">${body}</div>`;
  document.body.append(d);
  let cleanup: void | (() => void);
  const close = () => d.close();
  d.addEventListener('close', () => {
    cleanup?.();
    onClose?.();
    d.remove();
  });
  // 바깥(어두운 배경)을 누르면 닫힌다
  d.addEventListener('mousedown', (e) => {
    if (e.target === d) close();
  });
  d.querySelector('[data-close]')!.addEventListener('click', close);
  d.showModal();
  cleanup = setup?.(d, close);
  return { el: d, close };
}

export function confirmBox(title: string, text: string, ok = '확인', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    modal({
      title,
      body: `<p class="lead">${text}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-no>취소</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button>
        </div>`,
      setup(el, close) {
        el.querySelector('[data-no]')!.addEventListener('click', close);
        el.querySelector('[data-yes]')!.addEventListener('click', () => {
          result = true;
          close();
        });
      },
      onClose: () => resolve(result),
    });
  });
}

/** 버튼을 누른 동안 잠그고 결과를 기다린다 */
export async function busy<T>(btn: HTMLButtonElement | null, fn: () => Promise<T>): Promise<T> {
  if (btn) {
    btn.disabled = true;
    btn.classList.add('is-busy');
  }
  try {
    return await fn();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  }
}
