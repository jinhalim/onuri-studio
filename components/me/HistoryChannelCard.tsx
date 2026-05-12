'use client';

import Link from 'next/link';
import type { ChannelHistoryItem } from '@/lib/usecases/get-my-history';
import { RelativeTime } from '@/components/shared/RelativeTime';
import { FavoriteToggle } from '@/components/shared/FavoriteToggle';

// 마이페이지의 "최근 방문" / "즐겨찾기" 그리드용 카드.
// Channel Guide 의 StoryCard 와 시각 톤 통일, 단순화된 정보만 노출.

interface HistoryChannelCardProps {
  item: ChannelHistoryItem;
}

export function HistoryChannelCard({ item }: HistoryChannelCardProps) {
  return (
    <article className="group relative flex flex-col gap-2 rounded-md border border-divider bg-brand-surface p-4 transition-colors hover:border-live/50">
      <FavoriteToggle
        channelId={item.channelId}
        initial={item.isFavorite}
        size="sm"
        className="absolute right-3 top-3"
      />

      <Link href={`/ch/${item.channelId}`} className="flex flex-col gap-1 pr-7">
        <h3 className="line-clamp-1 text-base font-semibold text-fg group-hover:text-live">
          {item.channelName}
        </h3>
        <p className="text-xs text-fg-muted">
          {item.myRole === 'owner' ? '내 채널' : `by ${item.ownerNickname}`}
        </p>
        <p className="text-[11px] text-fg-muted/70">
          마지막 방문 <RelativeTime date={item.lastVisitedAt} />
        </p>
      </Link>
    </article>
  );
}
