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

  const channelData = await getChannelWithStories(channelId);
  if (!channelData) notFound();
  const story = channelData.stories.find((s) => s.id === storyId);
  if (!story) notFound();

  const user = await getCurrentUser();
  const canEdit = user?.id === channelData.channel.ownerId;

  if (user) {
    await recordParticipation({
      userId: user.id,
      channelId: channelData.channel.id,
      storyId: story.id,
    });
  }

  const initialSnapshotJson = await loadStorySnapshot(story.id);
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
