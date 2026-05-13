'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { broadcastFromServer } from '@/lib/infra/realtime/broadcast-server';

// D-015: 알림을 read 처리. 본인 알림만 가능.

export interface MarkReadResult {
  ok: boolean;
  error?: string;
}

const inputSchema = z.object({
  notificationId: z.string().uuid('알림 ID 형식이 잘못됐어요'),
});

export async function markNotificationReadAction(
  notificationId: string,
): Promise<MarkReadResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  const parsed = inputSchema.safeParse({ notificationId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', parsed.data.notificationId)
    .eq('recipient_user_id', user.id)
    .is('read_at', null);
  if (error) {
    console.error('[markNotificationReadAction] 실패:', error);
    return { ok: false, error: '알림 처리 실패' };
  }
  // 다른 탭 동기화용 push
  await broadcastFromServer({
    topic: `user-notifications:${user.id}`,
    event: 'notification_updated',
    payload: { notificationId: parsed.data.notificationId },
  });
  return { ok: true };
}
