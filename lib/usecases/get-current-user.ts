import 'server-only';
import { readAnonymousUserIdFromCookie } from '@/lib/infra/auth/anonymous-provider';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { isSupabaseConfigured } from '@/lib/config/env';
import type { User } from '@/lib/domain/user';

// 현재 요청의 인증 상태 조회.
// MVP: 익명 쿠키만 검사. Phase 9에서 Supabase JWT 세션도 병합 검사.

export async function getCurrentUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;

  // TODO[Phase9-Email]: 회원 JWT 세션 우선 검사 → 없으면 익명 쿠키 fallback.
  const anonId = readAnonymousUserIdFromCookie();
  if (!anonId) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', anonId)
    .maybeSingle();

  if (error || !data) return null;

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
