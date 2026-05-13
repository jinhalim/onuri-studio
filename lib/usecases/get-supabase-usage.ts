import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// Supabase 무료 티어 사용량 측정.
// SQL 쿼리 가능한 것만 표시 — Realtime / Bandwidth 는 Supabase Dashboard 만 확인 가능.
//
// 무료 티어 한도 (2026-05 기준):
//   - Database 용량: 500 MB
//   - Auth MAU: 50,000
//   - Realtime 동시 접속: 200 (Dashboard 만 확인)
//   - Realtime 메시지: 2M / 월 (Dashboard 만 확인)
//   - Bandwidth egress: 5 GB / 월 (Dashboard 만 확인)

const FREE_TIER_DB_BYTES = 500 * 1024 * 1024; // 500 MB
const FREE_TIER_AUTH_MAU = 50_000;

export interface TableUsage {
  name: string;
  /** 테이블 + index + toast 합산 바이트. */
  totalBytes: number;
  /** 테이블 자체만 (index 제외) 바이트. */
  tableBytes: number;
  /** row 추정치 (PostgreSQL planner statistics 기반, 분석 후 정확). */
  rowEstimate: number;
}

export interface SupabaseUsage {
  database: {
    totalBytes: number;
    totalMB: number;
    limitBytes: number;
    limitMB: number;
    /** 사용률 0~1. 한도 초과 시 1 초과 가능. */
    usageRatio: number;
    tables: TableUsage[];
  };
  auth: {
    totalUsers: number;
    anonymousUsers: number;
    memberUsers: number;
    limitMAU: number;
  };
  /** Snapshot text 컬럼 총합 — y_doc_snapshot 누적 데이터. */
  snapshotBytes: number;
  /** 일별 / 5개 롤링 보존 정책 (D-009) 적용 안 된 현재 단순 단일 컬럼. */
  rateLimitRows: number;
  notificationRows: number;
}

export async function getSupabaseUsage(): Promise<SupabaseUsage> {
  const admin = createAdminClient();

  // 1) DB 전체 용량 + 테이블별 크기 + row estimate.
  // Supabase REST API 는 raw SQL 직접 실행 못함 → rpc 함수 또는 select 만 가능.
  // 직접 쿼리 함수가 없으니 information_schema / pg_class 를 노출하는 view 가 필요하지만
  // 미리 만들어두지 않으면 어려움. 대신 가능한 우회로:
  //   - public 의 알려진 테이블 row count 만 select count(*) 로 가져옴
  //   - byte 단위 정확 측정은 Dashboard 만 가능 (또는 별도 SQL function)
  //
  // 운영상 정확도보단 추세 파악 목적이라 count 기반 + snapshot text 길이 합산으로 갈음.
  // (Dashboard 정확치는 별도 링크로 안내)

  const tableNames = [
    'users',
    'channels',
    'stories',
    'participations',
    'anonymous_sessions',
    'external_integrations',
    'story_permissions',
    'notifications',
    'rate_limit_counters',
  ];

  const tables: TableUsage[] = [];
  for (const name of tableNames) {
    const { count, error } = await admin
      .from(name)
      .select('*', { head: true, count: 'exact' });
    if (error) {
      // 테이블이 아직 migration 안 됐을 수 있음 — 0 으로 처리
      tables.push({ name, totalBytes: 0, tableBytes: 0, rowEstimate: 0 });
      continue;
    }
    tables.push({
      name,
      // 정확한 byte 측정 어려움 — count 만 사용 (Dashboard 정확치 안내)
      totalBytes: 0,
      tableBytes: 0,
      rowEstimate: count ?? 0,
    });
  }

  // 2) y_doc_snapshot 누적 텍스트 길이 (= 대략 byte 단위, UTF-8 ASCII 가정).
  // 실제 PostgreSQL TOAST 압축 후 byte 는 다를 수 있지만 추세 파악엔 충분.
  let snapshotBytes = 0;
  try {
    const { data: snapshots } = await admin
      .from('stories')
      .select('y_doc_snapshot')
      .not('y_doc_snapshot', 'is', null);
    if (snapshots) {
      snapshotBytes = snapshots.reduce(
        (sum, row) => sum + ((row as { y_doc_snapshot?: string }).y_doc_snapshot?.length ?? 0),
        0,
      );
    }
  } catch (err) {
    console.error('[getSupabaseUsage] snapshot size 조회 실패:', err);
  }

  // 3) Auth 사용자 — 익명 vs 회원.
  let totalUsers = 0;
  let anonymousUsers = 0;
  let memberUsers = 0;
  try {
    const { count: total } = await admin
      .from('users')
      .select('*', { head: true, count: 'exact' });
    const { count: anon } = await admin
      .from('users')
      .select('*', { head: true, count: 'exact' })
      .eq('is_anonymous', true);
    totalUsers = total ?? 0;
    anonymousUsers = anon ?? 0;
    memberUsers = totalUsers - anonymousUsers;
  } catch (err) {
    console.error('[getSupabaseUsage] auth user count 조회 실패:', err);
  }

  // DB 전체 용량은 정확 측정 불가 → snapshot byte + 다른 테이블 추정으로 대체.
  // notifications / participations / story_permissions / rate_limit 등은 row 당 평균
  // 0.2~1 KB. 단순 합산.
  const tablesByName = Object.fromEntries(tables.map((t) => [t.name, t.rowEstimate]));
  const estimatedNonSnapshotBytes =
    (tablesByName.users ?? 0) * 300 +
    (tablesByName.channels ?? 0) * 200 +
    (tablesByName.stories ?? 0) * 400 + // snapshot 제외한 메타만
    (tablesByName.participations ?? 0) * 200 +
    (tablesByName.notifications ?? 0) * 600 +
    (tablesByName.story_permissions ?? 0) * 200 +
    (tablesByName.rate_limit_counters ?? 0) * 100 +
    (tablesByName.anonymous_sessions ?? 0) * 200 +
    (tablesByName.external_integrations ?? 0) * 500;

  const dbTotalBytes = snapshotBytes + estimatedNonSnapshotBytes;

  return {
    database: {
      totalBytes: dbTotalBytes,
      totalMB: dbTotalBytes / (1024 * 1024),
      limitBytes: FREE_TIER_DB_BYTES,
      limitMB: 500,
      usageRatio: dbTotalBytes / FREE_TIER_DB_BYTES,
      tables,
    },
    auth: {
      totalUsers,
      anonymousUsers,
      memberUsers,
      limitMAU: FREE_TIER_AUTH_MAU,
    },
    snapshotBytes,
    rateLimitRows: tablesByName.rate_limit_counters ?? 0,
    notificationRows: tablesByName.notifications ?? 0,
  };
}
