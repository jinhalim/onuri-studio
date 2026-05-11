'use server';

import { revalidatePath } from 'next/cache';
import { importStory } from '@/lib/usecases/import-story';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';

export interface ImportStoryResult {
  ok: boolean;
  error?: string;
  /** 성공 시 새로 생성된 스토리 ID. */
  storyId?: string;
}

const FILE_SIZE_LIMIT = 10 * 1024 * 1024; // 10MB (.onuri.json 한도, CLAUDE.md §7)

export async function importStoryAction(
  channelId: string,
  fileText: string,
): Promise<ImportStoryResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  const parsedId = idSchema.safeParse(channelId);
  if (!parsedId.success) return { ok: false, error: '채널 ID가 유효하지 않아요' };

  if (fileText.length > FILE_SIZE_LIMIT) {
    return {
      ok: false,
      error: `파일이 너무 커요 (${fileText.length} bytes > ${FILE_SIZE_LIMIT})`,
    };
  }

  try {
    const result = await importStory({
      channelId: parsedId.data,
      fileText,
      userId: user.id,
    });
    revalidatePath(`/ch/${parsedId.data}`);
    return { ok: true, storyId: result.story.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    console.error('[importStoryAction] 실패:', err);
    if (msg.startsWith('IMPORT_FORBIDDEN')) {
      return { ok: false, error: '채널 소유자만 가져오기 가능해요' };
    }
    if (msg.startsWith('IMPORT_INVALID_JSON')) {
      return { ok: false, error: '유효한 JSON 파일이 아니에요' };
    }
    if (msg.startsWith('IMPORT_INVALID_SCHEMA')) {
      return { ok: false, error: '.onuri.json 형식이 아니에요' };
    }
    if (msg.startsWith('IMPORT_INVALID_SNAPSHOT')) {
      return { ok: false, error: '스토리 데이터가 손상되었어요' };
    }
    return { ok: false, error: '가져오기 중 오류가 발생했어요' };
  }
}
