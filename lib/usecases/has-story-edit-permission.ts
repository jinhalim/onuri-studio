import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// D-015: 주어진 사용자가 해당 스토리에 'editor' 권한을 갖고 있는지 조회.
// owner 체크는 이미 page 에서 처리하므로 여기선 story_permissions 만 확인.
//
// 호출처: app/ch/[channelId]/story/[storyId]/page.tsx
//        + save-story-snapshot usecase (편집 가드).

export interface HasStoryEditPermissionInput {
  storyId: string;
  userId: string;
}

export async function hasStoryEditPermission(
  input: HasStoryEditPermissionInput,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('story_permissions')
    .select('id')
    .eq('story_id', input.storyId)
    .eq('user_id', input.userId)
    .eq('role', 'editor')
    .maybeSingle();
  if (error) {
    console.error('[hasStoryEditPermission] 조회 실패:', error);
    return false;
  }
  return !!data;
}
