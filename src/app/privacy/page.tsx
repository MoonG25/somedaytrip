import type { Metadata } from 'next';

export const metadata: Metadata = { title: '개인정보처리방침', alternates: { canonical: '/privacy' } };

// 운영자 연락처는 공개 저장소의 이슈로 받는다 (개인 이메일을 페이지에 싣지 않는다)
export default function Privacy() {
  return (
    <section className="container page-head privacy">
      <p className="eyebrow">Privacy · 개인정보처리방침</p>
      <h1 className="display">
        Your <em>data.</em>
      </h1>
      <p className="lede">섬데트는 가입하지 않아도 쓸 수 있어요. 가입하면 아래 정보만 받고, 서비스를 위해서만 써요.</p>
      <div className="privacy-body">
        <h2>1. 받는 정보와 쓰는 곳</h2>
        <ul>
          <li><b>이메일</b>: 로그인, 이메일 인증, 비밀번호 찾기, 알림 메일(켠 경우)</li>
          <li><b>닉네임</b>: 계획·제안에 이름으로 보여 주기</li>
          <li><b>비밀번호</b>: 원문은 저장하지 않고 되돌릴 수 없는 해시(PBKDF2)만 저장</li>
          <li><b>쿠키</b>: 로그인 유지(30일), 기장 인증, 내 계획 목록. 광고·추적 쿠키는 쓰지 않아요</li>
        </ul>
        <h2>2. 보관 기간</h2>
        <p>탈퇴하면 이메일·닉네임·비밀번호 해시·로그인 기록을 바로 지워요. 함께 짠 계획과 제안은 다른 사람의 기록이기도 해서 남아요(닉네임은 글자로만 남아요).</p>
        <h2>3. 맡기는 곳 (처리 위탁)</h2>
        <ul>
          <li>Vercel: 서비스 운영(서버)</li>
          <li>Supabase: 데이터 저장(서울 리전)</li>
          <li>Resend: 인증·알림 메일 발송</li>
        </ul>
        <p>위 목적 밖으로 다른 곳에 제공하거나 팔지 않아요.</p>
        <h2>4. 이용자의 권리</h2>
        <p>언제든 <a className="link-u" href="/account">내 계정</a>에서 알림을 끄거나 탈퇴할 수 있어요.</p>
        <h2>5. 만 14세 미만</h2>
        <p>만 14세 미만은 가입할 수 없어요. 가입하지 않고 계획을 보고 제안하는 것은 누구나 할 수 있어요.</p>
        <h2>6. 문의</h2>
        <p>
          <a className="link-u" href="https://github.com/MoonG25/somedaytrip/issues" target="_blank" rel="noopener noreferrer">
            GitHub 이슈
          </a>
          로 남겨 주세요.
        </p>
        <p className="faint">시행일: 2026년 10월 20일</p>
      </div>
    </section>
  );
}
