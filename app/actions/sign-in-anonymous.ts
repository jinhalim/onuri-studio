'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { anonymousProvider } from '@/lib/infra/auth/anonymous-provider';
import { nicknameSchema } from '@/lib/security/validators';

export interface SignInAnonymousState {
  ok: boolean;
  error?: string;
}

// 랜딩 페이지 NicknameForm에서 호출하는 Server Action.
// useFormState 와 호환되는 시그니처: (prevState, formData) => state.
// D-014: 미인증 사용자가 다른 URL 로 접근 시 middleware 가 `next` hidden input
// 으로 원래 URL 보존 → 가입 성공 후 그 URL 로 redirect.

export async function signInAnonymous(
  _prevState: SignInAnonymousState,
  formData: FormData,
): Promise<SignInAnonymousState> {
  const raw = formData.get('nickname');
  if (typeof raw !== 'string') {
    return { ok: false, error: '닉네임이 누락됐어요' };
  }

  const parsed = nicknameSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '닉네임이 유효하지 않아요' };
  }

  try {
    await anonymousProvider.signIn({ nickname: parsed.data, takenColors: [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'UNKNOWN';
    console.error('[sign-in-anonymous] 실패:', err);
    return { ok: false, error: prettyError(message) };
  }

  revalidatePath('/');

  // next 파라미터 검증 후 redirect (open redirect 방지: 같은 origin path 만 허용)
  const nextRaw = formData.get('next');
  if (typeof nextRaw === 'string' && nextRaw.startsWith('/') && !nextRaw.startsWith('//')) {
    redirect(nextRaw);
  }
  redirect('/');
}

function prettyError(raw: string): string {
  if (raw.startsWith('NICKNAME_TAKEN')) {
    return '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요.';
  }
  if (raw.startsWith('SUPABASE_NOT_CONFIGURED')) {
    return 'Supabase가 아직 설정되지 않았어요. .env.local 을 확인해주세요.';
  }
  if (raw.startsWith('SUPABASE_ADMIN_NOT_CONFIGURED')) {
    return 'Supabase Service Role Key 가 누락됐어요.';
  }
  if (raw.startsWith('AUTH_USER_CREATE_FAILED')) {
    return '사용자 생성에 실패했어요. 잠시 후 다시 시도해주세요.';
  }
  return '입장 중 오류가 발생했어요. 콘솔을 확인해주세요.';
}
