import type { Metadata } from 'next';
import { ForgotForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: '비밀번호 찾기', robots: { index: false } };

export default function Forgot() {
  return (
    <section className="container page-head auth-page">
      <p className="eyebrow">Forgot password · 비밀번호 찾기</p>
      <h1 className="display">
        Lost your <em>key?</em>
      </h1>
      <p className="lede">가입한 이메일로 비밀번호를 다시 정하는 링크를 보내 드려요. 계획 비밀번호(기장 비밀번호)는 되찾을 수 없어요.</p>
      <div className="auth-card">
        <ForgotForm />
      </div>
    </section>
  );
}
