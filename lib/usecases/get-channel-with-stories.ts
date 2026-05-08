import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import type { Channel } from '@/lib/domain/channel';
import type { Story, ExternalLinks } from '@/lib/domain/story';

export interface ChannelWithStories {
  channel: Channel;
  stories: Story[];
  ownerNickname: string;
}

// Channel Guide 페이지와 Story 페이지에서 모두 사용.
// 안정성/디버깅 편의를 위해 join 대신 3개 쿼리로 분리.

export async function getChannelWithStories(channelId: string): Promise<ChannelWithStories | null> {
  const supabase = createAdminClient();

  // 1) channel
  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .select('id, name, owner_id, created_at')
    .eq('id', channelId)
    .maybeSingle();

  if (channelError) {
    console.error('[getChannelWithStories] channel 조회 실패:', channelError);
    return null;
  }
  if (!channel) {
    console.warn('[getChannelWithStories] channel 없음:', channelId);
    return null;
  }

  // 2) owner nickname
  const { data: owner, error: ownerError } = await supabase
    .from('users')
    .select('nickname')
    .eq('id', channel.owner_id)
    .maybeSingle();

  if (ownerError) {
    console.error('[getChannelWithStories] owner 조회 실패:', ownerError);
  }
  const ownerNickname = owner?.nickname ?? '익명';

  // 3) stories
  const { data: storiesRaw, error: storiesError } = await supabase
    .from('stories')
    .select('id, channel_id, title, title_updated_at, created_at, thumbnail_url, external_links')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true });

  if (storiesError) {
    console.error('[getChannelWithStories] stories 조회 실패:', storiesError);
    return null;
  }

  return {
    channel: {
      id: channel.id,
      name: channel.name,
      ownerId: channel.owner_id,
      createdAt: channel.created_at,
    },
    ownerNickname,
    stories: (storiesRaw ?? []).map((s) => ({
      id: s.id,
      channelId: s.channel_id,
      title: s.title,
      titleUpdatedAt: s.title_updated_at,
      createdAt: s.created_at,
      thumbnailUrl: s.thumbnail_url,
      externalLinks: (s.external_links as ExternalLinks) ?? {},
    })),
  };
}
