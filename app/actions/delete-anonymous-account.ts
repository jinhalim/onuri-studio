'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { clearAnonymousCookie } from '@/lib/infra/auth/anonymous-provider';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// D-014: 익명 사용자의 "나가기 → 데이터 삭제" 옵션.
// 본인이 익명 user 인 경우만 동작. cascade 로 채널/스토리/participations 모두 삭제.
// auth.users 삭제 → public.users (cascade) → channels (cascade) → stories/participations.

export async function deleteAnonymousAccountAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    // 이미 로그아웃 — 그냥 cookie 정리 후 메인으로
    clearAnonymousCookie();
    redirect('/');
  }

  if (!user.isAnonymous) {
    // 안전장치: 회원 계정은 이 action 으로 삭제 불가
    throw new Error('NOT_ANONYMOUS: 회원 계정은 데이터 삭제 옵션을 사용할 수 없어요');
  }

  const admin = createAdminClient();
  try {
    await admin.auth.admin.deleteUser(user.id);
  } catch (err) {
    console.error('[deleteAnonymousAccountAction] auth.users 삭제 실패:', err);
    // user row 가 남아있을 수 있지만 cookie 는 정리해서 더이상 본인 식별 안 되게.
  }

  clearAnonymousCookie();
  revalidatePath('/');
  redirect('/');
}
