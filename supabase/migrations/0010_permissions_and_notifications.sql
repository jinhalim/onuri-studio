-- D-015: 스토리 단위 수정 권한 요청/승인 + DB 백킹 알림 시스템.
-- 적용: Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 실행.
--
-- 추가되는 것:
--   1) public.story_permissions — 스토리별 'editor' 권한 부여 기록.
--   2) public.notifications     — DB 에 영구 보관되는 알림 inbox.
--      (owner 가 오프라인이어도 다음 접속 시 확인 가능)
--   3) Realtime Postgres Changes — notifications INSERT/UPDATE 를 클라이언트가
--      자기 user_id 로 필터 구독하면 즉시 push.
--   4) stories RLS 확장 — editor 권한자도 update 가능.


-- ─── public.story_permissions ───
create table if not exists public.story_permissions (
  id uuid primary key default gen_random_uuid(),
  story_id text not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor')),
  granted_by uuid references public.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (story_id, user_id)
);

create index if not exists story_permissions_user_idx on public.story_permissions(user_id);
create index if not exists story_permissions_story_idx on public.story_permissions(story_id);

alter table public.story_permissions enable row level security;

-- 본인 권한 row 만 read (UI 가 "내가 가진 권한" 표시할 때)
drop policy if exists story_permissions_self_read on public.story_permissions;
create policy story_permissions_self_read on public.story_permissions
  for select using (auth.uid() = user_id);

-- 스토리 owner 도 read (해당 스토리의 editor 들 관리/해제용)
drop policy if exists story_permissions_owner_read on public.story_permissions;
create policy story_permissions_owner_read on public.story_permissions
  for select using (
    exists (
      select 1 from public.stories s
        join public.channels c on c.id = s.channel_id
      where s.id = story_permissions.story_id and c.owner_id = auth.uid()
    )
  );

-- write 는 RLS 정책 없음 → 모두 차단. server action 이 admin client 로 우회 (검증 후 insert).


-- ─── public.notifications ───
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in (
    'edit_request',
    'edit_request_approved',
    'edit_request_denied'
  )),
  -- type 별 payload (jsonb):
  --   edit_request:
  --     { storyId, storyTitle, channelId, channelName,
  --       requesterUserId, requesterNickname, requesterColor }
  --   edit_request_approved / edit_request_denied:
  --     { storyId, storyTitle, channelId, channelName,
  --       ownerUserId, ownerNickname }
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications(recipient_user_id, created_at desc);

-- unread 만 빠르게 카운트하기 위한 partial index
create index if not exists notifications_recipient_unread_idx
  on public.notifications(recipient_user_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications
  for select using (auth.uid() = recipient_user_id);

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update using (auth.uid() = recipient_user_id)
  with check (auth.uid() = recipient_user_id);

drop policy if exists notifications_self_delete on public.notifications;
create policy notifications_self_delete on public.notifications
  for delete using (auth.uid() = recipient_user_id);

-- write (insert) 는 RLS 정책 없음 → 차단. server action 이 admin 으로 insert.


-- ─── Realtime: Postgres Changes 구독 활성 ───
-- 클라이언트가 channel.on('postgres_changes', { event: 'INSERT', schema: 'public',
-- table: 'notifications', filter: 'recipient_user_id=eq.<userId>' }) 로 구독.
-- 이미 publication 에 들어있으면 add 가 실패하므로 try/exception 안에 둠.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then
  -- 이미 등록됨 — 무시
  null;
end $$;


-- ─── stories RLS 확장: editor 도 update 가능 ───
-- 기존 0004 의 stories_owner_write 를 덮어씌움.
-- owner 또는 해당 story 의 editor 권한자 모두 write 허용.

drop policy if exists stories_owner_write on public.stories;
create policy stories_owner_write on public.stories
  for all using (
    exists (
      select 1 from public.channels c
      where c.id = stories.channel_id and c.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.story_permissions sp
      where sp.story_id = stories.id and sp.user_id = auth.uid() and sp.role = 'editor'
    )
  ) with check (
    exists (
      select 1 from public.channels c
      where c.id = stories.channel_id and c.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.story_permissions sp
      where sp.story_id = stories.id and sp.user_id = auth.uid() and sp.role = 'editor'
    )
  );
