'use client';
// 서버나 DB 문제로 페이지를 못 그렸을 때 (moon.log 디자인)
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <section className="container page-head nf">
      <p className="eyebrow">503 · Delayed</p>
      <h1 className="display">
        Flight <em>delayed.</em>
      </h1>
      <p className="lede">잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요. 계획은 안전하게 저장돼 있어요.</p>
      <p style={{ marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--solid" onClick={() => reset()}>
          다시 시도
        </button>
        <a className="btn btn--ghost" href="/">
          떠날 곳으로
        </a>
      </p>
    </section>
  );
}
