-- TODO[Phase8]: Google Workspace (Drive/Sheets/Slides) 연계용 테이블.
-- Phase 1 ~ 7 동안에는 미사용. 스키마만 정의.
-- 토큰 컬럼은 Supabase Vault 또는 자체 AES-GCM 으로 암호화 후 저장.

create table if not exists public.external_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in
    ('google_drive','google_sheets','google_slides')),
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index if not exists external_integrations_user_idx
  on public.external_integrations(user_id);
