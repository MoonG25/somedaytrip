import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SignupForm } from '@/components/auth/AuthForms';
import { currentUser } from '@/server/auth';
import { mailReady } from '@/server/mail';

export const metadata: Metadata = { title: '가입하기', robots: { index: false } };

export default async function Signup({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentUser()) redirect('/account');
  return (
    <section className="container page-head auth-page">
      <p className="eyebrow">Sign up · 가입하기</p>
      <h1 className="display">
        Get your <em>pass.</em>
      </h1>
      <p className="lede">이메일, 닉네임, 비밀번호면 끝이에요. 가입하지 않아도 계획을 만들고 탑승할 수 있어요.</p>
      <ul className="auth-perks" role="list">
        <li>📱 어느 기기에서든 내 계획</li>
        <li>🧑‍✈️ 계획마다 비밀번호를 기억하지 않아도 기장</li>
        {mailReady() ? <li>🔔 새 제안·반영 알림 메일</li> : null}
      </ul>
      {mailReady() ? null : <p className="faint auth-note">지금은 메일을 보내지 않아요. 비밀번호를 잊으면 되찾을 수 없으니 잘 기억해 두세요.</p>}
      <div className="auth-card">
        <SignupForm next={next} />
      </div>
    </section>
  );
}
