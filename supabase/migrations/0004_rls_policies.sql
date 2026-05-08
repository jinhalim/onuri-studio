-- Row Level Security 정책.
-- 모든 테이블 RLS 활성화 후 최소 권한 부여.

alter table public.users enable row level security;
alter table public.channels enable row level security;
alter table public.stories enable row level security;
alter table public.participations enable row level security;
alter table public.anonymous_sessions enable row level security;
alter table public.external_integrations enable row level security;

-- ─── users ───
-- 본인 read/update. admin은 전체 read.
drop policy if exists users_self_select on public.users;
create policy users_self_select on public.users
  for select using (auth.uid() = id);

drop policy if exists users_self_update on public.users;
create policy users_self_update on public.users
  for update using (auth.uid() = id);

drop policy if exists users_admin_select on public.users;
create policy users_admin_select on public.users
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

-- ─── channels ───
-- 누구나 read (URL 알면 입장 가능). owner만 write.
drop policy if exists channels_public_read on public.channels;
create policy channels_public_read on public.channels for select using (true);

drop policy if exists channels_owner_write on public.channels;
create policy channels_owner_write on public.channels
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ─── stories ───
-- 누구나 read. 채널 owner만 write.
drop policy if exists stories_public_read on public.stories;
create policy stories_public_read on public.stories for select using (true);

drop policy if exists stories_owner_write on public.stories;
create policy stories_owner_write on public.stories
  for all using (
    exists (
      select 1 from public.channels c
      where c.id = stories.channel_id and c.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.channels c
      where c.id = stories.channel_id and c.owner_id = auth.uid()
    )
  );

-- ─── participations ───
-- 본인 것만 모든 작업.
drop policy if exists participations_self on public.participations;
create policy participations_self on public.participations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── anonymous_sessions ───
-- 본 테이블은 Service Role만 접근 (RLS는 모두 차단). 어떤 정책도 추가하지 않는다.
-- (auth.uid()로 익명 토큰을 매핑하기 어렵기 때문에 서버 전용으로 처리.)

-- ─── external_integrations ───
-- 본인 것만. 토큰 평문 노출 방지를 위해 select도 본인 한정.
drop policy if exists external_integrations_self on public.external_integrations;
create policy external_integrations_self on public.external_integrations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
