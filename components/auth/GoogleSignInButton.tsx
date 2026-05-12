'use client';

import { useState } from 'react';
import { createClient } from '@/lib/infra/supabase/client';
import { cn } from '@/lib/utils';

// Google OAuth 시작 — supabase.auth.signInWithOAuth({ provider: 'google' }).
// Supabase 가 Google 동의 화면으로 redirect, 동의 후 /auth/callback?code=XXX 로 돌아옴.

interface Props {
  /** 로그인 후 돌아갈 경로 — 보통 setup-nickname 가 처리 후 / 로 보냄. */
  redirectTo?: string;
  className?: string;
  /** 버튼 라벨. default "Google 로 로그인". 마이페이지의 연동 버튼은 "Google 계정 연결". */
  label?: string;
}

export function GoogleSignInButton({ redirectTo, className, label }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const finalRedirectTo = `${origin}/auth/callback${
        redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : ''
      }`;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: finalRedirectTo },
      });
      if (oauthError) {
        setError(oauthError.message);
        setLoading(false);
      }
      // 성공 시 브라우저가 Google 로 redirect 되어 이 코드 종료
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 시작 실패');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          'inline-flex h-12 items-center justify-center gap-2 rounded-md',
          'border border-divider bg-brand-bezel px-5 text-base font-semibold text-fg',
          'transition-colors hover:bg-brand-surface',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        aria-label="Google 계정으로 로그인"
      >
        <GoogleLogo />
        <span>{loading ? '연결 중…' : (label ?? 'Google 로 로그인')}</span>
      </button>
      {error && (
        <p role="alert" className="text-sm text-rec">
          {error}
        </p>
      )}
    </div>
  );
}

function GoogleLogo() {
  // 공식 Google G 로고 (multicolor SVG). 흑백 페이지에서도 시각적 인식 강함.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.08-1.8 2.72v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.63z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.27c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.998 8.998 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71c-.18-.54-.28-1.12-.28-1.71s.1-1.17.28-1.71V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 8.998 8.998 0 0 0 .96 4.95l3.01 2.34C4.68 5.17 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
