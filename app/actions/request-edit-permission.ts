'use server';

import { z } from 'zod';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';
import { broadcastFromServer } from '@/lib/infra/realtime/broadcast-server';
import { checkRateLimit } from '@/lib/usecases/check-rate-limit';

// D-015: 비-owner 사용자가 특정 스토리의 수정 권한을 owner 에게 요청.
// - 본인이 owner 면 거부.
// - 이미 권한 보유 시 already_granted (요청 굳이 안 보냄).
// - 그 외엔 owner 에게 edit_request 알림 INSERT.
//   같은 (story, requester) 의 unread edit_request 가 이미 있으면 dedupe.

export interface RequestEditResult {
  ok: boolean;
  error?: string;
  status?: 'created' | 'already_granted' | 'already_pending';
}

const inputSchema = z.object({
  storyId: idSchema,
});

export async function requestEditPermissionAction(
  storyId: string,
): Promise<RequestEditResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  // Rate limit: 권한 요청 5회/분/사용자 — spam 방지.
  const rl = await checkRateLimit({
    key: `edit-request:${user.id}`,
    maxPerWindow: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `요청이 너무 잦아요. ${rl.retryAfterSec}초 후 다시 시도해주세요.`,
    };
  }

  const parsed = inputSchema.safeParse({ storyId });
  if (!parsed.success) return { ok: false, error: '스토리 ID가 유효하지 않아요' };

  const admin = createAdminClient();

  // 스토리 + 채널 owner 조회
  const { data: story, error: storyErr } = await admin
    .from('stories')
    .select('id, title, channel_id, channels!inner(id, name, owner_id)')
    .eq('id', parsed.data.storyId)
    .maybeSingle();
  if (storyErr || !story) return { ok: false, error: '스토리를 찾을 수 없어요' };
  const channel = story.channels as unknown as {
    id: string;
    name: string;
    owner_id: string;
  };

  if (channel.owner_id === user.id) {
    return { ok: false, error: '본인 스토리는 요청할 필요가 없어요' };
  }

  // 이미 editor 권한 있으면 skip
  const { data: existing } = await admin
    .from('story_permissions')
    .select('id')
    .eq('story_id', story.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (existing) return { ok: true, status: 'already_granted' };

  // 같은 (story, requester) 의 미읽음 edit_request 가 이미 있으면 dedupe
  const { data: pending } = await admin
    .from('notifications')
    .select('id')
    .eq('recipient_user_id', channel.owner_id)
    .eq('type', 'edit_request')
    .is('read_at', null)
    .contains('payload', { storyId: story.id, requesterUserId: user.id })
    .maybeSingle();
  if (pending) return { ok: true, status: 'already_pending' };

  const { data: inserted, error: notifErr } = await admin
    .from('notifications')
    .insert({
      recipient_user_id: channel.owner_id,
      type: 'edit_request',
      payload: {
        storyId: story.id,
        storyTitle: story.title,
        channelId: channel.id,
        channelName: channel.name,
        requesterUserId: user.id,
        requesterNickname: user.nickname,
        requesterColor: user.color,
      },
    })
    .select('id')
    .single();
  if (notifErr || !inserted) {
    console.error('[requestEditPermissionAction] 알림 생성 실패:', notifErr);
    return { ok: false, error: '요청 전송 실패' };
  }

  // Realtime push 로 owner 한테 즉시 알림. broadcast 자체는 메타만 전달, 클라이언트가
  // 본인 알림 list 를 invalidate/refetch 하면 detail 은 DB 에서 가져옴.
  await broadcastFromServer({
    topic: `user-notifications:${channel.owner_id}`,
    event: 'new_notification',
    payload: { notificationId: inserted.id, type: 'edit_request' },
  });

  return { ok: true, status: 'created' };
}
