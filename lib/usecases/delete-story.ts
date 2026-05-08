import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

export interface DeleteStoryInput {
  storyId: string;
  /** 권한 검증용. 채널 소유자만 삭제 가능. */
  userId: string;
}

// 채널 소유자만 삭제 가능. Service Role 로 직접 검증.
// (RLS는 본문 인증된 사용자만 통과시키지만, 익명 트랙은 자체 쿠키 기반이라 서버에서 검증.)

export async function deleteStory(input: DeleteStoryInput): Promise<void> {
  const supabase = createAdminClient();

  // 채널 소유자 확인
  const { data: story, error: getError } = await supabase
    .from('stories')
    .select('id, channel_id, channels!inner(owner_id)')
    .eq('id', input.storyId)
    .maybeSingle();

  if (getError) {
    console.error('[deleteStory] story 조회 실패:', getError);
    throw new Error(`STORY_FETCH_FAILED: ${getError.message}`);
  }
  if (!story) {
    throw new Error('STORY_NOT_FOUND');
  }
  const ownerId = (story.channels as unknown as { owner_id: string }).owner_id;
  if (ownerId !== input.userId) {
    throw new Error('STORY_FORBIDDEN: 채널 소유자만 스토리를 삭제할 수 있어요');
  }

  const { error: deleteError } = await supabase
    .from('stories')
    .delete()
    .eq('id', input.storyId);

  if (deleteError) {
    console.error('[deleteStory] 삭제 실패:', deleteError);
    throw new Error(`STORY_DELETE_FAILED: ${deleteError.message}`);
  }
}
