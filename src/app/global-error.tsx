'use client';
// 레이아웃까지 실패했을 때의 마지막 화면 (스타일 파일 없이도 보이게 인라인)
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#f3efe6', color: '#17150f', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <p style={{ fontSize: 12, letterSpacing: '0.1em', color: '#8c8678' }}>SOMEDAY AIR · DELAYED</p>
          <h1 style={{ fontSize: 40, margin: '8px 0 12px' }}>잠시 문제가 생겼어요</h1>
          <p style={{ color: '#4b473e' }}>조금 뒤에 다시 시도해 주세요.</p>
          <button type="button" onClick={() => reset()} style={{ marginTop: 20, height: 44, padding: '0 22px', borderRadius: 999, border: 0, background: '#17150f', color: '#f3efe6', fontWeight: 700 }}>
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
