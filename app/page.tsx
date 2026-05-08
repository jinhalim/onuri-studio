import { Wordmark } from '@/components/brand/Wordmark';
import { NicknameForm } from '@/components/auth/NicknameForm';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { SetupBanner } from '@/components/auth/SetupBanner';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { isSupabaseConfigured } from '@/lib/config/env';
import { enabledProviders } from '@/lib/infra/auth/provider-registry';

export default async function LandingPage() {
  const supabaseReady = isSupabaseConfigured();
  const user = supabaseReady ? await getCurrentUser() : null;
  const providers = enabledProviders();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-12 bg-brand-bezel px-6 py-16">
      <Wordmark size="lg" withTagline />

      {!supabaseReady && <SetupBanner />}

      {user ? (
        <SignedInBanner user={user} />
      ) : (
        <div className="flex flex-col items-center gap-6">
          <NicknameForm />
          {/* TODO[Phase9-Email]: providers.includes('email') 시 MagicLinkForm 노출 */}
          {/* TODO[Phase7]: providers.includes('google') 시 GoogleSignInButton 노출 */}
          <p className="text-xs text-fg-muted">
            현재 활성 인증: {providers.join(', ')}
          </p>
        </div>
      )}

      <footer className="mt-auto pt-12 text-xs text-fg-muted/70">
        Phase 1 — 익명 트랙 활성화 / 채널·스토리는 Phase 2부터
      </footer>
    </main>
  );
}
