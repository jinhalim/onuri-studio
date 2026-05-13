import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';
import { NicknameForm } from '@/components/auth/NicknameForm';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { SetupBanner } from '@/components/auth/SetupBanner';
import { CreateChannelForm } from '@/components/channel/CreateChannelForm';
import { ChannelList } from '@/components/channel/ChannelList';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { listMyChannels } from '@/lib/usecases/list-my-channels';
import { isSupabaseConfigured } from '@/lib/config/env';
import { enabledProviders } from '@/lib/infra/auth/provider-registry';

interface LandingPageProps {
  searchParams: { next?: string };
}

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const supabaseReady = isSupabaseConfigured();
  const user = supabaseReady ? await getCurrentUser() : null;
  const myChannels = user ? await listMyChannels(user.id) : [];
  const providers = enabledProviders();
  // D-014: middleware 가 미인증 사용자를 ?next=원래URL 와 함께 redirect → 가입 후 자동 이동.
  // open redirect 방지: 같은 origin 의 path 만 허용 (/ 로 시작 + // 로 시작 X)
  const nextParam = searchParams.next;
  const safeNext =
    typeof nextParam === 'string' && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : undefined;

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:gap-12 sm:px-6 sm:py-12"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <header className="flex items-start justify-between gap-4">
        <Wordmark size="md" withTagline={!user} />
        <div className="flex items-center gap-3">
          {user && (
            <Link
              href="/me"
              className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
            >
              마이페이지
            </Link>
          )}
          <ThemeToggle />
        </div>
      </header>

      {!supabaseReady && <SetupBanner />}

      {user ? (
        <>
          <section className="flex flex-col items-center gap-6 rounded-lg border border-divider bg-brand-surface/50 p-6">
            <SignedInBanner user={user} />
            <CreateChannelForm />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-fg-muted">내 채널</h2>
            <ChannelList channels={myChannels} />
          </section>
        </>
      ) : (
        <section className="flex w-full flex-col items-center gap-6">
          {safeNext && (
            <p className="text-center text-xs text-fg-muted">
              계속하려면 먼저 닉네임을 입력해주세요.
            </p>
          )}
          <NicknameForm next={safeNext} />
          {providers.includes('google') && (
            <>
              <div className="flex w-full max-w-sm items-center gap-3">
                <span className="h-px flex-1 bg-divider" />
                <span className="text-xs text-fg-muted">또는</span>
                <span className="h-px flex-1 bg-divider" />
              </div>
              <GoogleSignInButton className="w-full max-w-sm" />
            </>
          )}
          {/* TODO[Phase9-Email]: providers.includes('email') 시 MagicLinkForm 노출 */}
          <p className="text-xs text-fg-muted">현재 활성 인증: {providers.join(', ')}</p>
        </section>
      )}

      {/* Phase 안내 footer 는 dev 흔적 — production 에서 사용자에게 노출 부적절 → 제거 */}
    </main>
  );
}
