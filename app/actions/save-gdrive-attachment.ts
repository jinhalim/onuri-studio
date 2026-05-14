'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';
import { checkRateLimit } from '@/lib/usecases/check-rate-limit';

// D-018 Phase 8b: 클라이언트에서 Picker + 폴더 + Shortcut 생성 완료 후,
// 최종 메타데이터를 DB 에 저장. server-side 는 검증 + persistence + folder_id 업데이트만.

export interface SaveAttachmentInput {
  storyId: string;
  channelId: string;
  /** client 가 만든 / 받은 Drive 폴더 ID. 처음이면 null 일 수도 있음 (업데이트용 X). */
  storyFolderId: string;
  channelFolderId: string;
  workspaceFolderId: string;
  /** 원본 파일 ID (사용자 Drive 의 원래 자리). */
  gdriveFileId: string;
  /** 우리 스토리 폴더 안 shortcut 의 file ID. */
  shortcutFileId: string;
  fileName: string;
  mimeType: string;
}

export interface SaveAttachmentResult {
  ok: boolean;
  error?: string;
  /** DB row id. */
  attachmentId?: string;
}

const inputSchema = z.object({
  storyId: idSchema,
  channelId: idSchema,
  storyFolderId: z.string().min(1).max(100),
  channelFolderId: z.string().min(1).max(100),
  workspaceFolderId: z.string().min(1).max(100),
  gdriveFileId: z.string().min(1).max(100),
  shortcutFileId: z.string().min(1).max(100),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
});

export async function saveGdriveAttachmentAction(
  input: SaveAttachmentInput,
): Promise<SaveAttachmentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };
  if (user.isAnonymous) {
    return { ok: false, error: 'Drive 첨부는 Google 계정 사용자만 가능합니다' };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력 오류' };
  const data = parsed.data;

  // Rate limit: 첨부 10회/분/사용자 (spam 방지).
  const rl = await checkRateLimit({
    key: `gdrive-attach:${user.id}`,
    maxPerWindow: 10,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return { ok: false, error: `요청이 너무 잦아요. ${rl.retryAfterSec}초 후 다시 시도해주세요.` };
  }

  const admin = createAdminClient();

  // 폴더 ID 들을 DB 에 반영 (idempotent — 같은 값이면 no-op):
  // 1) users.gdrive_workspace_folder_id
  // 2) channels.gdrive_folder_id
  // 3) stories.gdrive_folder_id
  await admin
    .from('users')
    .update({ gdrive_workspace_folder_id: data.workspaceFolderId })
    .eq('id', user.id);

  await admin
    .from('channels')
    .update({ gdrive_folder_id: data.channelFolderId })
    .eq('id', data.channelId);

  await admin
    .from('stories')
    .update({ gdrive_folder_id: data.storyFolderId })
    .eq('id', data.storyId);

  // gdrive_attachments row 생성 (unique constraint: story_id + gdrive_file_id).
  // 같은 파일을 두 번 첨부하려 하면 conflict → 안내.
  const { data: row, error } = await admin
    .from('gdrive_attachments')
    .insert({
      story_id: data.storyId,
      gdrive_file_id: data.gdriveFileId,
      shortcut_file_id: data.shortcutFileId,
      file_name: data.fileName,
      mime_type: data.mimeType,
      attached_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: '이미 첨부된 파일입니다' };
    }
    console.error('[saveGdriveAttachmentAction] insert 실패:', error);
    return { ok: false, error: '첨부 저장 실패' };
  }

  revalidatePath(`/ch/${data.channelId}/story/${data.storyId}`);
  return { ok: true, attachmentId: row?.id };
}
