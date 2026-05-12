import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Wordmark } from '@/components/brand/Wordmark';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { getAdminDashboard } from '@/lib/usecases/get-admin-dashboard';

// /admin — admin role 만 접근 가능.
// 비-admin 은 notFound() 로 처리 (관리자 존재 자체를 숨김).
// MVP: 통계 + 최근 항목 dashboard. 검색·정지·삭제 등 모더레이션은 후속.

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  if (user.role !== 'admin') notFound();

  const dashboard = await getAdminDashboard();

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
        <SignedInBanner user={user} compact />
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
                  <td className="px-3 py-2 text-fg-muted">{formatRelative(u.lastSeenAt)}</td>
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
                    {s.snapshotUpdatedAt ? formatRelative(s.snapshotUpdatedAt) : '저장 없음'}
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR');
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return date.toLocaleDateString('ko-KR');
}
