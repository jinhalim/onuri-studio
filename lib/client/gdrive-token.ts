'use client';

import { createClient } from '@/lib/infra/supabase/client';

// D-018 Phase 8b: Supabase 세션에서 Google provider access token 추출.
// `signInWithOAuth({ provider: 'google', scopes: 'drive.file' })` 로 로그인한 사용자는
// session.provider_token 으로 Google API 접근 가능 (TTL ~1시간).
//
// PoC 정책: 토큰 만료 시 사용자에게 "다시 로그인 필요" 안내. server-side refresh 없음.

export interface DriveTokenResult {
  ok: boolean;
  /** Google access token (provider_token). 만료 가능 (~1시간). */
  accessToken?: string;
  error?: 'no-session' | 'no-provider-token' | 'unknown';
  errorMessage?: string;
}

export async function getDriveAccessToken(): Promise<DriveTokenResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { ok: false, error: 'unknown', errorMessage: error.message };
    }
    if (!data.session) {
      return { ok: false, error: 'no-session', errorMessage: '로그인 세션이 없어요' };
    }
    const token = data.session.provider_token;
    if (!token) {
      return {
        ok: false,
        error: 'no-provider-token',
        errorMessage: 'Google Drive 권한이 부여되지 않았어요. 로그아웃 후 다시 Google 로 로그인해주세요.',
      };
    }
    return { ok: true, accessToken: token };
  } catch (err) {
    return {
      ok: false,
      error: 'unknown',
      errorMessage: err instanceof Error ? err.message : 'unknown',
    };
  }
}
