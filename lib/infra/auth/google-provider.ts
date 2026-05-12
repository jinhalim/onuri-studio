import { createClient as createServerSupabase } from '@/lib/infra/supabase/server';
import { env } from '@/lib/config/env';
import type { AuthProviderAdapter, AuthResult } from './types';

// Google SSO provider — D-013.
// 실제 redirect URL 발급은 Supabase 가 처리.
// 클라이언트가 Supabase JS 의 signInWithOAuth({ provider: 'google' }) 를 호출하면
// Google 동의 화면 → /auth/callback?code=XXX 로 리다이렉트.
// /auth/callback 에서 code 를 Supabase JWT 세션으로 교환.

export const googleProvider: AuthProviderAdapter = {
  id: 'google',

  // Supabase Dashboard 에서 Google provider 가 enable 됐고
  // Cloud Console 에서 OAuth client 발급된 경우만 활성.
  // env 의 GOOGLE_CLIENT_ID 가 있으면 활성으로 본다 (Supabase 측 설정은 별도 점검 불가).
  isEnabled() {
    return Boolean(env.GOOGLE_CLIENT_ID);
  },

  async signIn(): Promise<AuthResult> {
    // Google OAuth 는 서버에서 직접 처리 안 함 — 클라이언트에서 signInWithOAuth 호출하고
    // /auth/callback 으로 돌아오는 흐름. 이 메서드는 호출되지 않음.
    throw new Error(
      'GOOGLE_SIGN_IN_CLIENT_ONLY: Google OAuth 는 클라이언트 컴포넌트에서 supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } }) 로 시작합니다.',
    );
  },

  async handleCallback(_req: Request): Promise<AuthResult> {
    // /auth/callback route.ts 가 Supabase 의 exchangeCodeForSession 을 호출하고
    // public.users mirror row 가 없으면 생성 (handleGoogleCallback use case).
    // 이 메서드는 어댑터 인터페이스 만족용 stub — 실제 로직은 route.ts.
    const supabase = createServerSupabase();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw new Error('GOOGLE_CALLBACK_NO_SESSION');
    }
    return {
      userId: data.user.id,
      isAnonymous: false,
      redirectTo: '/',
    };
  },
};
