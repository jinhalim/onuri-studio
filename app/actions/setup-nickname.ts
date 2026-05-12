'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { createClient as createServerSupabase } from '@/lib/infra/supabase/server';
import { nicknameSchema } from '@/lib/security/validators';
import { transferAnonymousToUser } from '@/lib/usecases/transfer-anonymous-to-user';
import { provisionOnboardingSample } from '@/lib/usecases/provision-onboarding-sample';

export interface SetupNicknameState {
  ok: boolean;
  error?: string;
}

// Google OAuth callback 후 닉네임 확정 단계.
// auth.users 세션은 이미 있으니 그 id 기준으로 public.users 의 nickname 컬럼 업데이트.
// 닉네임 중복은 0009 unique index + 미리 SELECT 로 차단.

export async function setupNicknameAction(
  _prev: SetupNicknameState,
  formData: FormData,
): Promise<SetupNicknameState> {
  const raw = formData.get('nickname');
  if (typeof raw !== 'string') {
    return { ok: false, error: '닉네임이 누락됐어요' };
  }

  const parsed = nicknameSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '닉네임이 유효하지 않아요' };
  }
  const nickname = parsed.data;

  // 현재 세션 확인 (Google OAuth)
  const ssr = createServerSupabase();
  const { data: sess, error: sessErr } = await ssr.auth.getUser();
  if (sessErr || !sess.user) {
    return { ok: false, error: '로그인 세션이 만료됐어요. 다시 로그인해주세요.' };
  }
  const userId = sess.user.id;

  const admin = createAdminClient();

  // 익명 흔적 먼저 흡수 — 익명 user 가 그 nickname 을 점유 중이면 unique check
  // 에 걸리니, 익명 user 를 먼저 삭제해서 nickname 슬롯을 해제한 뒤 update.
  // 사용자 UX: 익명 시 쓰던 닉네임을 그대로 Google 계정에 이어 쓰기 가능.
  try {
    await transferAnonymousToUser(userId);
  } catch (err) {
    console.error('[setupNicknameAction] anon transfer 실패 (무시):', err);
  }

  // 닉네임 중복 체크 (본인 제외)
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle();
  if (existing && existing.id !== userId) {
    return { ok: false, error: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.' };
  }

  // public.users 의 nickname update
  const { error } = await admin
    .from('users')
    .update({ nickname })
    .eq('id', userId);
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.' };
    }
    console.error('[setupNicknameAction] update 실패:', error);
    return { ok: false, error: '닉네임 저장에 실패했어요' };
  }

  // onboarding 샘플 생성 (이미 onboarded_at 있으면 skip)
  try {
    await provisionOnboardingSample(userId);
  } catch (err) {
    console.error('[setupNicknameAction] onboarding 실패 (무시):', err);
  }

  revalidatePath('/');
  redirect('/');
}
