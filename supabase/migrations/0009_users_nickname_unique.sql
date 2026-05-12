-- 0009_users_nickname_unique.sql
-- 닉네임 중복 방지.
--
-- 정책 (사용자 요청):
-- - 닉네임은 전역 unique (대소문자 구분 — "누리" 와 "Nuri" 는 다름)
-- - 신규 가입 시 같은 닉네임이 이미 있으면 친절 에러 메시지로 차단
--
-- 만약 기존 데이터에 중복 닉네임이 있으면 이 마이그레이션은 실패함.
-- 그 경우 먼저 중복 row 를 정리해야 함 (보통 1인 개발 단계라 문제 없음).

create unique index if not exists users_nickname_unique
  on public.users(nickname);
