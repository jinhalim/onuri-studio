import Link from 'next/link';
import type { MyChannelSummary } from '@/lib/usecases/list-my-channels';
import { cn } from '@/lib/utils';

interface ChannelListProps {
  channels: MyChannelSummary[];
}

export function ChannelList({ channels }: ChannelListProps) {
  if (channels.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-divider bg-brand-surface/40 px-4 py-6 text-center text-sm text-fg-muted">
        아직 만든 채널이 없어요. 위 폼으로 첫 채널을 만들어보세요.
      </p>
    );
  }

  return (
    <ul className="flex w-full flex-col gap-2">
      {channels.map((c) => (
        <li key={c.id}>
          <Link
            href={`/ch/${c.id}`}
            className={cn(
              'flex items-center justify-between rounded-md px-4 py-3',
              'border border-divider bg-brand-surface transition-colors',
              'hover:border-live/60',
            )}
          >
            <div className="flex flex-col">
              <span className="font-medium text-fg">{c.name}</span>
              <span className="text-xs text-fg-muted">
                {c.storyCount}개 스토리
                {c.lastStoryUpdatedAt && ` · 최근 ${formatRelative(c.lastStoryUpdatedAt)}`}
              </span>
            </div>
            <code className="text-xs text-fg-muted">{c.id}</code>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return '방금 전';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}
