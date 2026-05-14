-- D-018 Phase 8b: Google Drive 연동 활성.
-- 적용: Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 실행.
--
-- 추가되는 것:
--   1) users.gdrive_workspace_path / gdrive_workspace_folder_id
--      — Google 사용자의 Drive 상 onuri-studio Workspace 폴더
--   2) channels.gdrive_folder_id / stories.gdrive_folder_id
--      — 각 채널/스토리에 대응하는 Drive 폴더 ID
--   3) gdrive_attachments 테이블
--      — 스토리에 첨부된 Drive 파일의 메타 + shortcut ID 매핑
--
-- 정책:
--   - 모든 Drive API 호출은 client-side (session.provider_token 사용) → 서버는
--     DB 메타데이터만 관리. external_integrations 테이블은 dormant (장기 server-side
--     access 가 필요해질 때까지 미사용).
--   - 폴더 / shortcut ID 는 nullable — Workspace 미설정 사용자 / 익명 사용자 호환.

-- ─── users 컬럼 추가 ───
alter table public.users
  add column if not exists gdrive_workspace_path text,
  add column if not exists gdrive_workspace_folder_id text;

-- ─── channels / stories 컬럼 추가 ───
alter table public.channels
  add column if not exists gdrive_folder_id text;

alter table public.stories
  add column if not exists gdrive_folder_id text;


-- ─── gdrive_attachments 테이블 ───
-- 스토리에 첨부된 Drive 파일의 매핑.
-- gdrive_file_id: 원본 파일 ID (사용자 본인 Drive 의 원래 자리에 그대로 있음)
-- shortcut_file_id: 우리 스토리 폴더에 만든 shortcut 의 ID
-- attached_by: 첨부한 사용자 (Google 연동 사용자 한정)

create table if not exists public.gdrive_attachments (
  id uuid primary key default gen_random_uuid(),
  story_id text not null references public.stories(id) on delete cascade,
  gdrive_file_id text not null,
  shortcut_file_id text not null,
  file_name text not null,
  mime_type text not null,
  attached_by uuid references public.users(id) on delete set null,
  attached_at timestamptz not null default now(),
  unique (story_id, gdrive_file_id)
);

create index if not exists gdrive_attachments_story_idx
  on public.gdrive_attachments(story_id);
create index if not exists gdrive_attachments_user_idx
  on public.gdrive_attachments(attached_by);

alter table public.gdrive_attachments enable row level security;

-- 스토리에 접근 권한이 있는 사용자만 read (RLS 의 stories 정책 따라감)
drop policy if exists gdrive_attachments_self_read on public.gdrive_attachments;
create policy gdrive_attachments_self_read on public.gdrive_attachments
  for select using (
    exists (
      select 1 from public.stories s
        join public.channels c on c.id = s.channel_id
      where s.id = gdrive_attachments.story_id
        and (
          c.owner_id = auth.uid()
          or exists (
            select 1 from public.story_permissions sp
            where sp.story_id = s.id and sp.user_id = auth.uid()
          )
        )
    )
  );

-- write 는 RLS 정책 없음 → 모든 client 접근 차단. server action 만 사용 (admin client).
