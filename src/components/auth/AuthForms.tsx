'use client';
// 가입 · 로그인 · 비밀번호 찾기 · 재설정 폼. 중복 확인은 입력을 멈추면 바로 알려 준다.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkAvailable, forgot, resetPassword, signin, signup } from '@/app/auth-actions';
import { emailError, nickError, passwordError, NICK_MAX, PW_MIN } from '@/lib/account';
import { toast } from '../collab/util';

/** 머리말의 로그인/내 계정 버튼은 <html data-authed>로 바꾼다 (첫 화면은 layout 스크립트가 쿠키로 정함) */
export const markAuthed = (on: boolean) => {
  if (on) document.documentElement.dataset.authed = '1';
  else delete document.documentElement.dataset.authed;
};

/** 다른 사이트로 보내지 않게 우리 사이트 경로만 */
const safeNext = (n: string | null | undefined) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);

type Check = { state: 'idle' | 'checking' | 'ok' | 'bad'; msg: string };

/** 입력을 멈추고 0.5초 뒤 형식 → 중복 순서로 확인 */
function useAvailability(kind: 'email' | 'nick', value: string): Check {
  const [c, setC] = useState<Check>({ state: 'idle', msg: '' });
  const seq = useRef(0);
  useEffect(() => {
    if (!value.trim()) return setC({ state: 'idle', msg: '' });
    const bad = kind === 'email' ? emailError(value) : nickError(value);
    if (bad) return setC({ state: 'bad', msg: bad });
    const n = ++seq.current;
    setC({ state: 'checking', msg: '확인 중…' });
    const t = setTimeout(async () => {
      const r = await checkAvailable(kind === 'email' ? { email: value } : { nick: value });
      if (n !== seq.current) return;
      if (!r.ok) return setC({ state: 'idle', msg: r.error });
      const free = kind === 'email' ? r.data.email : r.data.nick;
      setC(free ? { state: 'ok', msg: kind === 'email' ? '쓸 수 있는 이메일이에요' : '쓸 수 있는 닉네임이에요' } : { state: 'bad', msg: kind === 'email' ? '이미 가입된 이메일이에요' : '이미 쓰는 닉네임이에요' });
    }, 500);
    return () => clearTimeout(t);
  }, [kind, value]);
  return c;
}

function Hint({ c, id }: { c: Check; id: string }) {
  if (!c.msg) return null;
  return (
    <span id={id} className={`auth-hint ${c.state}`} role={c.state === 'bad' ? 'alert' : undefined}>
      {c.state === 'ok' ? '✓ ' : c.state === 'bad' ? '! ' : ''}
      {c.msg}
    </span>
  );
}

