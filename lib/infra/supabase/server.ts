import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { env } from '@/lib/config/env';

// Server Component / Route Handler / Server Action 에서 사용.
// Next.js cookies() API를 사용해 세션을 양방향 동기화.

export function createClient() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_NOT_CONFIGURED: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY 미설정');
  }
  const cookieStore = cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Component에서는 cookie write 불가. middleware/Route Handler에서만 동작.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // 위와 동일
        }
      },
    },
  });
}
