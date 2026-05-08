import 'server-only';
import { nanoid } from 'nanoid';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import type { Story } from '@/lib/domain/story';

const ID_LENGTH = 12;
const MAX_RETRIES = 5;

export interface CreateStoryInput {
  channelId: string;
  /** 미입력 시 "이름 N" 자동 부여. */
  title?: string;
}

// 채널의 다음 일련번호를 계산해서 기본 제목 "이름 N" 부여.
// 사용자가 명시적으로 title을 주면 그 값 사용 (검증은 server action 단에서).

export async function createStory(input: CreateStoryInput): Promise<Story> {
  const supabase = createAdminClient();

  let title = input.title;
  if (!title) {
    const { count, error: countError } = await supabase
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', input.channelId);
    if (countError) {
      console.error('[createStory] count 실패:', countError);
      throw new Error(`STORY_COUNT_FAILED: ${countError.message}`);
    }
    title = `이름 ${(count ?? 0) + 1}`;
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const id = nanoid(ID_LENGTH);

    const { data, error } = await supabase
      .from('stories')
      .insert({
        id,
        channel_id: input.channelId,
        title,
        external_links: {},
      })
      .select()
      .single();

    if (!error && data) {
      return {
        id: data.id,
        channelId: data.channel_id,
        title: data.title,
        titleUpdatedAt: data.title_updated_at,
        createdAt: data.created_at,
        thumbnailUrl: data.thumbnail_url,
        externalLinks: data.external_links ?? {},
      };
    }

    if (error?.code !== '23505') {
      console.error('[createStory] insert 실패:', error);
      throw new Error(`STORY_CREATE_FAILED: ${error?.message ?? 'unknown'}`);
    }
  }

  throw new Error('STORY_CREATE_FAILED: nanoid 충돌이 5회 연속 발생');
}
