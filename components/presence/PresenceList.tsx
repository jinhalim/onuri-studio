'use client';

import type { PresenceState } from '@/lib/hooks/useStoryRealtime';
import { cn } from '@/lib/utils';

interface PresenceListProps {
  presences: PresenceState[];
  currentUserId: string;
  /** 'story' = 스토리 페이지 헤더용 (작은 도트 + 닉네임), 'compact' = 한 줄. */
  variant?: 'compact' | 'detailed';
  className?: string;
}

// 현재 같은 스토리에 접속한 사용자 목록 표시.
// 본인 포함, 본인은 "(나)" 표시.

export function PresenceList({
  presences,
  currentUserId,
  variant = 'compact',
  className,
}: PresenceListProps) {
  if (presences.length === 0) return null;

  // 본인을 맨 앞으로
  const sorted = [...presences].sort((a, b) => {
    if (a.userId === currentUserId) return -1;
    if (b.userId === currentUserId) return 1;
    return a.nickname.localeCompare(b.nickname);
  });

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-sm border border-divider bg-brand-bezel/80 px-3 py-1.5 backdrop-blur-sm',
          className,
        )}
      >
        <span className="text-xs text-fg-muted">접속 중 {presences.length}명</span>
        <div className="flex -space-x-1.5">
          {sorted.slice(0, 5).map((p) => (
            <Avatar key={p.userId} presence={p} isSelf={p.userId === currentUserId} />
          ))}
          {sorted.length > 5 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-surface text-[10px] font-semibold text-fg-muted ring-2 ring-brand-bezel">
              +{sorted.length - 5}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <ul className={cn('flex flex-col gap-1', className)}>
      {sorted.map((p) => (
        <li key={p.userId} className="flex items-center gap-2 text-sm">
          <Avatar presence={p} isSelf={p.userId === currentUserId} />
          <span className="text-fg">
            {p.nickname}
            {p.userId === currentUserId && <span className="ml-1 text-fg-muted">(나)</span>}
          </span>
          {p.isDrawing && <span className="text-xs text-rec">● 그리는 중</span>}
        </li>
      ))}
    </ul>
  );
}

function Avatar({ presence, isSelf }: { presence: PresenceState; isSelf: boolean }) {
  return (
    <span
      title={`${presence.nickname}${isSelf ? ' (나)' : ''}${presence.isDrawing ? ' · 그리는 중' : ''}`}
      aria-label={presence.nickname}
      className={cn(
        'inline-block h-5 w-5 rounded-full ring-2 ring-brand-bezel transition-transform',
        presence.isDrawing && 'ring-rec animate-pulse-rec',
      )}
      style={{ backgroundColor: presence.color }}
    />
  );
}
