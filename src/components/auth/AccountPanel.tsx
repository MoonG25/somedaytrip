'use client';
// 내 계정: 인증 상태 · 알림 · 비밀번호 · 로그아웃 · 탈퇴
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changeAccountPassword, deleteAccount, resendVerify, setNotify, signout } from '@/app/auth-actions';
import { passwordError, PW_MIN } from '@/lib/account';
import Modal from '../collab/Modal';
import { toast } from '../collab/util';
import { markAuthed } from './AuthForms';

export default function AccountPanel({ user, owned, joined, mail }: { user: { nick: string; email: string; verified: boolean; notify: boolean }; owned: number; joined: number; mail: boolean }) {
  const router = useRouter();
  const [notify, setN] = useState(user.notify);
  const [modal, setModal] = useState<'pw' | 'delete' | null>(null);
  return (
    <div className="account">
      <div className="acc-card">
        <p className="eyebrow">Passenger card · 내 계정</p>
        <b className="acc-nick">{user.nick}</b>
        <p className="mono faint">{user.email}</p>
        <p className="acc-stat">
          🧑‍✈️ 기장인 계획 <b>{owned}</b> · 🧳 함께하는 계획 <b>{joined}</b>{' '}
          <a className="link-u" href="/">
            내 계획 보기 →
          </a>
        </p>
      </div>

      <section className="acc-sec">
        <h2>이메일 인증</h2>
        {user.verified ? (
          <p>✓ 인증된 이메일이에요. 알림과 비밀번호 찾기를 쓸 수 있어요.</p>
        ) : (
          <>
            <p className="muted">인증하면 새 제안 알림과 비밀번호 찾기를 쓸 수 있어요. 가입할 때 보낸 메일의 링크를 눌러 주세요.</p>
            {mail ? (
              <button
                type="button"
                className="btn btn--sm"
                onClick={async () => {
                  const r = await resendVerify();
                  toast(r.ok ? (r.data.sent ? '인증 메일을 다시 보냈어요' : '이미 인증됐어요') : r.error, r.ok ? '✉️' : '!');
                }}
              >
                ✉️ 인증 메일 다시 보내기
              </button>
            ) : (
              <p className="faint">지금은 메일 발송을 준비 중이에요. 준비되면 여기서 인증할 수 있어요.</p>
            )}
          </>
        )}
      </section>

      <section className="acc-sec">
        <h2>알림</h2>
        <label className="switch">
          <input
            type="checkbox"
            checked={notify && user.verified}
            disabled={!user.verified}
            onChange={async (e) => {
              const on = e.target.checked;
              setN(on);
              const r = await setNotify(on);
              if (!r.ok) {
                setN(!on);
                return toast(r.error, '!');
              }
              toast(on ? '알림을 켰어요' : '알림을 껐어요', on ? '🔔' : '🔕');
            }}
          />
          <span className="switch-ui" aria-hidden="true" />새 제안이 오거나 내 제안이 반영되면 메일로 알려 주기
        </label>
        {!user.verified ? <p className="faint">이메일을 인증하면 켤 수 있어요.</p> : null}
      </section>

      <section className="acc-sec acc-actions">
        <button type="button" className="btn btn--sm" onClick={() => setModal('pw')}>
          🔑 비밀번호 바꾸기
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={async () => {
            await signout();
            markAuthed(false);
            toast('로그아웃했어요', '👋');
            router.push('/');
            router.refresh();
          }}
        >
          🚪 로그아웃
        </button>
        <button type="button" className="link-u faint acc-delete" onClick={() => setModal('delete')}>
          탈퇴하기
        </button>
      </section>

      {modal === 'pw' ? <PwModal onClose={() => setModal(null)} /> : null}
      {modal === 'delete' ? <DeleteModal owned={owned} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function PwModal({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal open title="계정 비밀번호 바꾸기" onClose={onClose}>
      <form
        className="item-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const bad = passwordError(next);
          if (bad) return setErr(bad);
          const r = await changeAccountPassword(cur, next);
          if (!r.ok) return setErr(r.error);
          toast('비밀번호를 바꿨어요. 다른 기기 로그인은 풀렸어요', '🔑');
          onClose();
        }}
      >
        <label className="lbl">
          지금 비밀번호
          <input className="inp" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="lbl">
          새 비밀번호 <span className="faint">{PW_MIN}자 이상</span>
          <input className="inp" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </label>
        {err ? (
          <p className="form-error" role="alert">
            {err}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="submit" className="btn btn--solid">
            바꾸기
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteModal({ owned, onClose }: { owned: number; onClose: () => void }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal open title="탈퇴할까요?" onClose={onClose}>
      <form
        className="item-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await deleteAccount(pw);
          if (!r.ok) return setErr(r.error);
          markAuthed(false);
          toast('탈퇴했어요. 그동안 고마웠어요', '👋');
          router.push('/');
          router.refresh();
        }}
      >
        <ul className="pub-rules">
          <li>🗑 이메일·닉네임·비밀번호와 로그인 기록이 바로 지워져요.</li>
          <li>🗺 계획과 제안은 지워지지 않아요. 같이 짜던 친구들은 계속 볼 수 있어요.</li>
          {owned ? (
            <li>
              🧑‍✈️ 기장인 계획 <b>{owned}개</b>는 <b>계획 비밀번호</b>로만 관리할 수 있어요. 계정으로만 만든 계획이라면, 탈퇴 전에 각 계획의 ⋯ 메뉴에서 &ldquo;계획 비밀번호 정하기&rdquo;를 해 두세요.
            </li>
          ) : null}
        </ul>
        <label className="lbl">
          비밀번호 확인
          <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err ? (
          <p className="form-error" role="alert">
            {err}
          </p>
        ) : null}
        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn btn--solid danger-btn">
            탈퇴하기
          </button>
        </div>
      </form>
    </Modal>
  );
}
