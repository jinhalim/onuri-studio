import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import type { Channel } from '@/lib/domain/channel';
import type { Story, ExternalLinks } from '@/lib/domain/story';

export interface ChannelWithStories {
  channel: Channel;
  stories: Story[];
  ownerNickname: string;
}

// Channel Guide 페이지에서 사용. 채널 + 모든 스토리 + 소유자 닉네임을 한 번에 조회.

export async function getChannelWithStories(channelId: string): Promise<ChannelWithStories | null> {
  const supabase = createAdminClient();

  const { data: channel, error: channelError } = await supabase
    .from('channels')
    .select('id, name, owner_id, created_at, users!channels_owner_id_fkey(nickname)')
    .eq('id', channelId)
    .maybeSingle();

  if (channelError) {
    console.error('[getChannelWithStories] channel 조회 실패:', channelError);
    throw new Error(`GET_CHANNEL_FAILED: ${channelError.message}`);
  }
  if (!channel) return null;

  const { data: storiesRaw, error: storiesError } = await supabase
    .from('stories')
    .select('id, channel_id, title, title_updated_at, created_at, thumbnail_url, external_links')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true });

  if (storiesError) {
    console.error('[getChannelWithStories] stories 조회 실패:', storiesError);
    throw new Error(`GET_STORIES_FAILED: ${storiesError.message}`);
  }

  const ownerNickname =
    (channel.users as unknown as { nickname: string } | null)?.nickname ?? '익명';

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
