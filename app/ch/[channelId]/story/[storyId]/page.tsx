import { notFound } from 'next/navigation';
import { StoryWorkspace } from '@/components/story/StoryWorkspace';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { getChannelWithStories } from '@/lib/usecases/get-channel-with-stories';
import { loadStorySnapshot } from '@/lib/usecases/load-story-snapshot';
import { recordParticipation } from '@/lib/usecases/record-participation';
import { urls } from '@/lib/config/urls';

interface StoryPageProps {
  params: { channelId: string; storyId: string };
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { channelId, storyId } = params;

  // 페이지 진입 latency 단축: 독립적인 fetch 들을 병렬 실행.
  // 이전: 순차 ~400ms (channel → user → snapshot). 현재: 가장 느린 단일 쿼리만큼.
  const [channelData, user, initialSnapshotJson] = await Promise.all([
    getChannelWithStories(channelId),
    getCurrentUser(),
    loadStorySnapshot(storyId),
  ]);

  if (!channelData) notFound();
  const story = channelData.stories.find((s) => s.id === storyId);
  if (!story) notFound();

  const canEdit = user?.id === channelData.channel.ownerId;

  // 참여 기록은 페이지 렌더와 무관 (UI 에 안 보임) → fire-and-forget 으로 진입 차단 X.
  // 에러는 콘솔에만 남기고 페이지는 정상 렌더.
  if (user) {
    void recordParticipation({
      userId: user.id,
      channelId: channelData.channel.id,
      storyId: story.id,
    }).catch((err) => console.error('[StoryPage] recordParticipation 실패:', err));
  }

  const shareUrl = urls.story(channelId, storyId);

  return (
    <StoryWorkspace
      channel={channelData.channel}
      story={story}
      user={user}
      canEdit={canEdit}
      initialSnapshotJson={initialSnapshotJson}
      shareUrl={shareUrl}
    />
  );
}
