'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';
import { toggleFavoriteAction } from '@/app/actions/toggle-favorite';
import { cn } from '@/lib/utils';

// 채널 즐겨찾기 ★ 토글 — 메인의 ChannelList / 채널 페이지 헤더 / 마이페이지 모두 사용.
// optimistic 업데이트 + 실패 시 롤백. 시각: 채워진 별(★, accent-rec) / 빈 별 (☆).

interface FavoriteToggleProps {
  channelId: string;
  initial: boolean;
  /** 시각 사이즈. 'sm' = 14px (목록), 'md' = 18px (페이지 헤더). */
  size?: 'sm' | 'md';
  className?: string;
}

export function FavoriteToggle({
  channelId,
  initial,
  size = 'sm',
  className,
}: FavoriteToggleProps) {
  const [isFavorite, setIsFavorite] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const prev = isFavorite;
    setIsFavorite(!prev); // optimistic
    startTransition(async () => {
      const result = await toggleFavoriteAction(channelId);
      if (!result.ok) {
        setIsFavorite(prev); // 롤백
        console.error('[FavoriteToggle] 실패:', result.error);
        return;
      }
      if (typeof result.isFavorite === 'boolean') {
        setIsFavorite(result.isFavorite);
      }
    });
  };

  const iconSize = size === 'md' ? 18 : 14;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      title={isFavorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-sm p-1 transition-colors',
        isFavorite ? 'text-rec' : 'text-fg-muted/60 hover:text-fg',
        className,
      )}
    >
      <Star size={iconSize} fill={isFavorite ? 'currentColor' : 'none'} />
    </button>
  );
}
