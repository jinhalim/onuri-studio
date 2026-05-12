-- 0008_users_onboarded_at.sql
-- 신규 사용자 onboarding (샘플 채널 "채널 메뉴얼" + 스토리 자동 생성) 추적용.
--
-- 정책 (D-NNN 후속, 사용자 결정):
-- - 신규 가입 시 onboarded_at IS NULL → 샘플 생성 + 컬럼에 now() 기록 → 재실행 안 됨
-- - 기존 사용자는 차단: 마이그레이션에서 NULL → now() 로 일괄 set 해서 onboarding 트리거 안 함
--
-- 컬럼은 nullable. 미래에 onboarding 재실행 정책이 바뀌면 NULL 로 reset 하면 재생성됨.

alter table public.users
  add column if not exists onboarded_at timestamptz;

-- 기존 사용자는 이미 가입했으니 onboarding 차단 (사용자 명시 요청)
update public.users
  set onboarded_at = now()
  where onboarded_at is null;
