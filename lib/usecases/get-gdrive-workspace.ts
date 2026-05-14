import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import type { GDriveWorkspace } from '@/lib/domain/gdrive';

// D-018 Phase 8b: 사용자의 Drive Workspace 정보 조회.
// 미설정 시 path/folderId 모두 null 반환.

export async function getGdriveWorkspace(userId: string): Promise<GDriveWorkspace | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('gdrive_workspace_path, gdrive_workspace_folder_id')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const path = data.gdrive_workspace_path as string | null;
  const folderId = data.gdrive_workspace_folder_id as string | null;
  if (!path) return null;
  return { path, folderId };
}
