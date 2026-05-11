'use server';

import { revalidatePath } from 'next/cache';
import { saveStorySnapshot } from '@/lib/usecases/save-story-snapshot';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';

export interface SaveSnapshotResult {
  ok: boolean;
  error?: string;
  savedAt?: string;
}

// 클라이언트가 5초 debounce 로 호출하는 자동 저장 액션.
// useFormState 가 아닌 직접 호출용 (입력은 string 인수 그대로).

export async function saveStorySnapshotAction(
  storyId: string,
  snapshotJson: string,
): Promise<SaveSnapshotResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  const parsedId = idSchema.safeParse(storyId);
  if (!parsedId.success) return { ok: false, error: '스토리 ID가 유효하지 않아요' };

  // 페이로드 크기 제한 (1MB) — 무료 티어 보호
  const SIZE_LIMIT = 1024 * 1024;
  if (snapshotJson.length > SIZE_LIMIT) {
    return { ok: false, error: `스냅샷이 너무 커요 (${snapshotJson.length} bytes > ${SIZE_LIMIT})` };
  }

  let channelId: string;
  try {
    const result = await saveStorySnapshot({
      storyId: parsedId.data,
      snapshotJson,
      userId: user.id,
    });
    channelId = result.channelId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    console.error('[saveStorySnapshotAction] 실패:', err);
    if (msg.startsWith('SNAPSHOT_FORBIDDEN')) {
      return { ok: false, error: '채널 소유자만 저장 가능' };
    }
    return { ok: false, error: '저장 중 오류가 발생했어요' };
  }

  // 채널 페이지의 "마지막 수정" 표시가 최신 snapshot_updated_at 을 반영하도록
  // Router Cache + Full Route Cache 무효화. revalidatePath 는 next.js 14+ 에서
  // 양쪽 캐시 모두 invalidate.
  revalidatePath(`/ch/${channelId}`);

  return { ok: true, savedAt: new Date().toISOString() };
}
