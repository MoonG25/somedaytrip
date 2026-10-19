'use client';
// 계획 화면의 협업 부분: 역할 표시줄(주인/손님) + 공유·인증·주인 메뉴 + 일정.
// 주인은 "손님 화면 미리보기"로 친구가 보는 화면을 볼 수 있다 (이 탭에서만).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import type { Item, Plan } from '@/lib/types';
import { changePassword, deletePlan, login, logout, rejectAll, updatePlan } from '@/app/actions';
import { forgetPlan, rememberPlan } from '@/lib/mine';
import Itinerary from './Itinerary';
import Modal from './Modal';
import { broadcast, toast } from './util';

const previewKey = (id: string) => `sdt:preview:${id}`;

export default function PlanShell({ plan, items, owner: isOwner, open, children }: { plan: Plan; items: Item[]; owner: boolean; open: number; children?: React.ReactNode }) {
  const router = useRouter();
  const [preview, setPreview] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [modal, setModal] = useState<'share' | 'login' | 'password' | 'publish' | null>(null);
  const owner = isOwner && !preview;

  useEffect(() => {
    try {
      setPreview(sessionStorage.getItem(previewKey(plan.id)) === '1');
    } catch {}
    // 링크로 받은 계획과 내가 주인인 계획은 "내 계획"에 넣어 둔다
    if (isOwner || plan.visibility === 'link') rememberPlan(plan.id);
    if (new URLSearchParams(location.search).get('welcome')) {
      setWelcome(true);
      setModal('share');
      history.replaceState(null, '', location.pathname);
    }
  }, [plan.id, plan.visibility, isOwner]);

  // 실시간(1단계): 다른 탭에서 바뀌면 바로, 그 밖에는 30초마다 보이는 동안 새로 받기
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('sdt');
      bc.onmessage = (e) => e.data?.id === plan.id && router.refresh();
    } catch {}
    const iv = setInterval(() => document.visibilityState === 'visible' && router.refresh(), 30000);
    return () => {
      bc?.close();
      clearInterval(iv);
    };
  }, [plan.id, router]);

  const setPrev = (on: boolean) => {
    try {
      if (on) sessionStorage.setItem(previewKey(plan.id), '1');
      else sessionStorage.removeItem(previewKey(plan.id));
    } catch {}
    setPreview(on);
  };

  const closeMenu = (e: React.MouseEvent) => (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');

  const setVisibility = async (v: Plan['visibility']) => {
    const { id: _i, slug: _s, version: _v, createdAt: _c, updatedAt: _u, sample: _x, copiedFrom: _f, ...info } = plan;
    const r = await updatePlan(plan.id, { ...info, visibility: v });
    if (!r.ok) return toast(r.error, '!');
    broadcast(plan.id);
    toast(v === 'public' ? '전체 공개로 바꿨어요. 이제 누구나 볼 수 있어요' : '링크 공개로 바꿨어요. 검색에서 빠져요', '✓');
    router.refresh();
  };

  return (
    <>
      <div className="container">
        <div className={`role-bar ${owner ? 'is-owner' : 'is-guest'}`}>
          <div className="role-text">
            {owner ? (
              <>
                <span className="role-chip mono">OWNER</span> <b>주인</b>으로 보는 중이에요. 고치면 바로 반영돼요.
              </>
            ) : isOwner ? (
              <>
                <span className="role-chip mono">PREVIEW</span> 손님 화면을 미리 보는 중이에요.
              </>
            ) : (
              <>
                <span className="role-chip mono">GUEST</span> 일정을 고치면 <b>제안</b>으로 모였다가, 주인(<b>{plan.ownerName}</b>)이 수락하면 반영돼요.
              </>
            )}
          </div>
          <div className="role-actions">
            {owner && open ? (
              <a className="btn btn--sm btn--solid" href="#proposals">
                검토할 제안 {open}개
              </a>
            ) : null}
            <button type="button" className="btn btn--sm" onClick={() => setModal('share')}>
              🔗 공유
            </button>
            {plan.visibility === 'public' && !owner ? (
              <a className="btn btn--sm btn--ghost" href={`/new?from=${plan.id}`}>
                ⧉ 이 계획으로 내 계획 만들기
              </a>
            ) : null}
            {isOwner && preview ? (
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setPrev(false)}>
                주인 화면으로
              </button>
            ) : null}
            {!isOwner ? (
              <button type="button" className="link-u faint" onClick={() => setModal('login')}>
                주인이신가요?
              </button>
            ) : null}
            {owner ? (
              <details className="owner-menu">
                <summary className="icon-btn" aria-label="주인 메뉴">
                  ⋯
                </summary>
                <div className="owner-pop">
                  <a href={`/p/${plan.id}/edit`}>✎ 계획 정보 고치기</a>
                  {plan.visibility === 'link' ? (
                    <button type="button" onClick={(e) => (closeMenu(e), setModal('publish'))}>
                      🌍 전체 공개로 바꾸기
                    </button>
                  ) : (
                    <button type="button" onClick={(e) => (closeMenu(e), setVisibility('link'))}>
                      🔗 링크 공개로 바꾸기
                    </button>
                  )}
                  {open ? (
                    <button
                      type="button"
                      onClick={async (e) => {
                        closeMenu(e);
                        if (!confirm(`열린 제안 ${open}개를 모두 거절할까요?`)) return;
                        const r = await rejectAll(plan.id, '');
                        if (!r.ok) return toast(r.error, '!');
                        broadcast(plan.id);
                        router.refresh();
                        toast(`${r.data.n}개를 거절했어요`, '🙅');
                      }}
                    >
                      🙅 열린 제안 모두 거절
                    </button>
                  ) : null}
                  <button type="button" onClick={(e) => (closeMenu(e), setPrev(true))}>
                    👀 손님 화면 미리보기
                  </button>
                  <button type="button" onClick={(e) => (closeMenu(e), setModal('password'))}>
                    🔑 비밀번호 바꾸기
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      closeMenu(e);
                      if (!confirm('이 브라우저에서 주인 인증을 풀까요? 비밀번호를 넣으면 언제든 다시 주인이 될 수 있어요.')) return;
                      await logout(plan.id);
                      router.refresh();
                      toast('주인 인증을 풀었어요', '🚪');
                    }}
                  >
                    🚪 주인 인증 풀기
                  </button>
                  <hr />
                  <button
                    type="button"
                    className="danger"
                    onClick={async (e) => {
                      closeMenu(e);
                      if (!confirm(`'${plan.title}' 계획과 제안, 기록이 모두 사라져요. 되돌릴 수 없어요. 삭제할까요?`)) return;
                      const r = await deletePlan(plan.id);
                      if (!r.ok) return toast(r.error, '!');
                      forgetPlan(plan.id);
                      broadcast(plan.id);
                      toast('삭제했어요', '🗑');
                      router.replace('/');
                    }}
                  >
                    🗑 계획 삭제
                  </button>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>

      {children}
      <Itinerary plan={plan} items={items} owner={owner} />

      <ShareModal open={modal === 'share'} plan={plan} welcome={welcome} onClose={() => (setModal(null), setWelcome(false))} />
      <LoginModal
        open={modal === 'login'}
        plan={plan}
        onClose={() => setModal(null)}
        onDone={() => {
          setModal(null);
          setPrev(false);
          rememberPlan(plan.id);
          router.refresh();
          toast('주인으로 인증됐어요', '👑');
        }}
      />
      <PasswordModal open={modal === 'password'} plan={plan} onClose={() => setModal(null)} />
      <Modal open={modal === 'publish'} title="전체 공개로 바꿀까요?" onClose={() => setModal(null)}>
        <div className="item-form">
          <ul className="pub-rules">
            <li>🌍 링크가 없는 사람도 <b>누구나</b> 볼 수 있고, 검색 결과(Google·네이버)에 나올 수 있어요.</li>
            <li>📮 누구나 제안할 수 있지만, 반영은 여전히 <b>주인만</b> 할 수 있어요.</li>
            <li>⏳ 나중에 공개를 꺼도 검색 결과에서 사라지기까지 며칠 걸릴 수 있어요.</li>
            <li>🏠 동네 여행이라면 집 주소처럼 알리고 싶지 않은 정보가 없는지 확인하세요.</li>
          </ul>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setModal(null)}>
              취소
            </button>
            <button
              type="button"
              className="btn btn--solid"
              onClick={() => {
                setModal(null);
                setVisibility('public');
              }}
            >
              전체 공개하기
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ShareModal({ open, plan, onClose, welcome }: { open: boolean; plan: Plan; onClose: () => void; welcome?: boolean }) {
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (!open) return;
    const u = `${location.origin}/p/${plan.id}/${plan.slug}`;
    setUrl(u);
    QRCode.toDataURL(u, { width: 336, margin: 1, color: { dark: '#17150f', light: '#ffffff' } }).then(setQr, () => {});
  }, [open, plan.id, plan.slug]);
  return (
    <Modal open={open} title={welcome ? '계획이 생겼어요' : '친구에게 공유'} onClose={onClose} wide>
      <div className="share-grid">
        {qr ? <img className="qr" src={qr} alt="계획 링크 QR 코드" width={168} height={168} /> : <div className="qr" />}
        <div className="item-form">
          <div className="copy-row">
            <input className="inp mono" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="공유 링크" />
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
          {typeof navigator !== 'undefined' && 'share' in navigator ? (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigator.share({ title: plan.title, text: '같이 계획 짜자! 일정을 제안해 줘', url }).catch(() => {})}>
              📤 다른 앱으로 보내기
            </button>
          ) : null}
          {welcome ? <p className="muted">링크를 친구에게 보내 보세요. 친구가 일정을 고치면 <b>제안</b>으로 쌓이고, 주인인 내가 수락하거나 거절해요. <b>비밀번호는 되찾을 수 없으니 꼭 기억해 두세요.</b></p> : null}
          <ul className="pub-rules">
            <li>🔗 링크를 받은 사람은 누구나 일정을 <b>제안</b>할 수 있어요.</li>
            <li>👑 반영은 비밀번호를 아는 <b>주인</b>만 할 수 있어요.</li>
            <li>{plan.visibility === 'public' ? '🌍 지금 전체 공개라서 검색으로도 찾을 수 있어요.' : '🙈 지금 링크 공개라서 검색에는 나오지 않아요.'}</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function LoginModal({ open, plan, onClose, onDone }: { open: boolean; plan: Plan; onClose: () => void; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title="주인 인증" onClose={onClose}>
      <form
        className="item-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await login(plan.id, pw, remember);
          setBusy(false);
          if (!r.ok) {
            setErr(r.error);
            return;
          }
          setPw('');
          setErr('');
          onDone();
        }}
      >
        <p className="muted">&lsquo;{plan.title}&rsquo;을 만들 때 정한 비밀번호를 넣어 주세요. 쿠키를 지웠거나 다른 기기여도 괜찮아요.</p>
        <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" placeholder="비밀번호" autoFocus />
        <label className="switch">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="switch-ui" aria-hidden="true" />이 브라우저에서 기억하기 <span className="faint">(공용 PC라면 끄세요)</span>
        </label>
        {err ? (
          <p className="form-error" role="alert">
            {err}
          </p>
        ) : null}
        <p className="hint">비밀번호를 잊었다면 되찾을 수 없어요. 그래도 손님으로 제안은 계속할 수 있어요.</p>
        <div className="modal-actions">
          <button type="submit" className="btn btn--solid" disabled={busy}>
            인증하기
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ open, plan, onClose }: { open: boolean; plan: Plan; onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal open={open} title="주인 비밀번호 바꾸기" onClose={onClose}>
      <form
        className="item-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (next.length < 4) return setErr('새 비밀번호는 4자 이상이어야 해요');
          if (next !== next2) return setErr('새 비밀번호 두 개가 서로 달라요');
          const r = await changePassword(plan.id, cur, next);
          if (!r.ok) return setErr(r.error);
          setCur('');
          setNext('');
          setNext2('');
          setErr('');
          onClose();
          toast('비밀번호를 바꿨어요. 다른 기기의 주인 인증은 풀렸어요', '🔑');
        }}
      >
        <label className="lbl">
          지금 비밀번호
          <input className="inp" type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="lbl">
          새 비밀번호
          <input className="inp" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </label>
        <label className="lbl">
          한 번 더
          <input className="inp" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
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