function PasswordInput({ value, onChange, auto, label = '비밀번호' }: { value: string; onChange: (v: string) => void; auto: string; label?: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw-wrap">
      <input className="inp" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={auto} aria-label={label} required />
      <button type="button" className="pw-show" aria-pressed={show} onClick={() => setShow(!show)}>
        {show ? '숨기기' : '보기'}
      </button>
    </span>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [nick, setNick] = useState('');
  const [pw, setPw] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ec = useAvailability('email', email);
  const nc = useAvailability('nick', nick);
  useEffect(() => {
    try {
      const n = localStorage.getItem('sdt:name');
      if (n && !nickError(n)) setNick(n);
    } catch {}
  }, []);
  const pwBad = pw ? passwordError(pw) : null;
  const ready = ec.state === 'ok' && nc.state === 'ok' && !passwordError(pw) && agree;
  return (
    <form
      className="item-form auth-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const bad = emailError(email) || nickError(nick) || passwordError(pw) || (!agree ? '개인정보 수집·이용에 동의해 주세요' : null) || (ec.state === 'bad' ? ec.msg : nc.state === 'bad' ? nc.msg : null);
        if (bad) return setErr(bad);
        setBusy(true);
        const r = await signup({ email, nick, password: pw, agree });
        setBusy(false);
        if (!r.ok) return setErr(r.error);
        markAuthed(true);
        try {
          localStorage.setItem('sdt:name', r.data.nick);
        } catch {}
        toast(`${r.data.nick}님, 환영해요!`, '🎫');
        router.push(safeNext(next) || '/account?welcome=1');
        router.refresh();
      }}
    >
      <label className="lbl">
        이메일
        <input className="inp" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-describedby="h-email" required autoFocus />
        <Hint c={ec} id="h-email" />
      </label>
      <label className="lbl">
        닉네임 <span className="faint">2~{NICK_MAX}자 · 한글·영문·숫자·_</span>
        <input className="inp" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={NICK_MAX} autoComplete="nickname" aria-describedby="h-nick" required />
        <Hint c={nc} id="h-nick" />
      </label>
      <label className="lbl">
        비밀번호 <span className="faint">{PW_MIN}자 이상</span>
        <PasswordInput value={pw} onChange={setPw} auto="new-password" />
        {pwBad ? <span className="auth-hint bad">! {pwBad}</span> : null}
      </label>
      <label className="auth-agree">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          <a href="/privacy" target="_blank" className="link-u">
            개인정보 수집·이용
          </a>
          에 동의하고, 만 14세 이상이에요 <b>(필수)</b>
        </span>
      </label>
      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
      <button type="submit" className="btn btn--solid auth-submit" disabled={busy || !ready}>
        {busy ? '가입하는 중…' : '가입하기'}
      </button>
      <p className="auth-alt faint">
        이미 계정이 있나요?{' '}
        <a className="link-u" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
          로그인
        </a>
      </p>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form
      className="item-form auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await signin({ email, password: pw });
        setBusy(false);
        if (!r.ok) return setErr(r.error);
        markAuthed(true);
        toast(`${r.data.nick}님, 어서 오세요`, '👋');
        router.push(safeNext(next) || '/');
        router.refresh();
      }}
    >
      <label className="lbl">
        이메일
        <input className="inp" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
      </label>
      <label className="lbl">
        비밀번호
        <PasswordInput value={pw} onChange={setPw} auto="current-password" />
      </label>
      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
      <button type="submit" className="btn btn--solid auth-submit" disabled={busy}>
        {busy ? '확인 중…' : '로그인'}
      </button>
      <p className="auth-alt faint">
        <a className="link-u" href="/forgot">
          비밀번호를 잊었어요
        </a>{' '}
        ·{' '}
        <a className="link-u" href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
          가입하기
        </a>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (sent)
    return (
      <div className="auth-done">
        <p>
          <b>{email}</b>(으)로 가입돼 있다면 비밀번호를 다시 정하는 메일을 보냈어요. 메일함(스팸함도)을 확인해 주세요.
        </p>
        <a className="btn" href="/login">
          로그인으로
        </a>
      </div>
    );
  return (
    <form
      className="item-form auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const bad = emailError(email);
        if (bad) return setErr(bad);
        setBusy(true);
        const r = await forgot(email);
        setBusy(false);
        if (!r.ok) return setErr(r.error);
        setSent(true);
      }}
    >
      <label className="lbl">
        가입한 이메일
        <input className="inp" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
      </label>
      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
      <button type="submit" className="btn btn--solid auth-submit" disabled={busy}>
        재설정 메일 보내기
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <form
      className="item-form auth-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const bad = passwordError(pw);
        if (bad) return setErr(bad);
        setBusy(true);
        const r = await resetPassword(token, pw);
        setBusy(false);
        if (!r.ok) return setErr(r.error);
        markAuthed(true);
        toast('비밀번호를 바꿨어요. 다른 기기 로그인은 풀렸어요', '🔑');
        router.push('/account');
        router.refresh();
      }}
    >
      <label className="lbl">
        새 비밀번호 <span className="faint">{PW_MIN}자 이상</span>
        <PasswordInput value={pw} onChange={setPw} auto="new-password" label="새 비밀번호" />
      </label>
      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}
      <button type="submit" className="btn btn--solid auth-submit" disabled={busy}>
        비밀번호 바꾸기
      </button>
    </form>
  );
}
