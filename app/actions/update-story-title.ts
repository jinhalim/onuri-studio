'use server';

import { revalidatePath } from 'next/cache';
import { updateStoryTitle } from '@/lib/usecases/update-story-title';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema, storyTitleSchema } from '@/lib/security/validators';

export interface UpdateTitleResult {
  ok: boolean;
  error?: string;
  title?: string;
}

// StoryTitleInline 컴포넌트가 직접 호출. 인수 시그니처(직접 인수).

export async function updateStoryTitleAction(
  storyId: string,
  title: string,
  channelId?: string,
): Promise<UpdateTitleResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  const parsedId = idSchema.safeParse(storyId);
  if (!parsedId.success) return { ok: false, error: '스토리 ID가 유효하지 않아요' };

  const parsedTitle = storyTitleSchema.safeParse(title);
  if (!parsedTitle.success) {
    return { ok: false, error: parsedTitle.error.issues[0]?.message ?? '제목이 유효하지 않아요' };
  }

  try {
    await updateStoryTitle({
      storyId: parsedId.data,
      title: parsedTitle.data,
      userId: user.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    console.error('[updateStoryTitleAction] 실패:', err);
    if (msg.startsWith('TITLE_FORBIDDEN')) {
      return { ok: false, error: '채널 소유자만 변경 가능' };
    }
    return { ok: false, error: '제목 변경 중 오류가 발생했어요' };
  }

  if (channelId) revalidatePath(`/ch/${channelId}`);
  return { ok: true, title: parsedTitle.data };
}
