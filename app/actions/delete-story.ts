'use server';

import { revalidatePath } from 'next/cache';
import { deleteStory } from '@/lib/usecases/delete-story';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';

export interface DeleteStoryState {
  ok: boolean;
  error?: string;
}

export async function deleteStoryAction(
  _prevState: DeleteStoryState,
  formData: FormData,
): Promise<DeleteStoryState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '먼저 닉네임으로 입장해주세요' };

  const storyIdRaw = formData.get('storyId');
  const channelIdRaw = formData.get('channelId');
  const parsedStoryId = idSchema.safeParse(storyIdRaw);
  const parsedChannelId = idSchema.safeParse(channelIdRaw);

  if (!parsedStoryId.success) return { ok: false, error: '스토리 ID가 유효하지 않아요' };
  if (!parsedChannelId.success) return { ok: false, error: '채널 ID가 유효하지 않아요' };

  try {
    await deleteStory({ storyId: parsedStoryId.data, userId: user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    console.error('[deleteStoryAction] 실패:', err);
    if (msg.startsWith('STORY_FORBIDDEN')) {
      return { ok: false, error: '채널 소유자만 삭제할 수 있어요' };
    }
    return { ok: false, error: '스토리 삭제 중 오류가 발생했어요' };
  }

  revalidatePath(`/ch/${parsedChannelId.data}`);
  return { ok: true };
}
