import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

export interface SaveStorySnapshotInput {
  storyId: string;
  /** tldraw store.getSnapshot() 결과를 JSON.stringify 한 문자열. */
  snapshotJson: string;
  /** 권한 검증용. 채널 소유자만 저장 가능. */
  userId: string;
}

// Phase 3: tldraw 네이티브 snapshot(JSON)을 bytea 컬럼에 그대로 저장.
// Phase 4: Yjs Y.Doc 바이너리로 교체 예정. 동일한 y_doc_snapshot 컬럼 재사용.
//
// 저장 빈도는 클라이언트(StudioCanvas)가 5초 debounce 로 통제.

export async function saveStorySnapshot(input: SaveStorySnapshotInput): Promise<void> {
  const supabase = createAdminClient();

  // 권한 검증: 채널 소유자만
  const { data: story, error: getError } = await supabase
    .from('stories')
    .select('id, channels!inner(owner_id)')
    .eq('id', input.storyId)
    .maybeSingle();

  if (getError) {
    console.error('[saveStorySnapshot] story 조회 실패:', getError);
    throw new Error(`SNAPSHOT_FETCH_FAILED: ${getError.message}`);
  }
  if (!story) throw new Error('SNAPSHOT_STORY_NOT_FOUND');
  const ownerId = (story.channels as unknown as { owner_id: string }).owner_id;
  if (ownerId !== input.userId) {
    throw new Error('SNAPSHOT_FORBIDDEN: 채널 소유자만 저장 가능');
  }

  // JSON 문자열을 바이트로 변환 (UTF-8). Supabase 클라이언트가 bytea 변환 처리.
  const bytes = new TextEncoder().encode(input.snapshotJson);

  const { error } = await supabase
    .from('stories')
    .update({ y_doc_snapshot: bytes })
    .eq('id', input.storyId);

  if (error) {
    console.error('[saveStorySnapshot] update 실패:', error);
    throw new Error(`SNAPSHOT_SAVE_FAILED: ${error.message}`);
  }
}
