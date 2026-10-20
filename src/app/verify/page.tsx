import type { Metadata } from 'next';
import { users, isRepoError } from '@/server';

export const metadata: Metadata = { title: '이메일 인증', robots: { index: false }, referrer: 'no-referrer' };
export const dynamic = 'force-dynamic';

export default async function Verify({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  let msg = '링크가 올바르지 않아요. 메일의 버튼을 다시 눌러 주세요.';
  let ok = false;
  if (t) {
    try {
      await users().verify(t);
      ok = true;
      msg = '이메일 인증이 끝났어요. 이제 새 제안 알림과 비밀번호 찾기를 쓸 수 있어요.';
    } catch (e) {
      msg = isRepoError(e) ? e.message : '인증하지 못했어요. 잠시 뒤 다시 해 주세요.';
    }
  }
  return (
    <section className="container page-head auth-page">
      <p className="eyebrow">Verify · 이메일 인증</p>
      <h1 className="display">{ok ? <>Verified<em>!</em></> : <>Hmm<em>…</em></>}</h1>
      <p className="lede">{msg}</p>
      <p style={{ marginTop: 20 }}>
        <a className="btn btn--solid" href="/account">
          내 계정으로 →
        </a>
      </p>
    </section>
  );
}
