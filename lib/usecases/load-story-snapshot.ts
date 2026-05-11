import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// 스토리 페이지 진입 시 호출. text 컬럼에 저장된 JSON 문자열을 그대로 반환.
// Phase 3: tldraw editor snapshot.
// Phase 4 (D-010 후속): Yjs Y.Doc binary 도입 시 별도 컬럼 + 디코더 추가.

export async function loadStorySnapshot(storyId: string): Promise<string | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('stories')
    .select('y_doc_snapshot')
    .eq('id', storyId)
    .maybeSingle();

  if (error) {
    console.error('[loadStorySnapshot] 실패:', error);
    return null;
  }
  if (!data?.y_doc_snapshot) return null;

  // 0006 마이그레이션 이후 컬럼은 text. 그대로 반환.
  if (typeof data.y_doc_snapshot === 'string') return data.y_doc_snapshot;

  console.warn('[loadStorySnapshot] 예상 못 한 컬럼 타입:', typeof data.y_doc_snapshot);
  return null;
}
