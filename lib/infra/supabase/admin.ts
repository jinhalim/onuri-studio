import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/config/env';

// ⚠️ Service Role 키 사용. RLS를 우회하므로 서버 모듈에서만 import.
// 'server-only' import 가 클라이언트 번들에 포함되면 빌드 에러로 차단.

export function createAdminClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_ADMIN_NOT_CONFIGURED: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 미설정',
    );
  }
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
