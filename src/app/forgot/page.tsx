import type { Metadata } from 'next';
import { ForgotForm } from '@/components/auth/AuthForms';
import { mailReady } from '@/server/mail';

export const metadata: Metadata = { title: '비밀번호 찾기', robots: { index: false } };

export default function Forgot() {
  return (
    <section className="container page-head auth-page">
      <p className="eyebrow">Forgot password · 비밀번호 찾기</p>
      <h1 className="display">
        Lost your <em>key?</em>
      </h1>
      {mailReady() ? (
        <>
          <p className="lede">가입한 이메일로 비밀번호를 다시 정하는 링크를 보내 드려요. 계획 비밀번호(기장 비밀번호)는 되찾을 수 없어요.</p>
          <div className="auth-card">
            <ForgotForm />
          </div>
        </>
      ) : (
        // 메일을 보내지 않는 동안: 되찾을 길이 없다는 걸 솔직하게
        <div className="auth-card">
          <p>지금은 섬데트가 메일을 보내지 않아서 비밀번호를 메일로 되찾을 수 없어요.</p>
          <p className="muted">다른 기기에 로그인돼 있다면 그 기기의 내 계정에서 비밀번호를 바꿀 수 있어요. 계획 링크는 로그인하지 않아도 그대로 열려요.</p>
          <p>
            <a className="link-u" href="/login">
              ← 로그인으로
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
