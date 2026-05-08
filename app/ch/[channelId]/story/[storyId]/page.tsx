import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { StudioCanvas } from '@/components/canvas/StudioCanvas';
import { StoryTitleInline } from '@/components/story/StoryTitleInline';
import { ShareButton } from '@/components/share/ShareButton';
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
    <main className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-divider bg-brand-bezel px-6 py-3">
        <div className="flex flex-col gap-1">
          <Link
            href={`/ch/${channelId}`}
            className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            <ArrowLeft size={12} />
            <span>{channelData.channel.name}</span>
          </Link>
          <StoryTitleInline
            storyId={story.id}
            initialTitle={story.title}
            channelId={channelId}
            canEdit={canEdit}
          />
        </div>
        <div className="flex items-center gap-3">
          <ShareButton url={shareUrl} label="스토리 URL 공유" />
          {user && <SignedInBanner user={user} compact />}
        </div>
      </header>

      <section className="flex-1 overflow-hidden">
        <StudioCanvas
          storyId={story.id}
          initialSnapshotJson={initialSnapshotJson}
          canEdit={canEdit}
          user={user}
        />
      </section>
    </main>
  );
}
