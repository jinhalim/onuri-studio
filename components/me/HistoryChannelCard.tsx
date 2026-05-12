'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Star } from 'lucide-react';
import { toggleFavoriteAction } from '@/app/actions/toggle-favorite';
import type { ChannelHistoryItem } from '@/lib/usecases/get-my-history';
import { RelativeTime } from '@/components/shared/RelativeTime';
import { cn } from '@/lib/utils';

// 마이페이지의 "최근 방문" / "즐겨찾기" 그리드용 카드.
// Channel Guide 의 StoryCard 와 시각 톤 통일, 단순화된 정보만 노출.

interface HistoryChannelCardProps {
  item: ChannelHistoryItem;
}

export function HistoryChannelCard({ item }: HistoryChannelCardProps) {
  const [isFavorite, setIsFavorite] = useState(item.isFavorite);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const prev = isFavorite;
    setIsFavorite(!prev); // optimistic
    startTransition(async () => {
      const result = await toggleFavoriteAction(item.channelId);
      if (!result.ok) {
        setIsFavorite(prev); // 롤백
        console.error('[HistoryChannelCard] 즐겨찾기 실패:', result.error);
      } else if (typeof result.isFavorite === 'boolean') {
        setIsFavorite(result.isFavorite);
      }
    });
  };

  return (
    <article className="group relative flex flex-col gap-2 rounded-md border border-divider bg-brand-surface p-4 transition-colors hover:border-live/50">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        className={cn(
          'absolute right-3 top-3 rounded-sm p-1 transition-colors',
          isFavorite ? 'text-rec' : 'text-fg-muted/60 hover:text-fg',
        )}
      >
        <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>

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

