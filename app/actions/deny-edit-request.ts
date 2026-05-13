'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import type { EditRequestPayload } from '@/lib/domain/notification';
import { broadcastFromServer } from '@/lib/infra/realtime/broadcast-server';

// D-015: owner 가 받은 edit_request 를 거절. 권한 부여 없이 알림만 보냄.

export interface DenyResult {
  ok: boolean;
  error?: string;
}

const inputSchema = z.object({
  notificationId: z.string().uuid('알림 ID 형식이 잘못됐어요'),
});

export async function denyEditRequestAction(
  notificationId: string,
): Promise<DenyResult> {
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

  await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notif.id);

  const { data: inserted } = await admin
    .from('notifications')
    .insert({
      recipient_user_id: payload.requesterUserId,
      type: 'edit_request_denied',
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

  await broadcastFromServer({
    topic: `user-notifications:${user.id}`,
    event: 'notification_updated',
    payload: { notificationId: notif.id },
  });
  if (inserted) {
    await broadcastFromServer({
      topic: `user-notifications:${payload.requesterUserId}`,
      event: 'new_notification',
      payload: { notificationId: inserted.id, type: 'edit_request_denied' },
    });
  }

  return { ok: true };
}
