'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { clearAnonymousCookie } from '@/lib/infra/auth/anonymous-provider';
import { createClient as createServerSupabase } from '@/lib/infra/supabase/server';

// D-013: 익명 쿠키 + Supabase JWT 세션 (Google OAuth) 둘 다 동시 종료.
// 두 트랙이 병행 가능하므로 한쪽만 있는 경우도 안전 (signOut 은 no-op).
// 사용자 요청: 나가기 누르면 어느 페이지에서든 메인(/) 으로 이동.

export async function signOut(): Promise<void> {
  clearAnonymousCookie();
  try {
    const supabase = createServerSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    // 세션이 없거나 SSR cookie write 제한 — 로그만
    console.error('[signOut] Supabase signOut 무시:', err);
  }
  revalidatePath('/');
  redirect('/');
}
