import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

export interface UpdateStoryTitleInput {
  storyId: string;
  title: string;
  /** 권한 검증용. 채널 소유자만 변경 가능. */
  userId: string;
}

export async function updateStoryTitle(input: UpdateStoryTitleInput): Promise<void> {
  const supabase = createAdminClient();

  const { data: story, error: getError } = await supabase
    .from('stories')
    .select('id, channels!inner(owner_id)')
    .eq('id', input.storyId)
    .maybeSingle();

  if (getError) {
    console.error('[updateStoryTitle] story 조회 실패:', getError);
    throw new Error(`TITLE_FETCH_FAILED: ${getError.message}`);
  }
  if (!story) throw new Error('TITLE_STORY_NOT_FOUND');
  const ownerId = (story.channels as unknown as { owner_id: string }).owner_id;
  if (ownerId !== input.userId) {
    throw new Error('TITLE_FORBIDDEN: 채널 소유자만 변경 가능');
  }

  const { error } = await supabase
    .from('stories')
    .update({
      title: input.title,
      title_updated_at: new Date().toISOString(),
    })
    .eq('id', input.storyId);

  if (error) {
    console.error('[updateStoryTitle] update 실패:', error);
    throw new Error(`TITLE_UPDATE_FAILED: ${error.message}`);
  }
}
