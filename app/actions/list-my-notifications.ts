'use server';

import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { mapNotificationRow, type Notification } from '@/lib/domain/notification';

// D-015: 내 알림 목록 초기 fetch (최근 50개).
// 익명 사용자는 Supabase 세션이 없어서 RLS-protected 직접 SELECT 가 안 되므로
// 서버 액션 + admin client 로 우회 (본인 user_id 필터링은 server 에서 강제).

const LIMIT = 50;

export interface ListNotificationsResult {
  ok: boolean;
  notifications: Notification[];
  error?: string;
}

export async function listMyNotificationsAction(): Promise<ListNotificationsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, notifications: [], error: '로그인이 필요해요' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('notifications')
    .select('id, recipient_user_id, type, payload, read_at, created_at')
    .eq('recipient_user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) {
    console.error('[listMyNotificationsAction] 실패:', error);
    return { ok: false, notifications: [], error: '알림 조회 실패' };
  }
  const list = (data ?? [])
    .map(mapNotificationRow)
    .filter((n): n is Notification => n !== null);
  return { ok: true, notifications: list };
}
