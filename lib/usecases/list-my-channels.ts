import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import type { Channel } from '@/lib/domain/channel';

// 사용자가 소유한 채널 목록 + 각 채널의 스토리 개수 + 마지막 활동 시각.
// 마이페이지/랜딩에서 모두 사용.

export interface MyChannelSummary extends Channel {
  storyCount: number;
  lastStoryUpdatedAt: string | null;
}

export async function listMyChannels(userId: string): Promise<MyChannelSummary[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('channels')
    .select(
      `
      id, name, owner_id, created_at,
      stories ( id, title_updated_at )
    `,
    )
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[listMyChannels] 실패:', error);
    throw new Error(`LIST_CHANNELS_FAILED: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const stories = (row.stories as { id: string; title_updated_at: string }[]) ?? [];
    const lastUpdated = stories.length
      ? stories
          .map((s) => s.title_updated_at)
          .sort()
          .at(-1) ?? null
      : null;
    return {
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      createdAt: row.created_at,
      storyCount: stories.length,
      lastStoryUpdatedAt: lastUpdated,
    };
  });
}
