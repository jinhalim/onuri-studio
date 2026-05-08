-- participations unique 제약: NULL story_id 도 동일 값으로 취급해 중복 row 방지.
-- Postgres 15+ 의 NULLS NOT DISTINCT 사용.
-- 같은 사용자가 같은 채널을 여러 번 방문(story_id=NULL)해도 row 1개만 유지.

alter table public.participations
  drop constraint if exists participations_user_id_channel_id_story_id_key;

alter table public.participations
  add constraint participations_user_channel_story_uniq
  unique nulls not distinct (user_id, channel_id, story_id);
