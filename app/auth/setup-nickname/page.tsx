import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Wordmark } from '@/components/brand/Wordmark';
import { SetupNicknameForm } from '@/components/auth/SetupNicknameForm';
import { createClient as createServerSupabase } from '@/lib/infra/supabase/server';
import { createAdminClient } from '@/lib/infra/supabase/admin';

interface SetupNicknamePageProps {
  searchParams: { suggested?: string };
}

// Google OAuth 후 닉네임 입력 단계.
// 세션이 없으면 메인으로. 이미 닉네임 확정된 사용자도 메인으로 (재진입 방지).

export default async function SetupNicknamePage({ searchParams }: SetupNicknamePageProps) {
  const supabase = createServerSupabase();
  const { data: sess } = await supabase.auth.getUser();
  if (!sess.user) redirect('/');

  // 이미 닉네임 확정된 경우 (= __pending_ prefix 가 아님) 메인으로
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('users')
    .select('nickname')
    .eq('id', sess.user.id)
    .maybeSingle();
  if (profile && !profile.nickname.startsWith('__pending_')) {
    redirect('/');
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-8 px-4 py-6 sm:px-6 sm:py-12"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <Link href="/" className="hover:opacity-80">
        <Wordmark size="md" />
      </Link>

      <section className="flex w-full flex-col items-center gap-6 rounded-lg border border-divider bg-brand-surface/50 p-6">
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-xl font-bold text-fg">닉네임 설정</h1>
          <p className="text-sm text-fg-muted">
            Google 로 로그인했어요. 사용할 닉네임을 입력해주세요.
          </p>
        </div>
        <SetupNicknameForm suggested={searchParams.suggested} />
      </section>
    </main>
  );
}
