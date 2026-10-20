// 메일 보내기: Resend(무료 하루 100통) HTTP API. 키가 없으면 보내지 않고 개발 중에는 링크를 로그로 남긴다.
// 필요한 환경 변수: RESEND_API_KEY(Sensitive), MAIL_FROM (예: "섬데트 <hello@내도메인>")
import 'server-only';
import { SITE } from '@/lib/site';

export const mailReady = () => !!process.env.RESEND_API_KEY && !!process.env.MAIL_FROM;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 단순한 한 장짜리 메일: 제목, 문단들, 버튼 하나 */
function layout(title: string, lines: string[], button?: { label: string; url: string }) {
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f3efe6;font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;color:#17150f">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <p style="font:12px monospace;letter-spacing:.12em;color:#6f6a5d;margin:0 0 8px">SOMEDAYTRIP · 섬데트</p>
    <h1 style="font-size:22px;margin:0 0 16px">${esc(title)}</h1>
    ${lines.map((l) => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${esc(l)}</p>`).join('')}
    ${button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#17150f;color:#f3efe6;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:700">${esc(button.label)}</a></p><p style="font-size:12px;color:#6f6a5d;word-break:break-all">${esc(button.url)}</p>` : ''}
    <p style="font-size:12px;color:#6f6a5d;margin-top:32px">이 메일은 ${esc(SITE.name)}에서 보냈어요. 알림을 끄려면 <a href="${SITE.url}/account" style="color:#6f6a5d">내 계정</a>에서 바꿀 수 있어요.</p>
  </div></body></html>`;
  const text = [title, '', ...lines, ...(button ? ['', `${button.label}: ${button.url}`] : [])].join('\n');
  return { html, text };
}

export async function sendMail(to: string, subject: string, lines: string[], button?: { label: string; url: string }) {
  const { html, text } = layout(subject, lines, button);
  if (!mailReady()) {
    if (process.env.NODE_ENV !== 'production') console.info(`[mail:dev] → ${to} · ${subject}${button ? ` · ${button.url}` : ''}`);
    return false;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to, subject: `[섬데트] ${subject}`, html, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) console.error('[mail] 보내기 실패', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error('[mail] 보내기 실패', (e as Error).message);
    return false;
  }
}

export const link = (path: string) => `${SITE.url}${path}`;
