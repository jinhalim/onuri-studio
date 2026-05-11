'use server';

import { loadStorySnapshot } from '@/lib/usecases/load-story-snapshot';
import { idSchema } from '@/lib/security/validators';

export interface LoadSnapshotResult {
  ok: boolean;
  /** y_doc_snapshot text (tldraw editor snapshot JSON 문자열). 한번도 저장 안 됐으면 null. */
  snapshotJson?: string | null;
  error?: string;
}

// 재연결(B6) 시 클라이언트에서 호출. CLOSED 사이에 다른 사용자가 보낸
// broadcast 를 놓쳤을 수 있으므로 서버의 최신 snapshot 으로 editor 를 다시 채움.
// 인증 체크는 안 함 — 페이지 접근 권한이 이미 있는 사용자가 호출하기 때문.

export async function loadStorySnapshotAction(
  storyId: string,
): Promise<LoadSnapshotResult> {
  const parsedId = idSchema.safeParse(storyId);
  if (!parsedId.success) return { ok: false, error: '스토리 ID가 유효하지 않아요' };

  try {
    const snapshotJson = await loadStorySnapshot(parsedId.data);
    return { ok: true, snapshotJson };
  } catch (err) {
    console.error('[loadStorySnapshotAction] 실패:', err);
    return { ok: false, error: '스냅샷 로드 중 오류가 발생했어요' };
  }
}
