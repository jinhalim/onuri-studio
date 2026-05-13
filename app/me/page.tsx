import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/brand/Wordmark';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { ChannelList } from '@/components/channel/ChannelList';
import { HistoryChannelCard } from '@/components/me/HistoryChannelCard';
import { NicknameEditInline } from '@/components/me/NicknameEditInline';
import { PermissionHistorySection } from '@/components/me/PermissionHistorySection';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { NotificationBell } from '@/components/notification/NotificationBell';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { ProviderBadge } from '@/components/auth/ProviderBadge';
import { enabledProviders } from '@/lib/infra/auth/provider-registry';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { listMyChannels } from '@/lib/usecases/list-my-channels';
import { getMyHistory } from '@/lib/usecases/get-my-history';
import { getMyStoryPermissions } from '@/lib/usecases/get-my-story-permissions';

// 마이페이지.
// MVP 정책: 익명도 자기 채널 목록 확인 가능 (D-007 색이 정체성 역할).
// Phase 9에서 회원 전환 영역 (이메일로 저장 / 계정 연결 등) 추가.

export default async function MyPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');

  // 독립적인 데이터 fetch 병렬화
  const [myChannels, history, permissions] = await Promise.all([
    listMyChannels(user.id),
    getMyHistory(user.id),
    getMyStoryPermissions(user.id),
  ]);
  // 본인 소유 채널은 "내가 만든 채널" 섹션에 이미 표시 → recent 에서 제외해서 중복 방지
  const myChannelIds = new Set(myChannels.map((c) => c.id));
  const recentVisits = history.recent.filter((h) => !myChannelIds.has(h.channelId));

  // Google 연동 가능 조건: 익명 사용자 + google provider 활성
  const providers = enabledProviders();
  const canConnectGoogle =
    user.isAnonymous &&
    !user.linkedProviders.includes('google') &&
    providers.includes('google');

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:gap-10 sm:px-6 sm:py-12"
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
          <NotificationBell userId={user.id} />
          <SignedInBanner user={user} compact />
          <ThemeToggle />
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-fg">마이페이지</h1>
        <p className="text-sm text-fg-muted">
          {user.isAnonymous
            ? '익명 트랙입니다. 활동 이력은 브라우저 쿠키에 묶여 있어 다른 기기에서는 보이지 않아요.'
            : '회원 트랙입니다. 활동 이력이 계정에 영구 저장됩니다.'}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">계정 정보</h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 rounded-md border border-divider bg-brand-surface/50 px-4 py-3 text-sm">
          <dt className="text-fg-muted">닉네임</dt>
          <dd className="text-fg">
            <NicknameEditInline initial={user.nickname} />
          </dd>
          <dt className="text-fg-muted">색상</dt>
          <dd className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full ring-1 ring-divider"
              style={{ backgroundColor: user.color }}
            />
            <code className="text-fg">{user.color}</code>
          </dd>
          <dt className="text-fg-muted">인증 방식</dt>
          <dd className="text-fg">
            <ProviderBadge provider={user.primaryAuthProvider} />
          </dd>
          <dt className="text-fg-muted">연결된 제공자</dt>
          <dd className="flex flex-wrap items-center gap-2 text-fg">
            {user.linkedProviders.length === 0 ? (
              <span>없음</span>
            ) : (
              user.linkedProviders.map((p) => <ProviderBadge key={p} provider={p} />)
            )}
            {canConnectGoogle && (
              <GoogleSignInButton
                label="Google 계정 연결"
                className="h-8 px-3 text-xs"
              />
            )}
          </dd>
        </dl>
        {/* TODO[Phase9-Email]: 익명일 때 "이메일로 저장" 버튼 노출 */}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">내가 만든 채널</h2>
        <ChannelList channels={myChannels} />
      </section>

      {/* D-015 권한 이력 — received/granted 둘 다 비면 섹션 자체가 안 그려짐. */}
      <PermissionHistorySection permissions={permissions} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">
          즐겨찾기 ({history.favorites.length})
        </h2>
        {history.favorites.length === 0 ? (
          <p className="rounded-md border border-dashed border-divider bg-brand-surface/40 px-4 py-6 text-center text-xs text-fg-muted">
            아직 즐겨찾기한 채널이 없어요. 채널 카드의 ★ 를 눌러 추가할 수 있어요.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {history.favorites.map((item) => (
              <HistoryChannelCard key={item.channelId} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">
          최근 방문 ({recentVisits.length})
        </h2>
        {recentVisits.length === 0 ? (
          <p className="rounded-md border border-dashed border-divider bg-brand-surface/40 px-4 py-6 text-center text-xs text-fg-muted">
            다른 채널을 방문해 본 적이 없어요. URL 로 채널에 들어가면 여기에 기록돼요.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recentVisits.map((item) => (
              <HistoryChannelCard key={item.channelId} item={item} />
            ))}
          </div>
        )}
      </section>

    </main>
  );
}
