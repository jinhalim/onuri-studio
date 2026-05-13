import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Wordmark } from '@/components/brand/Wordmark';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { RelativeTime } from '@/components/shared/RelativeTime';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { getAdminDashboard } from '@/lib/usecases/get-admin-dashboard';
import { getSupabaseUsage } from '@/lib/usecases/get-supabase-usage';

// /admin — admin role 만 접근 가능.
// 비-admin 은 notFound() 로 처리 (관리자 존재 자체를 숨김).
// MVP: 통계 + 최근 항목 dashboard. 검색·정지·삭제 등 모더레이션은 후속.

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  if (user.role !== 'admin') notFound();

  const [dashboard, usage] = await Promise.all([
    getAdminDashboard(),
    getSupabaseUsage(),
  ]);

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:gap-10 sm:px-6 sm:py-12"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Link href="/" className="hover:opacity-80">
          <Wordmark size="sm" />
        </Link>
        <div className="flex items-center gap-3">
          <SignedInBanner user={user} compact />
          <ThemeToggle />
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-fg">관리자</h1>
        <p className="text-sm text-fg-muted">
          시스템 통계 + 최근 활동. 모더레이션 기능은 후속 작업.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="사용자"
          value={dashboard.stats.users.total}
          hint={`익명 ${dashboard.stats.users.anonymous} · 회원 ${dashboard.stats.users.member}`}
        />
        <StatCard label="채널" value={dashboard.stats.channels.total} />
        <StatCard
          label="스토리"
          value={dashboard.stats.stories.total}
          hint={`작성됨 ${dashboard.stats.stories.withSnapshot} / 전체 ${dashboard.stats.stories.total}`}
        />
      </section>

      {/* Supabase 무료 티어 사용량 — 한도 임박 시 cleanup / Pro 전환 시점 판단 자료. */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-semibold text-fg-muted">Supabase 무료 티어 사용량</h2>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[11px] text-live underline-offset-2 hover:underline"
          >
            정확치는 Supabase Dashboard 확인 ↗
          </a>
        </div>

        <div className="rounded-md border border-divider bg-brand-surface/50 p-4">
          <UsageBar
            label="DB 용량 (추정)"
            current={usage.database.totalMB}
            limit={usage.database.limitMB}
            unit="MB"
            warnAt={0.7}
            critAt={0.85}
          />
          <p className="mt-1 text-[11px] text-fg-muted/80">
            text 컬럼 누적 + 테이블별 row 평균 추정.{' '}
            <strong>정확한 값은 Supabase Dashboard 의 Project → Storage 에서 확인.</strong>
          </p>
        </div>

        <div className="rounded-md border border-divider bg-brand-surface/50 p-4">
          <UsageBar
            label="Auth 사용자 (총 가입)"
            current={usage.auth.totalUsers}
            limit={usage.auth.limitMAU}
            unit="명"
            warnAt={0.7}
            critAt={0.85}
          />
          <p className="mt-1 text-[11px] text-fg-muted/80">
            익명 {usage.auth.anonymousUsers.toLocaleString('ko-KR')} 명 · 회원{' '}
            {usage.auth.memberUsers.toLocaleString('ko-KR')} 명. 한도는 MAU 기준이라 실제 활성치는
            Dashboard 에서 확인.
          </p>
        </div>

        <div className="rounded-md border border-divider bg-brand-surface/50">
          <table className="w-full text-sm">
            <thead className="bg-brand-bezel/50 text-xs text-fg-muted">
              <tr>
                <th className="px-3 py-2 text-left">테이블</th>
                <th className="px-3 py-2 text-right">Row 수</th>
                <th className="px-3 py-2 text-left">비고</th>
              </tr>
            </thead>
            <tbody>
              {usage.database.tables.map((t) => (
                <tr key={t.name} className="border-t border-divider">
                  <td className="px-3 py-2 font-mono text-xs text-fg">{t.name}</td>
                  <td className="px-3 py-2 text-right text-fg-muted">
                    {t.rowEstimate.toLocaleString('ko-KR')}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-fg-muted">
                    {t.name === 'stories' &&
                      `snapshot text 누적 ${formatBytes(usage.snapshotBytes)}`}
                    {t.name === 'rate_limit_counters' && 'cleanup 가능 (7일 이상 row)'}
                    {t.name === 'notifications' && 'read 처리된 알림은 별도 정리 가능'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <DashboardLinkCard
            label="Realtime"
            limit="200 동시 / 2M 메시지·월"
            href="https://supabase.com/dashboard/project/_/realtime/inspector"
          />
          <DashboardLinkCard
            label="Bandwidth"
            limit="5 GB egress / 월"
            href="https://supabase.com/dashboard/project/_/usage"
          />
          <DashboardLinkCard
            label="요금제"
            limit="Pro $25/월 (전환 시)"
            href="https://supabase.com/pricing"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">최근 사용자</h2>
        <div className="overflow-x-auto rounded-md border border-divider bg-brand-surface/50">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-brand-bezel/50 text-xs text-fg-muted">
              <tr>
                <th className="px-3 py-2 text-left">닉네임</th>
                <th className="px-3 py-2 text-left">유형</th>
                <th className="px-3 py-2 text-left">권한</th>
                <th className="px-3 py-2 text-left">가입</th>
                <th className="px-3 py-2 text-left">최근 접속</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentUsers.map((u) => (
                <tr key={u.id} className="border-t border-divider">
                  <td className="px-3 py-2 text-fg">{u.nickname}</td>
                  <td className="px-3 py-2 text-fg-muted">
                    {u.isAnonymous ? '익명' : '회원'}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">
                    {u.role === 'admin' ? '관리자' : '일반'}
                  </td>
                  <td className="px-3 py-2 text-fg-muted">{formatDate(u.createdAt)}</td>
                  <td className="px-3 py-2 text-fg-muted">
                    <RelativeTime date={u.lastSeenAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">최근 채널</h2>
        <div className="overflow-x-auto rounded-md border border-divider bg-brand-surface/50">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-brand-bezel/50 text-xs text-fg-muted">
              <tr>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-left">소유자</th>
                <th className="px-3 py-2 text-left">생성</th>
                <th className="px-3 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentChannels.map((c) => (
                <tr key={c.id} className="border-t border-divider">
                  <td className="px-3 py-2 text-fg">{c.name}</td>
                  <td className="px-3 py-2 text-fg-muted">{c.ownerNickname}</td>
                  <td className="px-3 py-2 text-fg-muted">{formatDate(c.createdAt)}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/ch/${c.id}`}
                      className="text-xs text-live hover:underline"
                    >
                      열기 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">최근 스토리</h2>
        <div className="overflow-x-auto rounded-md border border-divider bg-brand-surface/50">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-brand-bezel/50 text-xs text-fg-muted">
              <tr>
                <th className="px-3 py-2 text-left">제목</th>
                <th className="px-3 py-2 text-left">채널</th>
                <th className="px-3 py-2 text-left">생성</th>
                <th className="px-3 py-2 text-left">마지막 저장</th>
                <th className="px-3 py-2 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentStories.map((s) => (
                <tr key={s.id} className="border-t border-divider">
                  <td className="px-3 py-2 text-fg">{s.title}</td>
                  <td className="px-3 py-2 text-fg-muted">{s.channelName}</td>
                  <td className="px-3 py-2 text-fg-muted">{formatDate(s.createdAt)}</td>
                  <td className="px-3 py-2 text-fg-muted">
                    {s.snapshotUpdatedAt ? (
                      <RelativeTime date={s.snapshotUpdatedAt} />
                    ) : (
                      '저장 없음'
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/ch/${s.channelId}/story/${s.id}`}
                      className="text-xs text-live hover:underline"
                    >
                      열기 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </main>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-divider bg-brand-surface/50 px-4 py-3">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="text-2xl font-bold text-fg">{value.toLocaleString('ko-KR')}</span>
      {hint && <span className="text-[11px] text-fg-muted/70">{hint}</span>}
    </div>
  );
}

function UsageBar({
  label,
  current,
  limit,
  unit,
  warnAt,
  critAt,
}: {
  label: string;
  current: number;
  limit: number;
  unit: string;
  /** 경고 임계 (0~1). */
  warnAt: number;
  /** 위험 임계 (0~1). */
  critAt: number;
}) {
  const ratio = limit > 0 ? current / limit : 0;
  const pct = Math.min(100, ratio * 100);
  const color =
    ratio >= critAt
      ? 'bg-rec'
      : ratio >= warnAt
        ? 'bg-amber-500'
        : 'bg-live';
  const formattedCurrent =
    unit === 'MB' ? current.toFixed(1) : current.toLocaleString('ko-KR');
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-fg-muted">{label}</span>
        <span className="font-mono text-fg">
          {formattedCurrent} / {limit.toLocaleString('ko-KR')} {unit}{' '}
          <span className="text-fg-muted/70">({pct.toFixed(1)}%)</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-brand-bezel">
        <div
          className={`h-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DashboardLinkCard({
  label,
  limit,
  href,
}: {
  label: string;
  limit: string;
  href: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex flex-col gap-0.5 rounded-md border border-divider bg-brand-surface/50 px-3 py-2 hover:bg-brand-surface"
    >
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="text-[11px] text-fg">{limit}</span>
      <span className="text-[10px] text-live underline-offset-2 group-hover:underline">
        Dashboard ↗
      </span>
    </a>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR');
}
