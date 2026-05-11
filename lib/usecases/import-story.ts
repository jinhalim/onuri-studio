import 'server-only';
import { createStory } from './create-story';
import { saveStorySnapshot } from './save-story-snapshot';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { onuriFileSchema, type OnuriFile } from '@/lib/domain/onuri-file';
import type { Story } from '@/lib/domain/story';

export interface ImportStoryInput {
  channelId: string;
  /** 클라이언트가 읽은 .onuri.json 파싱 전 raw 문자열. */
  fileText: string;
  /** 권한 검증용 — 채널 소유자만. */
  userId: string;
  /** 임포트된 스토리의 새 제목. 기본은 OnuriFile 의 story.title + " (가져옴)" 접미. */
  titleOverride?: string;
}

export interface ImportStoryResult {
  story: Story;
  importedFrom?: string;
}

// .onuri.json 을 새 스토리로 가져오기 (병합은 후속 작업).
// 1) JSON 파싱 + zod 스키마 검증
// 2) base64 → UTF-8 → 유효한 JSON 인지 sanity check
// 3) 채널 소유자 확인
// 4) createStory 로 새 row 생성
// 5) saveStorySnapshot 으로 데이터 주입

export async function importStory(input: ImportStoryInput): Promise<ImportStoryResult> {
  // 1) 파싱
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.fileText);
  } catch (err) {
    throw new Error(
      `IMPORT_INVALID_JSON: 파일이 유효한 JSON 이 아니에요 (${(err as Error).message})`,
    );
  }

  // 2) 스키마 검증
  const validation = onuriFileSchema.safeParse(parsed);
  if (!validation.success) {
    throw new Error(
      `IMPORT_INVALID_SCHEMA: ${validation.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ')}`,
    );
  }
  const file = validation.data as OnuriFile;

  // 3) base64 → JSON sanity (snapshot 내용이 진짜 tldraw snapshot 인지 까지는 검증 X)
  let snapshotJson: string;
  try {
    snapshotJson = base64ToUtf8(file.story.yDocBase64);
    JSON.parse(snapshotJson); // 적어도 valid JSON 인지 확인
  } catch (err) {
    throw new Error(
      `IMPORT_INVALID_SNAPSHOT: snapshot 디코딩/파싱 실패 (${(err as Error).message})`,
    );
  }

  // 4) 권한 확인 (채널 소유자만 가져오기 가능)
  const supabase = createAdminClient();
  const { data: channel, error: chErr } = await supabase
    .from('channels')
    .select('id, owner_id')
    .eq('id', input.channelId)
    .maybeSingle();
  if (chErr) throw new Error(`IMPORT_CHANNEL_FETCH_FAILED: ${chErr.message}`);
  if (!channel) throw new Error('IMPORT_CHANNEL_NOT_FOUND');
  if (channel.owner_id !== input.userId) {
    throw new Error('IMPORT_FORBIDDEN: 채널 소유자만 가져오기 가능');
  }

  // 5) 새 스토리 생성 (제목은 override 또는 파일 제목 + " (가져옴)")
  const title = input.titleOverride ?? `${file.story.title} (가져옴)`;
  const newStory = await createStory({ channelId: input.channelId, title });

  // 6) snapshot 주입
  try {
    await saveStorySnapshot({
      storyId: newStory.id,
      snapshotJson,
      userId: input.userId,
    });
  } catch (err) {
    // snapshot 주입 실패 시 빈 스토리만 남음. 사용자에게 알려서 수동 정리하게.
    console.error('[importStory] snapshot 주입 실패 — 빈 스토리 남음:', err);
    throw new Error(
      `IMPORT_SAVE_FAILED: 스토리는 생성됐지만 snapshot 주입 실패 (${(err as Error).message})`,
    );
  }

  return { story: newStory, importedFrom: file.meta.exportedBy.nickname };
}

function base64ToUtf8(b64: string): string {
  const binary = Buffer.from(b64, 'base64');
  return binary.toString('utf-8');
}
