'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';

// D-018 Phase 8b: 클라이언트가 ensureFolder 로 만든 Drive 폴더 ID 들을 DB 에 캐싱.
// saveGdriveAttachment 와 분리한 이유: "Drive 폴더 열기" 같은 흐름에선 attachment 가
// 아직 없어도 folder ID 만 먼저 저장해두면 다음 호출이 빨라짐.
//
// 호출 측 (client): 폴더 ensure 직후 fire-and-forget 으로 호출.

export interface SaveFoldersInput {
  storyId: string;
  channelId: string;
  workspaceFolderId: string;
  channelFolderId: string;
  storyFolderId: string;
}

export interface SaveFoldersResult {
  ok: boolean;
  error?: string;
}

const inputSchema = z.object({
  storyId: idSchema,
  channelId: idSchema,
  workspaceFolderId: z.string().min(1).max(100),
  channelFolderId: z.string().min(1).max(100),
  storyFolderId: z.string().min(1).max(100),
});

export async function saveGdriveFoldersAction(
  input: SaveFoldersInput,
): Promise<SaveFoldersResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };
  if (user.isAnonymous) {
    return { ok: false, error: '익명 사용자는 Drive 연동 사용 불가' };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력 오류' };
  const data = parsed.data;

  const admin = createAdminClient();

  // 본인 소유 채널인지 검증 (RLS 외 방어선)
  const { data: channel } = await admin
    .from('channels')
    .select('owner_id')
    .eq('id', data.channelId)
    .maybeSingle();
  if (!channel || channel.owner_id !== user.id) {
    return { ok: false, error: '본인 소유 채널만 Drive 폴더 등록 가능' };
  }

  // 3개 업데이트 — 변경 없으면 no-op
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

  revalidatePath(`/ch/${data.channelId}/story/${data.storyId}`);
  return { ok: true };
}
