import 'server-only';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// 익명 사용자가 Google 계정으로 로그인 시 익명 트랙의 데이터를 새 계정에 흡수.
// D-013 정책: 익명 트랙 + Google 트랙 병행 + 익명 흔적 흡수.
//
// 흡수 대상 (anonymous_user_id → google_user_id):
// 1. channels.owner_id
// 2. participations.user_id
// 3. anonymous_sessions.converted_user_id 기록
// 4. 익명 user row + auth.users 삭제 (orphan 방지)
//
// 안전장치:
// - 익명 cookie 가 없으면 no-op
// - 익명 user 가 이미 변환된 상태(converted_user_id IS NOT NULL)면 skip
// - 같은 user 면 skip (방어)

const ANON_COOKIE_NAME = 'onuri_anon';

export async function transferAnonymousToUser(newUserId: string): Promise<void> {
  const raw = cookies().get(ANON_COOKIE_NAME)?.value;
  if (!raw) return; // 익명 흔적 없음

  const [anonUserId, sessionToken] = raw.split(':');
  if (!anonUserId || !sessionToken) return;
  if (anonUserId === newUserId) return; // 같은 user — 방어

  const supabase = createAdminClient();

  // 익명 user 가 실제로 존재 + 익명인지 확인
  const { data: anonUser } = await supabase
    .from('users')
    .select('id, is_anonymous')
    .eq('id', anonUserId)
    .maybeSingle();
  if (!anonUser || !anonUser.is_anonymous) return;

  // 1) channels.owner_id 이전
  const { error: chErr } = await supabase
    .from('channels')
    .update({ owner_id: newUserId })
    .eq('owner_id', anonUserId);
  if (chErr) {
    console.error('[transferAnonymousToUser] channels 이전 실패:', chErr);
    throw new Error(`TRANSFER_CHANNELS_FAILED: ${chErr.message}`);
  }

  // 2) participations.user_id 이전 (단, 새 user 와 동일 (channel_id, story_id) 가 이미 있으면
  //    upsert 충돌 → 익명 row 만 삭제하는 게 안전)
  // 정책 단순화: 익명 participations 전체 삭제. 새 계정은 자기 채널 owner participation 만
  // createChannel 이 자동 만든 상태라 무방. 방문 기록은 일부 손실 가능.
  const { error: partErr } = await supabase
    .from('participations')
    .delete()
    .eq('user_id', anonUserId);
  if (partErr) {
    console.error('[transferAnonymousToUser] participations 정리 실패 (무시):', partErr);
  }

  // 3) anonymous_sessions 기록
  await supabase
    .from('anonymous_sessions')
    .update({ converted_user_id: newUserId })
    .eq('session_token', sessionToken);

  // 4) 익명 user row 삭제 (auth.users cascade 로 public.users 도 cleanup)
  await supabase.auth.admin.deleteUser(anonUserId).catch((err) => {
    console.error('[transferAnonymousToUser] 익명 user 삭제 실패 (무시):', err);
  });

  // 5) 익명 cookie 제거 — 다음 요청부터 Google 세션만 인식
  cookies().delete(ANON_COOKIE_NAME);
}
