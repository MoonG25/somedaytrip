-- 이메일 가입 (선택). 기존 테이블은 건드리지 않고 새 테이블만 더한다.
-- 계획과 계정의 연결은 user_plans에 둔다 → 링크 새로 만들기(id 변경)·계획 삭제는 FK가 따라간다.
-- 0001과 같이 RLS를 켜고 공개 키 권한을 회수한다. Next.js 서버만 접속한다.

create table if not exists users (
  id text primary key,
  email text not null,            -- 소문자로 저장
  nick text not null,             -- 보이는 그대로
  nick_key text not null,         -- 중복 확인용 (소문자·공백 없앰)
  salt text not null,
  hash text not null,
  iter int not null,
  verified_at timestamptz,
  notify boolean not null default true,
  fail_count int not null default 0,
  fail_until timestamptz,
  last_mail_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists users_email_key on users (email);
create unique index if not exists users_nick_key on users (nick_key);

-- 로그인 세션 (토큰은 해시만)
create table if not exists user_sessions (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists user_sessions_user_idx on user_sessions (user_id);

-- 이메일 인증·비밀번호 재설정 링크 (토큰은 해시만, 한 번만 쓴다)
create table if not exists user_tokens (
  token_hash text primary key,
  user_id text not null references users (id) on delete cascade,
  kind text not null check (kind in ('verify', 'reset')),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- 내 계획: owner = 계정이 기장 / member = 탑승했거나 기억한 계획
create table if not exists user_plans (
  user_id text not null references users (id) on delete cascade,
  plan_id text not null references plans (id) on delete cascade on update cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id)
);
create index if not exists user_plans_plan_idx on user_plans (plan_id);

alter table users enable row level security;
alter table user_sessions enable row level security;
alter table user_tokens enable row level security;
alter table user_plans enable row level security;
revoke all on users, user_sessions, user_tokens, user_plans from anon, authenticated;
