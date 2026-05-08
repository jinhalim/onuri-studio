-- Onuri Studio — 초기 스키마
-- 적용: Supabase Dashboard > SQL Editor 에 그대로 붙여넣고 실행.

-- ─── public.users (auth.users 와 1:1 미러) ───
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  nickname text not null,
  color text not null,
  primary_auth_provider text not null default 'anonymous'
    check (primary_auth_provider in
      ('anonymous','email','google','github','microsoft','apple')),
  linked_providers text[] not null default '{}',
  is_anonymous boolean not null default false,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users(role) where role = 'admin';

-- ─── public.channels ───
create table if not exists public.channels (
  id text primary key,
  name text not null,
  owner_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists channels_owner_idx on public.channels(owner_id);

-- ─── public.stories ───
create table if not exists public.stories (
  id text primary key,
  channel_id text not null references public.channels(id) on delete cascade,
  title text not null,
  title_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  y_doc_snapshot bytea,
  thumbnail_url text,
  external_links jsonb not null default '{}'::jsonb
);

create index if not exists stories_channel_idx on public.stories(channel_id);

-- ─── public.participations ───
create table if not exists public.participations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel_id text not null references public.channels(id) on delete cascade,
  story_id text references public.stories(id) on delete cascade,
  role text not null check (role in ('owner','visitor')),
  first_visited_at timestamptz not null default now(),
  last_visited_at timestamptz not null default now(),
  is_favorite boolean not null default false,
  unique (user_id, channel_id, story_id)
);

create index if not exists participations_user_idx on public.participations(user_id);
create index if not exists participations_channel_idx on public.participations(channel_id);
