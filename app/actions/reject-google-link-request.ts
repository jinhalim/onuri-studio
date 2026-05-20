'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';
import { broadcastFromServer } from '@/lib/infra/realtime/broadcast-server';

// D-021: admin 이 Google 연동 요청을 거부 처리. spam/오타 등 처리.
// 사용자가 새 이메일로 다시 신청 가능 (pending 상태가 아니라 unique index 통과).

export interface RejectGoogleLinkResult {
  ok: boolean;
  error?: string;
}

const inputSchema = z.object({
  requestId: idSchema,
  reason: z.string().trim().max(200).optional(),
});

export async function rejectGoogleLinkRequestAction(
  requestId: string,
  reason?: string,
): Promise<RejectGoogleLinkResult> {
  const adminUser = await getCurrentUser();
  if (!adminUser || adminUser.role !== 'admin') {
    return { ok: false, error: '권한이 없어요' };
  }

  const parsed = inputSchema.safeParse({ requestId, reason });
  if (!parsed.success) return { ok: false, error: '입력 형식 오류' };

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from('google_link_requests')
    .select('id, user_id, email, status')
    .eq('id', parsed.data.requestId)
    .maybeSingle();
  if (fetchErr || !req) return { ok: false, error: '요청을 찾을 수 없어요' };
  if (req.status !== 'pending') {
    return { ok: false, error: '이미 처리된 요청이에요' };
  }

  const { error: updateErr } = await admin
    .from('google_link_requests')
    .update({
      status: 'rejected',
      processed_at: new Date().toISOString(),
      processed_by: adminUser.id,
    })
    .eq('id', req.id);
  if (updateErr) {
    console.error('[rejectGoogleLinkRequestAction] update 실패:', updateErr);
    return { ok: false, error: '거부 처리 실패' };
  }

  const { data: notif } = await admin
    .from('notifications')
    .insert({
      recipient_user_id: req.user_id,
      type: 'google_link_rejected',
      payload: {
        requestId: req.id,
        email: req.email,
        processedByNickname: adminUser.nickname,
        reason: parsed.data.reason ?? null,
      },
    })
    .select('id')
    .single();

  await broadcastFromServer({
    topic: `user-notifications:${req.user_id}`,
    event: 'new_notification',
    payload: { notificationId: notif?.id ?? null, type: 'google_link_rejected' },
  });

  return { ok: true };
}
