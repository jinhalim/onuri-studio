import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Wordmark } from '@/components/brand/Wordmark';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { StoryCard } from '@/components/channel/StoryCard';
import { CreateStoryButton } from '@/components/channel/CreateStoryButton';
import { ShareButton } from '@/components/share/ShareButton';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { getChannelWithStories } from '@/lib/usecases/get-channel-with-stories';
import { recordParticipation } from '@/lib/usecases/record-participation';
import { urls } from '@/lib/config/urls';

interface ChannelGuidePageProps {
  params: { channelId: string };
}

export default async function ChannelGuidePage({ params }: ChannelGuidePageProps) {
  const channelId = params.channelId;

  const data = await getChannelWithStories(channelId);
  if (!data) notFound();

  const user = await getCurrentUser();
  const canEdit = user?.id === data.channel.ownerId;

  // 참여 기록 (조용히 실패) — 로그인한 사용자에 한해
  if (user) {
    await recordParticipation({
      userId: user.id,
      channelId: data.channel.id,
      storyId: null,
    });
  }

  const shareUrl = urls.channel(data.channel.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Link href="/" className="hover:opacity-80">
          <Wordmark size="sm" />
        </Link>
        {user && <SignedInBanner user={user} compact />}
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-3xl font-bold text-fg">{data.channel.name}</h1>
          <span className="text-sm text-fg-muted">by {data.ownerNickname}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-brand-surface px-2 py-1 text-xs text-fg-muted">
            {data.channel.id}
          </code>
          <ShareButton url={shareUrl} label="채널 URL 공유" />
          {canEdit && (
            <span className="text-xs text-live">● 내 채널 (편집 가능)</span>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm font-semibold text-fg-muted">
          스토리 ({data.stories.length})
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.stories.map((story) => (
            <StoryCard
              key={story.id}
              story={story}
              channelId={data.channel.id}
              canEdit={canEdit}
            />
          ))}
          {canEdit && <CreateStoryButton channelId={data.channel.id} />}
        </div>
        {!canEdit && data.stories.length === 0 && (
          <p className="rounded-md border border-dashed border-divider bg-brand-surface/40 px-4 py-6 text-center text-sm text-fg-muted">
            이 채널에는 아직 스토리가 없어요.
          </p>
        )}
      </section>

      <footer className="mt-auto pt-12 text-xs text-fg-muted/70">
        Phase 2 — Channel Guide / 화이트보드는 Phase 3부터 활성화
      </footer>
    </main>
  );
}
