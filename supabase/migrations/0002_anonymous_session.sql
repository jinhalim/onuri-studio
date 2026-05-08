-- 익명 세션 추적.
-- Phase 9에서 익명 → 회원 전환 시 converted_user_id 채움.

create table if not exists public.anonymous_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  converted_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists anonymous_sessions_converted_idx
  on public.anonymous_sessions(converted_user_id)
  where converted_user_id is not null;
