'use client';
// 다른 기기로 옮기기: 이 브라우저의 "내 계획" 목록을 링크·QR 하나로 옮긴다.
// 기장 토큰은 담지 않는다 (링크가 새도 고칠 권한은 넘어가지 않게). 새 기기에서는 비밀번호로 기장 인증.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './collab/Modal';
import { readMine } from '@/lib/mine';
import { toast } from './collab/util';

export default function MoveDevices() {
  const [ids, setIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  useEffect(() => {
    const read = () => setIds(readMine());
    read();
    window.addEventListener('sdt:mine', read); // 홈이 쿠키 백업에서 되살리면 다시 읽는다
    return () => window.removeEventListener('sdt:mine', read);
  }, []);
  const url = typeof location !== 'undefined' ? `${location.origin}/move#${ids.join('.')}` : '';
  useEffect(() => {
    if (open && url) QRCode.toDataURL(url, { width: 336, margin: 1, color: { dark: '#17150f', light: '#ffffff' } }).then(setQr, () => {});
  }, [open, url]);
  if (!ids.length) return null;
  return (
    <section className="container move-devices">
      <div className="md-card">
        <div>
          <p className="eyebrow">Move devices</p>
          <b>다른 기기에서도 내 계획 보기</b>
          <p className="muted">가입이 없어서 내 계획 목록은 이 브라우저에만 있어요. 휴대폰이나 다른 컴퓨터로 옮겨 두세요.</p>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>
          📲 옮기기 링크 · QR
        </button>
      </div>
      <Modal open={open} title="다른 기기로 옮기기" onClose={() => setOpen(false)} wide>
        <div className="share-grid">
          {qr ? <img className="qr" src={qr} alt="내 계획 옮기기 QR 코드" width={168} height={168} /> : <div className="qr" />}
          <div className="item-form">
            <p className="muted">새 기기에서 QR을 찍거나 링크를 열면 내 계획 <b>{ids.length}개</b>가 그 기기의 "내 계획"에 들어가요.</p>
            <div className="copy-row">
              <input className="inp mono" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="옮기기 링크" />
              <button
                type="button"
                className="btn btn--solid btn--sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    toast('링크를 복사했어요', '⧉');
                  } catch {
                    toast('복사하지 못했어요. 길게 눌러 복사해 주세요', '!');
                  }
                }}
              >
                복사
              </button>
            </div>
            <ul className="pub-rules">
              <li>🧑‍✈️ 기장 인증은 옮겨지지 않아요. 새 기기에서 계획을 열고 <b>비밀번호</b>로 인증하세요.</li>
              <li>🔒 이 링크로 계획을 <b>볼</b> 수는 있으니, 나만 쓰세요.</li>
            </ul>
          </div>
        </div>
      </Modal>
    </section>
  );
}
