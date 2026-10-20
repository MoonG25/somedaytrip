// 가입 규칙. 브라우저(바로 안내)와 서버(진짜 검사)가 같이 쓴다.

export const NICK_MIN = 2;
export const NICK_MAX = 12;
export const PW_MIN = 8;

// 기장·승객처럼 화면에서 쓰는 말, 운영자로 오해할 이름은 막는다
const RESERVED = ['기장', '승객', '섬데트', 'somedaytrip', 'admin', 'administrator', 'root', 'system', '운영자', '관리자', 'support', 'help', 'official'];

export const normEmail = (e: string) => e.trim().toLowerCase();
/** 닉네임 중복 확인용 키: 공백 없애고 소문자 */
export const nickKey = (n: string) => n.normalize('NFC').replace(/\s+/g, '').toLowerCase();

export function emailError(e: string): string | null {
  const v = normEmail(e);
  if (!v) return '이메일을 적어 주세요';
  if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return '이메일 주소 모양이 아니에요';
  return null;
}

export function nickError(n: string): string | null {
  const v = n.normalize('NFC').trim();
  if (!v) return '닉네임을 적어 주세요';
  if ([...v].length < NICK_MIN || [...v].length > NICK_MAX) return `닉네임은 ${NICK_MIN}~${NICK_MAX}자예요`;
  if (!/^[가-힣a-zA-Z0-9_]+$/.test(v)) return '닉네임은 한글·영문·숫자·_만 쓸 수 있어요';
  if (RESERVED.some((r) => nickKey(v) === nickKey(r))) return '쓸 수 없는 닉네임이에요';
  return null;
}

export function passwordError(p: string): string | null {
  if (p.length < PW_MIN) return `비밀번호는 ${PW_MIN}자 이상이에요`;
  if (p.length > 200) return '비밀번호가 너무 길어요';
  return null;
}
