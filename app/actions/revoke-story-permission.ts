'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';

// D-015 권한 해제 — owner 가 스토리에서 부여한 editor 권한 회수.
// 검증: 본인이 정말 그 스토리의 owner 인지 확인 (RLS 외 방어선).
//
// 해제 직후 사용자는 즉시 read-only 가 되지만, 그 사용자의 활성 세션은
// client-side canEdit 가 stale → 다음 save 시 server 가 SNAPSHOT_FORBIDDEN
// 반환. 사용자한테 별도 알림은 없음 (필요해지면 D-019 등으로 추가).

export interface RevokeResult {
  ok: boolean;
  error?: string;
}

const inputSchema = z.object({
  permissionId: z.string().uuid('권한 ID 형식이 잘못됐어요'),
});

export async function revokeStoryPermissionAction(
  permissionId: string,
): Promise<RevokeResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  const parsed = inputSchema.safeParse({ permissionId });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  // permission row + 스토리 → 채널 owner 검증
  const { data: perm } = await admin
    .from('story_permissions')
    .select('id, story_id, stories!inner(channel_id, channels!inner(owner_id))')
    .eq('id', parsed.data.permissionId)
    .maybeSingle();
  if (!perm) return { ok: false, error: '권한을 찾을 수 없어요' };

  const ownerId = (
    perm.stories as unknown as { channels: { owner_id: string } }
  ).channels.owner_id;
  if (ownerId !== user.id) {
    return { ok: false, error: '권한이 없어요 (해당 스토리 owner 만 해제 가능)' };
  }

  const { error: delErr } = await admin
    .from('story_permissions')
    .delete()
    .eq('id', parsed.data.permissionId);
  if (delErr) {
    console.error('[revokeStoryPermissionAction] 삭제 실패:', delErr);
    return { ok: false, error: '권한 해제 실패' };
  }

  revalidatePath('/me');
  return { ok: true };
}
