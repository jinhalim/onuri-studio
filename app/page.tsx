import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';
import { NicknameForm } from '@/components/auth/NicknameForm';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { SetupBanner } from '@/components/auth/SetupBanner';
import { CreateChannelForm } from '@/components/channel/CreateChannelForm';
import { ChannelList } from '@/components/channel/ChannelList';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { listMyChannels } from '@/lib/usecases/list-my-channels';
import { isSupabaseConfigured } from '@/lib/config/env';
import { enabledProviders } from '@/lib/infra/auth/provider-registry';

export default async function LandingPage() {
  const supabaseReady = isSupabaseConfigured();
  const user = supabaseReady ? await getCurrentUser() : null;
  const myChannels = user ? await listMyChannels(user.id) : [];
  const providers = enabledProviders();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-12 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <Wordmark size="md" withTagline={!user} />
        {user && (
          <Link
            href="/me"
            className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            마이페이지
          </Link>
        )}
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
        <section className="flex flex-col items-center gap-6">
          <NicknameForm />
          {/* TODO[Phase9-Email]: providers.includes('email') 시 MagicLinkForm 노출 */}
          {/* TODO[Phase7]: providers.includes('google') 시 GoogleSignInButton 노출 */}
          <p className="text-xs text-fg-muted">현재 활성 인증: {providers.join(', ')}</p>
        </section>
      )}

      <footer className="mt-auto pt-12 text-xs text-fg-muted/70">
        Phase 2 — 채널/스토리 CRUD / 화이트보드는 Phase 3부터
      </footer>
    </main>
  );
}
