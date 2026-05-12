'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { nicknameSchema } from '@/lib/security/validators';

export interface UpdateNicknameResult {
  ok: boolean;
  error?: string;
}

// 마이페이지에서 닉네임 인라인 변경.
// 익명/회원 둘 다 가능. 0009 unique index 가 race condition 까지 막음.

export async function updateNicknameAction(
  raw: string,
): Promise<UpdateNicknameResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  const parsed = nicknameSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '닉네임이 유효하지 않아요' };
  }
  const nickname = parsed.data;

  // 본인 닉네임 그대로면 no-op (서버 호출만 했어도 성공으로 처리)
  if (nickname === user.nickname) {
    return { ok: true };
  }

  const admin = createAdminClient();

  // 미리 중복 체크 (자기 자신 제외)
  const { data: existing } = await admin
    .from('users')
    .select('id')
    .eq('nickname', nickname)
    .maybeSingle();
  if (existing && existing.id !== user.id) {
    return { ok: false, error: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.' };
  }

  const { error } = await admin
    .from('users')
    .update({ nickname })
    .eq('id', user.id);
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.' };
    }
    console.error('[updateNicknameAction] update 실패:', error);
    return { ok: false, error: '닉네임 변경에 실패했어요' };
  }

  // 마이페이지 + 닉네임이 노출되는 다른 페이지들 캐시 무효화
  revalidatePath('/me');
  revalidatePath('/');
  return { ok: true };
}
