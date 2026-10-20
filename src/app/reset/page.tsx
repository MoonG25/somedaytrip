import type { Metadata } from 'next';
import { ResetForm } from '@/components/auth/AuthForms';

export const metadata: Metadata = { title: '비밀번호 다시 정하기', robots: { index: false }, referrer: 'no-referrer' };

export default async function Reset({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return (
    <section className="container page-head auth-page">
      <p className="eyebrow">Reset password · 비밀번호 다시 정하기</p>
      <h1 className="display">
        New <em>key.</em>
      </h1>
      <div className="auth-card">{t ? <ResetForm token={t} /> : <p className="muted">링크가 올바르지 않아요. 메일의 버튼을 다시 눌러 주세요.</p>}</div>
    </section>
  );
}
