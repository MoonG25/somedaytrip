-- 섬데트 스키마. 모든 접근은 Next.js 서버(DB 직접 접속)로만 한다.
-- RLS를 켜고 정책을 두지 않아서, 공개(anon) API 키로는 아무것도 읽거나 쓸 수 없다.

create table if not exists plans (
  id text primary key,
  slug text not null,
  visibility text not null default 'link' check (visibility in ('link', 'public')),
  info jsonb not null,            -- PlanInfo (제목·장소·예산·체크리스트 등)
  items jsonb not null default '[]'::jsonb, -- 일정
  version int not null default 1,
  sample boolean not null default false,
  copied_from text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plans_public_idx on plans (updated_at desc) where visibility = 'public';

-- 비밀번호 해시·주인 토큰(해시)·틀린 횟수·제안 횟수 기록. 화면으로 절대 나가지 않는다
create table if not exists plan_secrets (
  plan_id text primary key references plans (id) on delete cascade,
  salt text not null,
  hash text not null,
  iter int not null,
  tokens text[] not null default '{}',
  fail_count int not null default 0,
  fail_until timestamptz,
  recent jsonb not null default '{}'::jsonb
);

create table if not exists proposals (
  id text primary key,
  plan_id text not null references plans (id) on delete cascade,
  no int not null,
  author_id text not null,
  author_name text not null,
  title text not null,
  message text not null default '',
  base_version int not null,
  ops jsonb not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'partial', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  note text,
  skipped int[],
  unique (plan_id, no)
);
create index if not exists proposals_plan_idx on proposals (plan_id, no desc);

create table if not exists plan_history (
  id text primary key,
  plan_id text not null references plans (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  actor text not null,
  summary text not null,
  proposal_no int,
  version int not null
);
create index if not exists plan_history_plan_idx on plan_history (plan_id, at desc);

alter table plans enable row level security;
alter table plan_secrets enable row level security;
alter table proposals enable row level security;
alter table plan_history enable row level security;

-- 혹시 모를 공개 API 접근도 막는다 (정책이 없으면 RLS가 막지만, 권한 자체도 거둔다)
revoke all on plans, plan_secrets, proposals, plan_history from anon, authenticated;
