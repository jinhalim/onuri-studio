'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/config/env';

// 브라우저 (Client Component)에서 사용하는 Supabase 클라이언트.
// anon key만 사용. RLS 정책으로 보호되는 데이터에만 접근.

export function createClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_NOT_CONFIGURED: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 미설정');
  }
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
