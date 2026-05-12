import 'server-only';
import { readAnonymousUserIdFromCookie } from '@/lib/infra/auth/anonymous-provider';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { createClient as createServerSupabase } from '@/lib/infra/supabase/server';
import { isSupabaseConfigured } from '@/lib/config/env';
import type { User } from '@/lib/domain/user';

// 현재 요청의 인증 상태 조회.
// 우선순위:
// 1. Supabase JWT session (Google OAuth · 이메일 매직링크 등) — 회원 트랙
// 2. 익명 쿠키 fallback — 익명 트랙
// 닉네임이 __pending_ 으로 시작하면 setup-nickname 미완료 상태 → null 반환
// (라우트 보호 — 닉네임 확정 전엔 일반 페이지 접근 안 됨)

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  // 1) Supabase JWT 세션 우선
  let userId: string | null = null;
  try {
    const ssr = createServerSupabase();
    const { data } = await ssr.auth.getUser();
    if (data.user) userId = data.user.id;
  } catch {
    // ignore
  }

  // 2) 익명 쿠키 fallback
  if (!userId) {
    userId = readAnonymousUserIdFromCookie();
  }

  if (!userId) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  // 닉네임 미확정 상태 (Google OAuth 직후) — 페이지 진입 차단
  if (typeof data.nickname === 'string' && data.nickname.startsWith('__pending_')) return null;

  return {
    id: data.id,
    email: data.email,
    nickname: data.nickname,
    color: data.color,
    primaryAuthProvider: data.primary_auth_provider,
    linkedProviders: data.linked_providers ?? [],
    isAnonymous: data.is_anonymous,
    role: data.role,
    createdAt: data.created_at,
    lastSeenAt: data.last_seen_at,
  };
}
