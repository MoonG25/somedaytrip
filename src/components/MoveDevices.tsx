'use client';
// 탑승권 지갑 알림 + 다른 기기로 옮기기.
// 로그인하지 않았고 이 브라우저에 탑승권이 있으면 "이 브라우저에만 있어요"를 아래에 띄워 가입(지갑 보관)을 권한다.
// 화면을 밀지 않게 떠 있는 막대로. 닫으면 7일 동안 다시 안 띄운다. 로그인했으면 계정이 지갑이라 띄우지 않는다.
// 옮기기 링크·QR은 가입하지 않는 사람을 위해 남겨 둔다 (기장 토큰은 담지 않는다).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from './collab/Modal';
import { readMine } from '@/lib/mine';
import { toast } from './collab/util';
import { SaveTicketModal } from './auth/SaveTicket';

const HIDE_KEY = 'sdt:walletbar';

export default function MoveDevices() {
  const [ids, setIds] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState('');
  const [bar, setBar] = useState(false);
  const [save, setSave] = useState(false);
  useEffect(() => {
    try {
      const hidden = Number(localStorage.getItem(HIDE_KEY) || 0) > Date.now();
      setBar(!document.documentElement.dataset.authed && !hidden);
    } catch {
      setBar(!document.documentElement.dataset.authed);
    }
  }, []);
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
    <>
      {bar ? (
        <div className="wallet-bar" role="region" aria-label="탑승권 지갑">
          <span className="wb-ico" aria-hidden="true">
            🎫
          </span>
          <span className="wb-text">
            <b>탑승권 {ids.length}장이 이 브라우저에만 있어요</b>
            <small>기록을 지우거나 기기를 바꾸면 링크 없이는 못 찾아요</small>
          </span>
          <button type="button" className="btn btn--sm btn--solid" onClick={() => setSave(true)}>
            가입하고 보관
          </button>
          <button type="button" className="link-u faint wb-move" onClick={() => setOpen(true)}>
            옮기기 QR
          </button>
          <button
            type="button"
            className="icon-btn wb-close"
            aria-label="닫기 (7일 동안 안 보기)"
            onClick={() => {
              setBar(false);
              try {
                localStorage.setItem(HIDE_KEY, String(Date.now() + 7 * 86_400_000));
              } catch {}
            }}
          >
            ✕
          </button>
        </div>
      ) : null}
      <SaveTicketModal
        open={save}
        planId={null}
        onClose={() => {
          setSave(false);
          if (document.documentElement.dataset.authed) setBar(false);
        }}
      />
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
    </>
  );
}
