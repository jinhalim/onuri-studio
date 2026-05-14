import { notFound } from 'next/navigation';
import { StoryWorkspace } from '@/components/story/StoryWorkspace';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { getChannelWithStories } from '@/lib/usecases/get-channel-with-stories';
import { loadStorySnapshot } from '@/lib/usecases/load-story-snapshot';
import { recordParticipation } from '@/lib/usecases/record-participation';
import { hasStoryEditPermission } from '@/lib/usecases/has-story-edit-permission';
import { getGdriveWorkspace } from '@/lib/usecases/get-gdrive-workspace';
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

  // D-015: owner 또는 story_permissions.editor 부여받은 사용자도 편집 가능.
  // owner 체크가 미스되면 추가로 권한 row 조회 (대부분의 경우 두 번째 쿼리 발생 안 함).
  const isOwner = user?.id === channelData.channel.ownerId;
  const hasEditorPermission =
    !isOwner && user ? await hasStoryEditPermission({ storyId: story.id, userId: user.id }) : false;
  const canEdit = isOwner || hasEditorPermission;

  // D-018: Drive Workspace — Google 사용자만. GDriveAttachButton 으로 전달.
  const gdriveWorkspace =
    user && !user.isAnonymous ? await getGdriveWorkspace(user.id) : null;

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
      gdriveWorkspace={gdriveWorkspace}
    />
  );
}
