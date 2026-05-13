import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Wordmark } from '@/components/brand/Wordmark';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { ChannelStoriesSection } from '@/components/channel/ChannelStoriesSection';
import { ShareButton } from '@/components/share/ShareButton';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { FavoriteToggle } from '@/components/shared/FavoriteToggle';
import { NotificationBell } from '@/components/notification/NotificationBell';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { getChannelWithStories } from '@/lib/usecases/get-channel-with-stories';
import { recordParticipation } from '@/lib/usecases/record-participation';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { urls } from '@/lib/config/urls';

interface ChannelGuidePageProps {
  params: { channelId: string };
}

export default async function ChannelGuidePage({ params }: ChannelGuidePageProps) {
  const channelId = params.channelId;

  // 독립 fetch 병렬화
  const [data, user] = await Promise.all([
    getChannelWithStories(channelId),
    getCurrentUser(),
  ]);
  if (!data) notFound();

  const canEdit = user?.id === data.channel.ownerId;

  // 참여 기록은 UI 에 직접 영향 없음 → fire-and-forget
  if (user) {
    void recordParticipation({
      userId: user.id,
      channelId: data.channel.id,
      storyId: null,
    }).catch((err) => console.error('[ChannelGuidePage] recordParticipation 실패:', err));
  }

  // 즐겨찾기 상태 조회 (로그인 사용자만)
  let isFavorite = false;
  if (user) {
    const admin = createAdminClient();
    const { data: part } = await admin
      .from('participations')
      .select('is_favorite')
      .eq('user_id', user.id)
      .eq('channel_id', data.channel.id)
      .is('story_id', null)
      .maybeSingle();
    isFavorite = part?.is_favorite ?? false;
  }

  const shareUrl = urls.channel(data.channel.id);

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-12"
      style={{
        paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Link href="/" className="hover:opacity-80">
          <Wordmark size="sm" />
        </Link>
        <div className="flex items-center gap-3">
          <NotificationBell userId={user?.id ?? null} />
          {user && <SignedInBanner user={user} compact />}
          <ThemeToggle />
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-fg">{data.channel.name}</h1>
          <span className="text-sm text-fg-muted">by {data.ownerNickname}</span>
          {user && (
            <FavoriteToggle channelId={data.channel.id} initial={isFavorite} size="md" />
          )}
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

      <ChannelStoriesSection
        stories={data.stories}
        channelId={data.channel.id}
        canEdit={canEdit}
        user={user}
      />

    </main>
  );
}
