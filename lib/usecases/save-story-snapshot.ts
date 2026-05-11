import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

export interface SaveStorySnapshotInput {
  storyId: string;
  /** tldraw editor.getSnapshot() 결과를 JSON.stringify 한 문자열. */
  snapshotJson: string;
  /** 권한 검증용. 채널 소유자만 저장 가능. */
  userId: string;
}

// Phase 3: tldraw 네이티브 snapshot(JSON)을 text 컬럼에 그대로 저장.
// Phase 4 (D-010 후속): Yjs Y.Doc 바이너리 도입 시 별도 binary 컬럼 추가 예정.
//
// 저장 빈도는 클라이언트(StudioCanvas)가 1.5초 debounce + 페이지 이탈 시 flush.

export interface SaveStorySnapshotResult {
  /** 채널 페이지 revalidate 용. */
  channelId: string;
}

export async function saveStorySnapshot(
  input: SaveStorySnapshotInput,
): Promise<SaveStorySnapshotResult> {
  const supabase = createAdminClient();

  // 권한 검증: 채널 소유자만
  const { data: story, error: getError } = await supabase
    .from('stories')
    .select('id, channel_id, channels!inner(owner_id)')
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

  // JSON 문자열을 text 컬럼에 그대로 저장. (이전: bytea + Uint8Array 보내면
  // Supabase JS REST API 가 {0:b0,1:b1,...} 객체로 직렬화돼서 round-trip 깨짐.)
  // snapshot_updated_at: 채널 카드의 "마지막 수정" 갱신 + 헤더의 마지막 저장 라벨 용.
  const savedAt = new Date().toISOString();
  const { error } = await supabase
    .from('stories')
    .update({ y_doc_snapshot: input.snapshotJson, snapshot_updated_at: savedAt })
    .eq('id', input.storyId);

  if (error) {
    console.error('[saveStorySnapshot] update 실패:', error);
    throw new Error(`SNAPSHOT_SAVE_FAILED: ${error.message}`);
  }

  return { channelId: story.channel_id as string };
}
