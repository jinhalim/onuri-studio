-- D-021: Google 연동 등록 요청 (테스트 배포 영구 운영 모드).
--
-- 배경: Google OAuth app 이 "Testing" 모드 유지 → drive.file 같은 sensitive scope
-- 사용 시 verification 필요한데, 도메인 미구매 / 운영 비용 이슈로 verification 안 받음.
-- 결과적으로 Google Cloud Console 의 Test users 목록 (최대 100명) 에 수동 등록된
-- 사용자만 Google 로그인 가능.
--
-- 본 마이그레이션은 그 등록 요청 workflow 를 DB 로 관리:
--   1. 익명 사용자가 /me 에서 "Google 연동" 시도 → dialog 로 이메일 등록 요청.
--   2. 요청이 google_link_requests 에 INSERT (status='pending').
--   3. admin 이 /admin 에서 요청 목록 확인 → Google Cloud Console 에 수동 등록.
--   4. admin 이 "완료 처리" 클릭 → status='approved' + notifications INSERT.
--   5. 요청자에게 알림 push (Realtime) → 클릭 → /me 에서 Google 연동 재시도 가능.

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. google_link_requests 테이블
-- ──────────────────────────────────────────────────────────────────────────────

-- PostgreSQL 은 CREATE TYPE IF NOT EXISTS 가 없어서 DO 블록으로 우회.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'google_link_request_status') then
    create type public.google_link_request_status as enum ('pending', 'approved', 'rejected');
  end if;
end$$;

create table if not exists public.google_link_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  status public.google_link_request_status not null default 'pending',
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references public.users(id) on delete set null,
  -- 같은 사용자가 동일 이메일로 동시 다중 요청 못 하게.
  -- 이전 요청이 rejected 면 새 이메일로 재요청 OR 같은 이메일 재요청 모두 허용해야 하니
  -- partial unique index 로 pending 상태에서만 unique 검사.
  constraint google_link_requests_email_format check (email ~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$')
);

-- 같은 사용자의 pending 요청은 1건만 허용 (이메일이 같든 다르든).
create unique index if not exists google_link_requests_pending_per_user
  on public.google_link_requests(user_id)
  where status = 'pending';

-- admin 페이지 빠른 조회용.
create index if not exists google_link_requests_status_idx
  on public.google_link_requests(status, requested_at desc);

-- 사용자 본인의 최신 요청 조회용.
create index if not exists google_link_requests_user_idx
  on public.google_link_requests(user_id, requested_at desc);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. RLS — server actions 가 service role 로 직접 처리하므로 안전망 차원의 정책만.
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.google_link_requests enable row level security;

-- 본인 요청은 read 가능 (status 확인용 — 다만 현재 코드는 server action 으로만 fetch).
drop policy if exists google_link_requests_self_read on public.google_link_requests;
create policy google_link_requests_self_read on public.google_link_requests
  for select using (auth.uid() = user_id);

-- admin 은 전체 read + write.
drop policy if exists google_link_requests_admin_all on public.google_link_requests;
create policy google_link_requests_admin_all on public.google_link_requests
  for all using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. notifications 의 type CHECK 에 google_link_* 추가.
--    (D-015 의 edit_request 시리즈와 동일 인프라 재사용.)
-- ──────────────────────────────────────────────────────────────────────────────

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'edit_request',
    'edit_request_approved',
    'edit_request_denied',
    'google_link_approved',
    'google_link_rejected'
  ));

-- google_link_approved payload:
--   { requestId, email, processedByNickname }
-- google_link_rejected payload:
--   { requestId, email, processedByNickname, reason? }
