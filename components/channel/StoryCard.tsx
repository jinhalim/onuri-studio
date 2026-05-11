import Link from 'next/link';
import type { Story } from '@/lib/domain/story';
import type { ChannelPresence } from '@/lib/hooks/useChannelPresence';
import { cn } from '@/lib/utils';
import { DeleteStoryButton } from './DeleteStoryButton';

interface StoryCardProps {
  story: Story;
  channelId: string;
  /** 현재 사용자가 채널 소유자인지. true면 삭제 버튼 노출. */
  canEdit: boolean;
  /** 이 스토리에 현재 접속 중인 사용자들 (자기 자신 포함 가능). */
  livePresences?: ChannelPresence[];
}

export function StoryCard({ story, channelId, canEdit, livePresences = [] }: StoryCardProps) {
  const anyDrawing = livePresences.some((p) => p.isDrawing);
  const liveCount = livePresences.length;

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-md',
        'border bg-brand-surface transition-colors',
        // 라이브 상태에 따라 테두리 색 변경 (D-010 ON AIR 확장)
        anyDrawing
          ? 'border-rec/60'
          : liveCount > 0
            ? 'border-live/60'
            : 'border-divider hover:border-live/50',
      )}
    >
      <Link
        href={`/ch/${channelId}/story/${story.id}`}
        className="relative flex aspect-video items-center justify-center bg-brand-screen"
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

        {/* 라이브 인디케이터: 좌상단 코너 */}
        {liveCount > 0 && (
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-sm bg-brand-bezel/85 px-2 py-1 backdrop-blur-sm">
            <span
              aria-hidden
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                anyDrawing ? 'bg-rec animate-pulse-rec' : 'bg-live',
              )}
            />
            <span
              className={cn(
                'text-[10px] font-semibold',
                anyDrawing ? 'text-rec' : 'text-live',
              )}
            >
              {anyDrawing ? 'ON AIR' : `${liveCount}명 접속`}
            </span>
          </div>
        )}

        {/* 접속자 아바타: 우상단 코너 */}
        {liveCount > 0 && (
          <div className="absolute right-2 top-2 flex -space-x-1.5">
            {livePresences.slice(0, 3).map((p) => (
              <span
                key={p.userId}
                title={p.nickname}
                aria-label={p.nickname}
                className="h-4 w-4 rounded-full ring-2 ring-brand-bezel"
                style={{ backgroundColor: p.color }}
              />
            ))}
            {liveCount > 3 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-surface text-[9px] font-semibold text-fg-muted ring-2 ring-brand-bezel">
                +{liveCount - 3}
              </span>
            )}
          </div>
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
