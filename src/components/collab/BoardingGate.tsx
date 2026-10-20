'use client';
// 탑승 수속: 링크로 처음 들어오면 계획 대신 탑승권을 먼저 보여 준다.
// 승객(그냥 참가)인지 기장(비밀번호)인지 고른 뒤, 스텁을 잡아 뜯으면 계획 화면으로 들어간다.
// 이 브라우저에서 한 번 탑승했거나, 기장 인증이 돼 있거나, 홈에서 탑승권을 뜯고 왔으면 건너뛴다.
// 서버에서 같이 그려서(검색엔진은 아래 본문을 그대로 읽는다) 탑승한 적 있으면 그리기 전에 숨긴다.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Item, Plan } from '@/lib/types';
import { ticketHTML, grabStub, tearStub } from '@/blog/ticket.js';
import { toView } from '@/blog/plans-lib.js';
import { login } from '@/app/actions';
import { rememberPlan } from '@/lib/mine';

const boardedKey = (id: string) => `sdt:boarded:${id}`;

export default function BoardingGate({ plan, items, nick, onCaptain, onBoard }: { plan: Plan; items: Item[]; nick?: string; onCaptain: () => void; onBoard?: (role: 'guest' | 'captain') => void }) {
  const [show, setShow] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [role, setRole] = useState<'guest' | 'captain' | null>(null);
  const [ready, setReady] = useState(false); // 수속 끝: 스텁을 뜯을 차례
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => ticketHTML({ ...toView(plan, items), href: '' }, { preview: true }).replace(' data-reveal', '').replace('loading="lazy"', 'loading="eager"'), [plan, items]);

  // 그리기 전에 확인해서, 탑승한 적 있으면 게이트가 번쩍 보이지 않게
  useLayoutEffect(() => {
    let skip = false;
    try {
      skip = !!localStorage.getItem(boardedKey(plan.id)) || sessionStorage.getItem('sdt:tore') === plan.id;
      sessionStorage.removeItem('sdt:tore');
      setName(nick || localStorage.getItem('sdt:name') || '');
    } catch {}
    if (skip) setShow(false);
  }, [plan.id]);

  // 열려 있는 동안 뒤 화면은 스크롤되지 않게
  useEffect(() => {
    if (!show) return;
    document.documentElement.classList.add('gate-open');
    return () => document.documentElement.classList.remove('gate-open');
  }, [show]);

  const enter = () => {
    try {
      localStorage.setItem(boardedKey(plan.id), '1');
    } catch {}
    rememberPlan(plan.id);
    setLeaving(true);
    setTimeout(() => {
      setShow(false);
      if (role === 'captain') onCaptain();
      onBoard?.(role === 'captain' ? 'captain' : 'guest');
    }, 380);
  };

  // 수속이 끝나면 스텁을 손으로 잡아 뜯을 수 있다
  useEffect(() => {
    const t = ticketRef.current?.querySelector<HTMLElement>('.ticket');
    if (!ready || !t) return;
    return grabStub(t, enter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!show) return null;

  const tearNow = () => {
    const t = ticketRef.current?.querySelector<HTMLElement>('.ticket');
    if (t) tearStub(t).then(enter);
    else enter();
  };

  const boardGuest = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, 20);
    try {
      if (n) localStorage.setItem('sdt:name', n);
    } catch {}
    setReady(true);
  };

  const boardCaptain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw) return setErr('비밀번호를 넣어 주세요');
    setBusy(true);
    const r = await login(plan.id, pw, true);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setPw('');
    setErr('');
    setReady(true);
  };

  const passenger = role === 'captain' ? `${plan.ownerName} 기장` : name.trim() || '승객';

  return (
    <div
      className={`boarding-gate${leaving ? ' is-leaving' : ''}${ready ? ' is-ready' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="탑승 수속"
    >
      {/* 탑승한 적 있으면 화면을 그리기 전에 숨긴다: layout의 첫 스크립트가 <html data-boarded>에 id를 적어 둔다 */}
      <style>{`html[data-boarded~="${plan.id.replace(/[^a-z0-9-]/gi, '')}"] .boarding-gate{display:none}`}</style>
      <div className="bg-inner">
        <header className="bg-head">
          <p className="eyebrow">Check-in · 탑승 수속</p>
          <h2>{ready ? '스텁을 뜯고 탑승하세요' : `${plan.ownerName} 기장의 여행에 초대받았어요`}</h2>
        </header>

        <div className="bg-ticket" ref={ticketRef}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {ready ? (
            <p className="bg-pass mono" aria-live="polite">
              PASSENGER · <b>{passenger}</b>
            </p>
          ) : null}
        </div>

        {ready ? (
          <div className="bg-tear">
            <p className="bg-hint">
              <span aria-hidden="true">✂</span> 탑승권 끝의 사진 스텁을 <b>잡아 당겨</b> 뜯어요
            </p>
            <button type="button" className="btn btn--solid" onClick={tearNow}>
              뜯고 탑승하기
            </button>
          </div>
        ) : (
          <div className="bg-roles">
            <form className={`bg-role${role === 'guest' ? ' on' : ''}`} onSubmit={boardGuest} onFocus={() => setRole('guest')} onClick={() => setRole('guest')}>
              <span className="bg-ico" aria-hidden="true">
                🧳
              </span>
              <b>승객으로 탑승</b>
              <p className="muted">일정을 보고, 가고 싶은 곳을 제안할 수 있어요. 비밀번호는 필요 없어요.</p>
              <input className="inp" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="이름 (선택)" aria-label="승객 이름" autoComplete="nickname" />
              <button type="submit" className="btn btn--solid">
                탑승권 받기
              </button>
            </form>
            <form className={`bg-role${role === 'captain' ? ' on' : ''}`} onSubmit={boardCaptain} onFocus={() => setRole('captain')} onClick={() => setRole('captain')}>
              <span className="bg-ico" aria-hidden="true">
                🧑‍✈️
              </span>
              <b>기장이에요</b>
              <p className="muted">계획을 만들 때 정한 비밀번호로 들어가요. 제안 수락·직접 수정을 할 수 있어요.</p>
              <input className="inp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="비밀번호" aria-label="기장 비밀번호" autoComplete="current-password" />
              {err && role === 'captain' ? (
                <p className="form-error" role="alert">
                  {err}
                </p>
              ) : null}
              <button type="submit" className="btn" disabled={busy}>
                {busy ? '확인 중…' : '기장 인증'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
