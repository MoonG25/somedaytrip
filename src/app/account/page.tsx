import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AccountPanel from '@/components/auth/AccountPanel';
import { users } from '@/server';
import { currentUser } from '@/server/auth';
import { mailReady } from '@/server/mail';

export const metadata: Metadata = { title: '내 계정', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Account({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const u = await currentUser();
  if (!u) redirect('/login?next=/account');
  const { welcome } = await searchParams;
  const links = await users().links(u.id);
  const owned = links.filter((l) => l.role === 'owner').length;
  return (
    <section className="container page-head auth-page">
      <p className="eyebrow">Account · 내 계정</p>
      <h1 className="display">
        {welcome ? (
          <>
            Welcome <em>aboard.</em>
          </>
        ) : (
          <>
            My <em>pass.</em>
          </>
        )}
      </h1>
      {welcome ? <p className="lede">가입했어요! {mailReady() ? '보낸 메일의 링크를 눌러 이메일을 인증해 주세요.' : '이제 어느 기기에서든 로그인하면 내 계획이 보여요.'}</p> : null}
      <AccountPanel user={{ nick: u.nick, email: u.email, verified: u.verified, notify: u.notify }} owned={owned} joined={links.length - owned} mail={mailReady()} />
    </section>
  );
}
