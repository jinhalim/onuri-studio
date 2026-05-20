'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { checkRateLimit } from '@/lib/usecases/check-rate-limit';

// D-021: 사용자가 Google 연동 등록 요청. /me 의 dialog 에서 호출.
//   - Google 로 이미 로그인했거나 google provider 가 linked 면 거부.
//   - pending 요청 이미 있으면 already_pending 으로 응답.
//   - 그 외엔 google_link_requests INSERT (status='pending').
//
// Rate limit: 동일 사용자 3회 / 시간 — 동일 요청 spam 방지.

export interface SubmitGoogleLinkResult {
  ok: boolean;
  error?: string;
  status?: 'created' | 'already_pending' | 'already_linked';
}

const inputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('유효한 이메일 형식이 아니에요'),
});

export async function submitGoogleLinkRequestAction(
  email: string,
): Promise<SubmitGoogleLinkResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  if (!user.isAnonymous || user.linkedProviders.includes('google')) {
    return { ok: false, status: 'already_linked', error: '이미 Google 계정이 연결돼있어요' };
  }

  const rl = await checkRateLimit({
    key: `google-link-request:${user.id}`,
    maxPerWindow: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.ok) {
    const mins = Math.ceil((rl.retryAfterSec ?? 60) / 60);
    return {
      ok: false,
      error: `요청이 너무 잦아요. ${mins}분 후 다시 시도해주세요.`,
    };
  }

  const parsed = inputSchema.safeParse({ email });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '이메일 형식 오류' };
  }

  const admin = createAdminClient();

  // 같은 user 의 pending 요청이 이미 있으면 dedupe (DB partial unique index 도 보장하지만
  // friendlier 한 에러 메시지 위해 사전 체크).
  const { data: existing } = await admin
    .from('google_link_requests')
    .select('id, email')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
    return { ok: true, status: 'already_pending' };
  }

  const { error: insertErr } = await admin.from('google_link_requests').insert({
    user_id: user.id,
    email: parsed.data.email,
    status: 'pending',
  });
  if (insertErr) {
    console.error('[submitGoogleLinkRequestAction] insert 실패:', insertErr);
    return { ok: false, error: '요청 저장에 실패했어요' };
  }

  return { ok: true, status: 'created' };
}
