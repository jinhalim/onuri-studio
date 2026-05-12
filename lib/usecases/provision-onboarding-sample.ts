import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { createChannel } from './create-channel';
import { createStory } from './create-story';

// 신규 사용자에게 환영 샘플 채널/스토리 자동 생성.
// 정책 (사용자 결정):
// - users.onboarded_at IS NULL 인 경우만 1회 실행
// - 빈 보드 + 사용법 overlay 가 stove 페이지에서 표시되므로 snapshot 은 만들지 않음
// - 실패해도 sign-in 자체는 막지 않음 (호출자가 try/catch)

const SAMPLE_CHANNEL_NAME = '채널 메뉴얼';
const SAMPLE_STORY_TITLE = '스토리 화이트보드 사용법';

export async function provisionOnboardingSample(userId: string): Promise<void> {
  const supabase = createAdminClient();

  // 이미 onboarding 완료한 사용자는 skip
  const { data: user } = await supabase
    .from('users')
    .select('onboarded_at')
    .eq('id', userId)
    .maybeSingle();
  if (user?.onboarded_at) {
    return; // already onboarded
  }

  // 1) 샘플 채널 생성
  const channel = await createChannel({
    name: SAMPLE_CHANNEL_NAME,
    ownerId: userId,
  });

  // 2) 샘플 스토리 생성 (빈 보드 — 사용법 overlay 는 클라이언트가 처리)
  await createStory({
    channelId: channel.id,
    title: SAMPLE_STORY_TITLE,
  });

  // 3) onboarded_at 기록 → 재실행 차단
  const { error } = await supabase
    .from('users')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    // 핵심 데이터는 이미 생성됐으므로 throw 하지 않음. 로그만.
    console.error('[provisionOnboardingSample] onboarded_at 기록 실패:', error);
  }
}
