'use client';
// moon.log 다이얼로그 모양의 모달. open이 true인 동안 showModal()로 띄운다.
import { useEffect, useRef } from 'react';

export default function Modal({ open, title, onClose, wide, children }: { open: boolean; title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`sdt-modal${wide ? ' wide' : ''}`}
      onClose={onClose}
      onMouseDown={(e) => e.target === ref.current && onClose()}
      aria-label={title}
    >
      {open && (
        <div className="sdt-modal-box">
          <header className="sdt-modal-head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          </header>
          <div className="sdt-modal-body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
