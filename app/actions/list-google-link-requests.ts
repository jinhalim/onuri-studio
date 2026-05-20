'use server';

import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';

// D-021: admin 페이지에서 Google 연동 요청 목록 조회.
//   - admin role 만 허용.
//   - status filter 옵션 (default = pending).
//   - 요청자 닉네임/색상 join.

export interface GoogleLinkRequestRow {
  id: string;
  userId: string;
  userNickname: string;
  userColor: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  processedAt: string | null;
  processedByNickname: string | null;
}

export interface ListGoogleLinkRequestsResult {
  ok: boolean;
  error?: string;
  requests?: GoogleLinkRequestRow[];
}

export async function listGoogleLinkRequestsAction(
  status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending',
): Promise<ListGoogleLinkRequestsResult> {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return { ok: false, error: '권한이 없어요' };
  }

  const admin = createAdminClient();
  let query = admin
    .from('google_link_requests')
    .select(
      `
      id, user_id, email, status, requested_at, processed_at, processed_by,
      requester:users!google_link_requests_user_id_fkey(nickname, color),
      processor:users!google_link_requests_processed_by_fkey(nickname)
    `,
    )
    .order('requested_at', { ascending: false })
    .limit(100);
  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[listGoogleLinkRequestsAction] 실패:', error);
    return { ok: false, error: '목록 조회 실패' };
  }

  const requests: GoogleLinkRequestRow[] = (data ?? []).map((r) => {
    const requester = r.requester as unknown as
      | { nickname: string; color: string }
      | null;
    const processor = r.processor as unknown as { nickname: string } | null;
    return {
      id: r.id as string,
      userId: r.user_id as string,
      userNickname: requester?.nickname ?? '알 수 없음',
      userColor: requester?.color ?? '#9A9AA8',
      email: r.email as string,
      status: r.status as 'pending' | 'approved' | 'rejected',
      requestedAt: r.requested_at as string,
      processedAt: (r.processed_at as string | null) ?? null,
      processedByNickname: processor?.nickname ?? null,
    };
  });

  return { ok: true, requests };
}
