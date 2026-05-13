'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import type { EditRequestPayload } from '@/lib/domain/notification';
import { broadcastFromServer } from '@/lib/infra/realtime/broadcast-server';

// D-015: owner 가 받은 edit_request 알림을 승인.
// 1) story_permissions 에 'editor' row upsert (이미 있으면 idempotent).
// 2) 원본 edit_request 알림을 read_at 으로 표시 (목록에서 회색 처리).
// 3) requester 에게 edit_request_approved 알림 INSERT (Realtime push 됨).

export interface ApproveResult {
  ok: boolean;
  error?: string;
}

const inputSchema = z.object({
  notificationId: z.string().uuid('알림 ID 형식이 잘못됐어요'),
});

export async function approveEditRequestAction(
  notificationId: string,
): Promise<ApproveResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  const parsed = inputSchema.safeParse({ notificationId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  const { data: notif } = await admin
    .from('notifications')
    .select('id, recipient_user_id, type, payload')
    .eq('id', parsed.data.notificationId)
    .eq('recipient_user_id', user.id)
    .eq('type', 'edit_request')
    .maybeSingle();
  if (!notif) return { ok: false, error: '알림을 찾을 수 없어요' };

  const payload = notif.payload as EditRequestPayload;

  // 본인이 정말 그 스토리의 owner 인지 재검증 (RLS 외 방어선)
  const { data: story } = await admin
    .from('stories')
    .select('id, channel_id, channels!inner(owner_id)')
    .eq('id', payload.storyId)
    .maybeSingle();
  if (!story) return { ok: false, error: '스토리가 더 이상 존재하지 않아요' };
  const ownerId = (story.channels as unknown as { owner_id: string }).owner_id;
  if (ownerId !== user.id) return { ok: false, error: '권한이 없어요' };

  const { error: permErr } = await admin
    .from('story_permissions')
    .upsert(
      {
        story_id: payload.storyId,
        user_id: payload.requesterUserId,
        role: 'editor',
        granted_by: user.id,
      },
      { onConflict: 'story_id,user_id' },
    );
  if (permErr) {
    console.error('[approveEditRequestAction] 권한 부여 실패:', permErr);
    return { ok: false, error: '권한 부여 실패' };
  }

  // 원본 알림 read 처리
  await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notif.id);

  // 요청자에게 승인 알림
  const { data: inserted, error: pushErr } = await admin
    .from('notifications')
    .insert({
      recipient_user_id: payload.requesterUserId,
      type: 'edit_request_approved',
      payload: {
        storyId: payload.storyId,
        storyTitle: payload.storyTitle,
        channelId: payload.channelId,
        channelName: payload.channelName,
        ownerUserId: user.id,
        ownerNickname: user.nickname,
      },
    })
    .select('id')
    .single();
  if (pushErr) {
    console.error('[approveEditRequestAction] 승인 알림 전송 실패:', pushErr);
    // 권한 자체는 부여됐으니 부분 성공 — 에러 안 던지고 그냥 로그.
  }

  // owner 본인 다른 탭에도 원본 read 처리 push
  await broadcastFromServer({
    topic: `user-notifications:${user.id}`,
    event: 'notification_updated',
    payload: { notificationId: notif.id },
  });
  // 요청자에게 push
  if (inserted) {
    await broadcastFromServer({
      topic: `user-notifications:${payload.requesterUserId}`,
      event: 'new_notification',
      payload: { notificationId: inserted.id, type: 'edit_request_approved' },
    });
  }

  return { ok: true };
}
