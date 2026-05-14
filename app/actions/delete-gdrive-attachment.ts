'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';

// D-018 Phase 8b: Drive 첨부 DB row 삭제 + shortcut_file_id 반환 (client 가 Drive API 로 정리).
// onDelete hook 에서 호출. story 접근 권한자만 (RLS 우회용 검증 server-side).

export interface DeleteAttachmentResult {
  ok: boolean;
  error?: string;
  /** client 가 Drive API 로 삭제할 shortcut ID. ok=true 시 항상 있음. */
  shortcutFileId?: string;
}

const inputSchema = z.object({
  storyId: idSchema,
  gdriveFileId: z.string().min(1).max(100),
});

export async function deleteGdriveAttachmentAction(input: {
  storyId: string;
  gdriveFileId: string;
}): Promise<DeleteAttachmentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };
  if (user.isAnonymous) {
    return { ok: false, error: '익명 사용자는 Drive 첨부를 삭제할 수 없어요' };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력 오류' };

  const admin = createAdminClient();

  // 본인이 첨부한 파일 또는 본인이 owner 인 스토리만 삭제 허용.
  // RLS 외 추가 방어선.
  const { data: row } = await admin
    .from('gdrive_attachments')
    .select('id, shortcut_file_id, attached_by, stories!inner(channels!inner(owner_id))')
    .eq('story_id', parsed.data.storyId)
    .eq('gdrive_file_id', parsed.data.gdriveFileId)
    .maybeSingle();

  if (!row) {
    // 이미 삭제된 경우 — graceful
    return { ok: true };
  }

  const ownerId = (row.stories as unknown as { channels: { owner_id: string } }).channels.owner_id;
  const canDelete = row.attached_by === user.id || ownerId === user.id;
  if (!canDelete) {
    return { ok: false, error: '본인 첨부 또는 스토리 owner 만 삭제 가능' };
  }

  const { error: delErr } = await admin
    .from('gdrive_attachments')
    .delete()
    .eq('id', row.id);
  if (delErr) {
    console.error('[deleteGdriveAttachmentAction] DB 삭제 실패:', delErr);
    return { ok: false, error: 'DB 삭제 실패' };
  }

  revalidatePath(`/ch/`);
  return { ok: true, shortcutFileId: row.shortcut_file_id as string };
}
