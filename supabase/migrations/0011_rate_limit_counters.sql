-- Rate Limit 카운터 테이블.
-- Vercel serverless 함수는 stateless 라 in-memory 카운터가 인스턴스 간 공유 안 됨.
-- 별도 Redis (Upstash) 가 표준이지만 $0 예산 / 비상업 단계라 기존 Supabase 무료 티어 활용.
--
-- 키 형식: "{action}:{userId}" (예: "channel:create:abc-uuid")
-- window_start: 윈도우 시작 시각 (분 단위 floor)
-- count: 윈도우 안의 요청 수
--
-- 정리: 7일 지난 row 는 별도 cron / 일괄 cleanup 으로 삭제 (admin 페이지에서 수동 실행 가능).

create table if not exists public.rate_limit_counters (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);

-- 활성 윈도우 빠른 조회용
create index if not exists rate_limit_window_idx
  on public.rate_limit_counters(window_start desc);

-- RLS: 클라이언트는 본 테이블에 직접 접근 불가 — server action (admin client) 만 사용.
alter table public.rate_limit_counters enable row level security;
-- 정책 추가 안 함 → RLS 켜진 채로 모든 client 접근 차단.
