import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// Rate Limit 카운터 — Supabase Postgres 기반 ($0 예산, 기존 무료 티어).
//
// 동작: window_start (분 단위 floor) 를 key 와 함께 atomic upsert.
// PostgreSQL `insert ... on conflict do update set count = count + 1`.
// 동시성 race 는 +1~2 의 오차 허용 (정확한 카운터 아닌 spam 차단 목적).
//
// 호출 패턴:
//   const { ok, retryAfterSec } = await checkRateLimit({
//     key: `channel:create:${user.id}`, maxPerWindow: 5, windowMs: 60_000,
//   });
//   if (!ok) return { ok: false, error: `${retryAfterSec}초 후 다시 시도해주세요` };

export interface CheckRateLimitInput {
  /** 카운터 키. action + identity (user.id 등) 조합. */
  key: string;
  /** 윈도우 당 허용 횟수. */
  maxPerWindow: number;
  /** 윈도우 길이 (ms). 보통 60_000 (1분). */
  windowMs: number;
}

export interface CheckRateLimitResult {
  ok: boolean;
  /** ok=false 시 몇 초 후 재시도 가능한지 (윈도우 종료까지 남은 시간). */
  retryAfterSec?: number;
  /** 현재 윈도우의 카운트 (디버깅용). */
  currentCount?: number;
}

export async function checkRateLimit(
  input: CheckRateLimitInput,
): Promise<CheckRateLimitResult> {
  const admin = createAdminClient();
  const now = Date.now();
  const windowStartMs = Math.floor(now / input.windowMs) * input.windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const windowEndMs = windowStartMs + input.windowMs;

  // 1) 현재 윈도우 row 존재 확인
  const { data: existing } = await admin
    .from('rate_limit_counters')
    .select('count')
    .eq('key', input.key)
    .eq('window_start', windowStart)
    .maybeSingle();

  if (!existing) {
    // 첫 호출 — count=1 로 insert. conflict 발생 시 (동시 첫 호출) increment 로 fallback.
    const { error: insertErr } = await admin
      .from('rate_limit_counters')
      .insert({ key: input.key, window_start: windowStart, count: 1 });
    if (!insertErr) return { ok: true, currentCount: 1 };
    // PK conflict (동시 insert) — 아래 increment 로 처리
  }

  // 2) 기존 row 카운터 증가. PostgREST 의 단순 update 는 atomic increment 가 어려워서
  //    SQL RPC 가 이상적이지만 별도 함수 정의 부담을 피하려 select-then-update 사용.
  //    동시성 race 는 1~2 오차 허용 (spam 차단 목적이라 정확성보다 단순성 우선).
  const currentCount = (existing?.count ?? 0) + 1;
  const { error: updateErr } = await admin
    .from('rate_limit_counters')
    .upsert(
      { key: input.key, window_start: windowStart, count: currentCount },
      { onConflict: 'key,window_start' },
    );
  if (updateErr) {
    console.error('[checkRateLimit] upsert 실패:', updateErr);
    // 실패 시 통과 (사용자 차단보다 fail-open 선호 — 보안 관점 트레이드오프 있음)
    return { ok: true };
  }

  if (currentCount > input.maxPerWindow) {
    const retryAfterSec = Math.max(1, Math.ceil((windowEndMs - now) / 1000));
    return { ok: false, retryAfterSec, currentCount };
  }
  return { ok: true, currentCount };
}
