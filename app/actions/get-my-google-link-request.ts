'use server';

import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';

// D-021: 본인의 최신 Google 연동 요청 상태 조회 — /me 페이지 진입 시 한 번 호출.
//   - 요청 이력 없음 → null
//   - pending: admin 처리 대기 → 상태 표시
//   - approved: admin 처리 완료 → Google 연동 버튼 노출
//   - rejected: 거부됨 → 재요청 가능 + 사유 표시

export type GoogleLinkRequestStatus = 'pending' | 'approved' | 'rejected';

export interface MyGoogleLinkRequest {
  id: string;
  email: string;
  status: GoogleLinkRequestStatus;
  requestedAt: string;
  processedAt: string | null;
}

export async function getMyGoogleLinkRequestAction(): Promise<MyGoogleLinkRequest | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('google_link_requests')
    .select('id, email, status, requested_at, processed_at')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email,
    status: data.status,
    requestedAt: data.requested_at,
    processedAt: data.processed_at,
  };
}
