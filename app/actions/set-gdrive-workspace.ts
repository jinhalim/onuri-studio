'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { isValidWorkspacePath } from '@/lib/domain/gdrive';

// D-018 Phase 8b: Workspace path + folder ID 설정.
// - Google 연동 사용자만 호출 허용 (익명/비-Google 차단)
// - Drive API 호출 자체는 client-side 에서 수행 (session.provider_token 사용).
//   client 가 폴더 생성/조회 후 그 결과 folderId 를 본 액션에 넘김.
// - path 만 변경하고 folderId 는 null 로 두면 "재검증 필요" 상태.

export interface SetWorkspaceResult {
  ok: boolean;
  error?: string;
}

const inputSchema = z.object({
  path: z.string().min(1).max(200),
  folderId: z.string().min(1).max(100).nullable(),
});

export async function setGdriveWorkspaceAction(input: {
  path: string;
  folderId: string | null;
}): Promise<SetWorkspaceResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };
  if (user.isAnonymous) {
    return { ok: false, error: 'Drive 연동은 Google 계정 사용자만 가능합니다' };
  }

  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력 오류' };
  if (!isValidWorkspacePath(parsed.data.path)) {
    return { ok: false, error: '경로 형식이 올바르지 않아요 (예: /onuri-studio)' };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('users')
    .update({
      gdrive_workspace_path: parsed.data.path,
      gdrive_workspace_folder_id: parsed.data.folderId,
    })
    .eq('id', user.id);
  if (error) {
    console.error('[setGdriveWorkspaceAction] 실패:', error);
    return { ok: false, error: 'Workspace 저장 실패' };
  }

  revalidatePath('/me');
  return { ok: true };
}
