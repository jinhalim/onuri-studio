import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// 스토리 페이지 진입 시 호출. bytea 컬럼을 복원해서 JSON 문자열 또는 null 반환.
// Phase 3: tldraw store snapshot. Phase 4: Yjs Y.Doc binary (다른 디코더 사용).

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

  // Supabase JS는 bytea를 Buffer 또는 base64 string 으로 반환할 수 있음.
  // 두 케이스 모두 안전하게 처리.
  const raw = data.y_doc_snapshot as unknown;

  if (typeof raw === 'string') {
    // hex (\x...) 또는 base64
    if (raw.startsWith('\\x')) {
      // hex 디코드
      const hex = raw.slice(2);
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
      }
      return new TextDecoder().decode(bytes);
    }
    // base64로 추정
    try {
      const buf = Buffer.from(raw, 'base64');
      return buf.toString('utf8');
    } catch {
      return null;
    }
  }

  // ArrayBuffer / Uint8Array / Buffer
  if (raw instanceof Uint8Array) {
    return new TextDecoder().decode(raw);
  }
  if (raw && typeof raw === 'object' && 'data' in raw) {
    // Node Buffer 직렬화 형태 { type: 'Buffer', data: number[] }
    const data = (raw as { data: number[] }).data;
    return new TextDecoder().decode(Uint8Array.from(data));
  }

  console.warn('[loadStorySnapshot] 알 수 없는 bytea 형식:', typeof raw);
  return null;
}
