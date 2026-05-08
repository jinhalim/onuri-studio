import Link from 'next/link';
import type { Story } from '@/lib/domain/story';
import { cn } from '@/lib/utils';
import { DeleteStoryButton } from './DeleteStoryButton';

interface StoryCardProps {
  story: Story;
  channelId: string;
  /** 현재 사용자가 채널 소유자인지. true면 삭제 버튼 노출. */
  canEdit: boolean;
}

export function StoryCard({ story, channelId, canEdit }: StoryCardProps) {
  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md',
        'border border-divider bg-brand-surface transition-colors',
        'hover:border-live/50',
      )}
    >
      <Link
        href={`/ch/${channelId}/story/${story.id}`}
        className="flex aspect-video items-center justify-center bg-brand-screen"
      >
        {story.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={story.thumbnailUrl}
            alt={story.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-fg-muted">미리보기 없음</span>
        )}
      </Link>

      <div className="flex flex-col gap-1 px-4 py-3">
        <Link
          href={`/ch/${channelId}/story/${story.id}`}
          className="line-clamp-1 text-sm font-medium text-fg hover:text-live"
        >
          {story.title}
        </Link>
        <span className="text-xs text-fg-muted">
          마지막 수정: {formatRelative(story.titleUpdatedAt)}
        </span>
      </div>

      {canEdit && (
        <div
          className={cn(
            'absolute right-2 top-2 opacity-0 transition-opacity',
            'group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          <DeleteStoryButton storyId={story.id} channelId={channelId} />
        </div>
      )}
    </article>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return date.toLocaleDateString('ko-KR');
}
