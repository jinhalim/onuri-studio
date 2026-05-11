-- 0006_snapshot_to_text.sql
-- y_doc_snapshot bytea → text 로 변경.
--
-- 배경: Supabase JS REST API 는 binary 를 직접 못 보내고 Uint8Array 를
-- {0: b0, 1: b1, ...} 객체로 직렬화해서 보냄. 그 결과 bytea 컬럼에 raw bytes
-- 가 아닌 JSON.stringify(uint8array) 결과가 저장돼서 round-trip 불가.
--
-- 현재 저장 포맷은 tldraw store snapshot JSON 문자열 — text 컬럼이 자연.
-- Phase 4 (D-010) 후속 Yjs binary 마이그레이션 시점에 별도 binary 컬럼 추가 예정.
--
-- 기존 잘못 저장된 bytea 데이터는 어차피 로드 불가 → 손실 OK.

alter table public.stories
  drop column if exists y_doc_snapshot;

alter table public.stories
  add column y_doc_snapshot text;
