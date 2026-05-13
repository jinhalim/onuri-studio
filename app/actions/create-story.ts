'use server';

import { revalidatePath } from 'next/cache';
import { createStory } from '@/lib/usecases/create-story';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { getChannelWithStories } from '@/lib/usecases/get-channel-with-stories';
import { idSchema, storyTitleSchema } from '@/lib/security/validators';
import { checkRateLimit } from '@/lib/usecases/check-rate-limit';

export interface CreateStoryState {
  ok: boolean;
  error?: string;
}

export async function createStoryAction(
  _prevState: CreateStoryState,
  formData: FormData,
): Promise<CreateStoryState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '먼저 닉네임으로 입장해주세요' };

  // Rate limit: 스토리 생성 20회/분/사용자 (CLAUDE.md §7).
  const rl = await checkRateLimit({
    key: `story:create:${user.id}`,
    maxPerWindow: 20,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `스토리 생성 요청이 너무 잦아요. ${rl.retryAfterSec}초 후 다시 시도해주세요.`,
    };
  }

  const channelIdRaw = formData.get('channelId');
  const titleRaw = formData.get('title');

  const parsedChannelId = idSchema.safeParse(channelIdRaw);
  if (!parsedChannelId.success) {
    return { ok: false, error: '채널 ID가 유효하지 않아요' };
  }

  // title은 빈 값이면 자동 부여, 값이 있으면 검증
  let title: string | undefined;
  if (typeof titleRaw === 'string' && titleRaw.trim().length > 0) {
    const parsed = storyTitleSchema.safeParse(titleRaw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '스토리 제목이 유효하지 않아요' };
    }
    title = parsed.data;
  }

  // 채널 소유자 검증
  const channelData = await getChannelWithStories(parsedChannelId.data);
  if (!channelData) return { ok: false, error: '채널을 찾을 수 없어요' };
  if (channelData.channel.ownerId !== user.id) {
    return { ok: false, error: '채널 소유자만 스토리를 만들 수 있어요' };
  }

  try {
    await createStory({ channelId: parsedChannelId.data, title });
  } catch (err) {
    console.error('[createStoryAction] 실패:', err);
    return { ok: false, error: '스토리 생성 중 오류가 발생했어요' };
  }

  revalidatePath(`/ch/${parsedChannelId.data}`);
  return { ok: true };
}
