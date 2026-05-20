'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';
import { broadcastFromServer } from '@/lib/infra/realtime/broadcast-server';

// D-021: admin 이 Google 연동 요청을 승인 처리.
//   - admin 이 Google Cloud Console 에 해당 이메일을 수동 등록한 뒤 본 함수 호출.
//   - status='approved' + processed_at/processed_by 기록.
//   - 요청자에게 'google_link_approved' 알림 INSERT + Realtime broadcast.
//   - 요청자가 알림 클릭 → /me 에서 Google 연동 재시도 가능.

export interface ApproveGoogleLinkResult {
  ok: boolean;
  error?: string;
}

const inputSchema = z.object({ requestId: idSchema });

export async function approveGoogleLinkRequestAction(
  requestId: string,
): Promise<ApproveGoogleLinkResult> {
  const adminUser = await getCurrentUser();
  if (!adminUser || adminUser.role !== 'admin') {
    return { ok: false, error: '권한이 없어요' };
  }

  const parsed = inputSchema.safeParse({ requestId });
  if (!parsed.success) return { ok: false, error: '요청 ID 형식 오류' };

  const admin = createAdminClient();

  // 요청 조회 (이미 처리됐는지 체크).
  const { data: req, error: fetchErr } = await admin
    .from('google_link_requests')
    .select('id, user_id, email, status')
    .eq('id', parsed.data.requestId)
    .maybeSingle();
  if (fetchErr || !req) return { ok: false, error: '요청을 찾을 수 없어요' };
  if (req.status !== 'pending') {
    return { ok: false, error: '이미 처리된 요청이에요' };
  }

  // 승인 처리.
  const { error: updateErr } = await admin
    .from('google_link_requests')
    .update({
      status: 'approved',
      processed_at: new Date().toISOString(),
      processed_by: adminUser.id,
    })
    .eq('id', req.id);
  if (updateErr) {
    console.error('[approveGoogleLinkRequestAction] update 실패:', updateErr);
    return { ok: false, error: '승인 처리 실패' };
  }

  // 요청자에게 알림 INSERT.
  const { data: notif, error: notifErr } = await admin
    .from('notifications')
    .insert({
      recipient_user_id: req.user_id,
      type: 'google_link_approved',
      payload: {
        requestId: req.id,
        email: req.email,
        processedByNickname: adminUser.nickname,
      },
    })
    .select('id')
    .single();
  if (notifErr) {
    console.warn('[approveGoogleLinkRequestAction] 알림 생성 실패 (graceful):', notifErr);
  }

  // Realtime broadcast — 익명 사용자도 user-notifications:{userId} 채널 구독 (D-015 패턴).
  await broadcastFromServer({
    topic: `user-notifications:${req.user_id}`,
    event: 'new_notification',
    payload: { notificationId: notif?.id ?? null, type: 'google_link_approved' },
  });

  return { ok: true };
}
