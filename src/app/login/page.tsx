import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/AuthForms';
import { currentUser } from '@/server/auth';

export const metadata: Metadata = { title: '로그인', robots: { index: false } };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentUser()) redirect(next?.startsWith('/') && !next.startsWith('//') ? next : '/account');
  return (
    <section className="container page-head auth-page">
      <p className="eyebrow">Sign in · 로그인</p>
      <h1 className="display">
        Welcome <em>back.</em>
      </h1>
      <p className="lede">로그인하면 어느 기기에서든 내 계획이 보이고, 계정으로 만든 계획은 비밀번호 없이 기장이에요.</p>
      <div className="auth-card">
        <LoginForm next={next} />
      </div>
    </section>
  );
}
