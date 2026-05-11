'use client';

import type { Story } from '@/lib/domain/story';
import type { User } from '@/lib/domain/user';
import { useChannelPresence } from '@/lib/hooks/useChannelPresence';
import { StoryCard } from './StoryCard';
import { CreateStoryButton } from './CreateStoryButton';

interface ChannelStoriesSectionProps {
  stories: Story[];
  channelId: string;
  canEdit: boolean;
  /** 현재 사용자 — channel presence 트래킹용. null 이면 read-only 방문자. */
  user: User | null;
}

// Channel Guide 페이지의 스토리 그리드 + 라이브 상태 표시.
// channel-level presence 채널을 구독해서 각 StoryCard 에 livePresences 전달.

export function ChannelStoriesSection({
  stories,
  channelId,
  canEdit,
  user,
}: ChannelStoriesSectionProps) {
  // 본인은 Channel Guide 페이지에 있음 → currentStoryId: null
  const { presences } = useChannelPresence({
    channelId,
    user,
    currentStoryId: null,
    isDrawing: false,
  });

  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold text-fg-muted">
        스토리 ({stories.length})
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((story) => {
          const livePresences = presences.filter((p) => p.currentStoryId === story.id);
          return (
            <StoryCard
              key={story.id}
              story={story}
              channelId={channelId}
              canEdit={canEdit}
              livePresences={livePresences}
            />
          );
        })}
        {canEdit && <CreateStoryButton channelId={channelId} />}
      </div>
      {!canEdit && stories.length === 0 && (
        <p className="rounded-md border border-dashed border-divider bg-brand-surface/40 px-4 py-6 text-center text-sm text-fg-muted">
          이 채널에는 아직 스토리가 없어요.
        </p>
      )}
    </section>
  );
}
