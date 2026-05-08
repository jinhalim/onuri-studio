import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

export interface RecordParticipationInput {
  userId: string;
  channelId: string;
  /** 스토리 페이지 진입 시 채움. Channel Guide 진입은 null. */
  storyId?: string | null;
}

// 사용자가 채널/스토리에 진입할 때마다 호출.
// upsert 로 first_visited_at 은 보존하고 last_visited_at 만 갱신.
// owner 가 자기 채널 방문 시에도 'owner' role 유지.

export async function recordParticipation(input: RecordParticipationInput): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const storyId = input.storyId ?? null;

  // 채널 소유자인지 확인 (owner role 결정용)
  const { data: channel } = await supabase
    .from('channels')
    .select('owner_id')
    .eq('id', input.channelId)
    .maybeSingle();
  const role = channel?.owner_id === input.userId ? 'owner' : 'visitor';

  // upsert: 기존 row 가 있으면 last_visited_at 만 업데이트
  const { error } = await supabase
    .from('participations')
    .upsert(
      {
        user_id: input.userId,
        channel_id: input.channelId,
        story_id: storyId,
        role,
        last_visited_at: now,
      },
      { onConflict: 'user_id,channel_id,story_id', ignoreDuplicates: false },
    );

  if (error) {
    // 참여 기록 실패는 사용자 흐름을 막지 않음. 로그만 남김.
    console.error('[recordParticipation] 실패 (무시):', error);
  }
}
