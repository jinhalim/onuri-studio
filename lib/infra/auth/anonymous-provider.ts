import { nanoid } from 'nanoid';
import { cookies } from 'next/headers';
import type { AuthProviderAdapter, AuthResult } from './types';
import { nicknameSchema } from '@/lib/security/validators';
import { assignAnonymousColor } from '@/lib/usecases/assign-anonymous-color';
import { provisionOnboardingSample } from '@/lib/usecases/provision-onboarding-sample';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { isSupabaseConfigured } from '@/lib/config/env';

const ANON_COOKIE_NAME = 'onuri_anon';
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30일

export interface AnonymousSignInInput {
  nickname: string;
  /** 같은 채널/스토리 내 활성 색상 (Phase 4에서 Yjs awareness로부터 전달). Phase 1: 빈 배열. */
  takenColors?: string[];
}

export const anonymousProvider: AuthProviderAdapter = {
  id: 'anonymous',

  isEnabled() {
    return true;
  },

  async signIn(input: unknown): Promise<AuthResult> {
    const parsed = parseInput(input);
    const nickname = nicknameSchema.parse(parsed.nickname);
    const color = assignAnonymousColor(parsed.takenColors ?? []);

    if (!isSupabaseConfigured()) {
      throw new Error(
        'SUPABASE_NOT_CONFIGURED: .env.local 에 NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 를 설정해주세요',
      );
    }

    const sessionToken = nanoid(32);
    const supabase = createAdminClient();

    // 닉네임 중복 미리 체크 — 정상 경로의 에러를 명확히 분리.
    // race condition 은 0009 의 unique index + insert 시점 fallback 으로 막음.
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('nickname', nickname)
      .maybeSingle();
    if (existing) {
      throw new Error('NICKNAME_TAKEN: 이미 사용 중인 닉네임');
    }

    // Supabase auth.admin.createUser 는 email 또는 phone 이 최소 하나 필요.
    // 익명 트랙에선 충돌 불가능한 fake 이메일(@anon.onuri.local)을 생성해서 대체.
    // Phase 9 회원 전환 시 이 fake 이메일을 실제 이메일로 updateUserById 한다.
    const fakeEmail = `anon_${nanoid(20)}@anon.onuri.local`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: fakeEmail,
      email_confirm: true, // fake 이므로 확인 절차 없이 즉시 활성
      user_metadata: { nickname, color },
    });
    if (authError || !authData.user) {
      // 실제 원인은 서버 콘솔에 그대로 출력 (개발 디버깅용).
      console.error('[anonymous-provider] auth.admin.createUser 실패:', authError);
      throw new Error(`AUTH_USER_CREATE_FAILED: ${authError?.message ?? 'unknown'}`);
    }

    // public.users mirror row 생성
    const { error: profileError } = await supabase.from('users').insert({
      id: authData.user.id,
      nickname,
      color,
      primary_auth_provider: 'anonymous',
      linked_providers: [],
      is_anonymous: true,
      role: 'user',
    });
    if (profileError) {
      console.error('[anonymous-provider] public.users insert 실패:', profileError);
      // unique violation (Postgres 23505) → 미리 체크 통과 후 동시 가입 race condition.
      // 이미 만든 auth.users row 정리하고 친절 에러로 변환.
      if (profileError.code === '23505') {
        await supabase.auth.admin.deleteUser(authData.user.id).catch(() => {});
        throw new Error('NICKNAME_TAKEN: 이미 사용 중인 닉네임 (동시 가입)');
      }
      throw new Error(`USER_PROFILE_CREATE_FAILED: ${profileError.message}`);
    }

    // 익명 세션 row
    const { error: sessionError } = await supabase
      .from('anonymous_sessions')
      .insert({ session_token: sessionToken, converted_user_id: null });
    if (sessionError) {
      console.error('[anonymous-provider] anonymous_sessions insert 실패:', sessionError);
      throw new Error(`SESSION_CREATE_FAILED: ${sessionError.message}`);
    }

    // httpOnly 쿠키. user.id와 session_token을 함께 저장.
    cookies().set(ANON_COOKIE_NAME, `${authData.user.id}:${sessionToken}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: ANON_COOKIE_MAX_AGE,
      path: '/',
    });

    // 신규 사용자 onboarding — "채널 메뉴얼" + "스토리 화이트보드 사용법" 자동 생성.
    // 실패해도 sign-in 자체는 막지 않음 (try/catch, 로그만).
    try {
      await provisionOnboardingSample(authData.user.id);
    } catch (err) {
      console.error('[anonymous-provider] onboarding 실패 (sign-in 자체는 성공):', err);
    }

    return {
      userId: authData.user.id,
      isAnonymous: true,
      redirectTo: '/',
    };
  },
};

function parseInput(input: unknown): AnonymousSignInInput {
  if (typeof input !== 'object' || input === null) {
    throw new Error('INVALID_INPUT: anonymousProvider.signIn 는 { nickname, takenColors? } 를 받습니다');
  }
  const v = input as Record<string, unknown>;
  return {
    nickname: typeof v.nickname === 'string' ? v.nickname : '',
    takenColors: Array.isArray(v.takenColors) ? (v.takenColors as string[]) : [],
  };
}

// 쿠키에서 user.id를 꺼내 현재 익명 사용자 식별.
export function readAnonymousUserIdFromCookie(): string | null {
  const raw = cookies().get(ANON_COOKIE_NAME)?.value;
  if (!raw) return null;
  const [userId] = raw.split(':');
  return userId ?? null;
}

export function clearAnonymousCookie(): void {
  cookies().delete(ANON_COOKIE_NAME);
}
