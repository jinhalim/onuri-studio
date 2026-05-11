-- 0007_stories_snapshot_updated_at.sql
-- 화이트보드 마지막 저장 시점 추적용 컬럼 추가.
--
-- 배경: 채널 페이지의 "마지막 수정" 표시가 title_updated_at 만 사용하고 있어서
-- snapshot 만 변경했을 때 갱신이 안 되었음. snapshot_updated_at 을 분리해서
-- save 시 갱신하고, 카드에는 max(title, snapshot) 으로 표시.
--
-- nullable: 0006 직후 기존 row 들은 아직 한번도 save 안 됐을 수 있음.

alter table public.stories
  add column if not exists snapshot_updated_at timestamptz;

create index if not exists stories_snapshot_updated_idx
  on public.stories(snapshot_updated_at desc);
