'use client';

import { useState } from 'react';
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
          // py-2 로 avatar (h-5) 가 헤더 boundary 안에 충분히 들어가게.
          // relative + z-10 으로 tooltip 등 자식 absolute 요소가 보장된 stacking context 안에서 그려짐.
          'relative z-10 flex items-center gap-2 rounded-sm border border-divider bg-brand-bezel/80 px-3 py-2',
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
  // 자체 hover state — native title 의 0.5~1초 OS 지연을 없애고 즉시 표시.
  const [hover, setHover] = useState(false);
  const label = `${presence.nickname}${isSelf ? ' (나)' : ''}`;
  return (
    <span
      className="relative inline-block"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      tabIndex={0}
    >
      <span
        aria-label={presence.nickname}
        className={cn(
          'inline-block h-5 w-5 rounded-full ring-2 ring-brand-bezel transition-transform',
          presence.isDrawing && 'ring-rec animate-pulse-rec',
          hover && 'scale-110',
        )}
        style={{ backgroundColor: presence.color }}
      />
      {hover && (
        <span
          role="tooltip"
          className={cn(
            // top-full → avatar 아래쪽에 표시. 헤더의 isolation: isolate + z-[1000] 안에서
            // 그려지므로 z-50 만으로도 캔버스 도형(z-300) 위에 안전하게 올라간다.
            // 모달(z-[100], fixed inset-0)은 body 레벨 stacking context 라서 자연히 더 위.
            'pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2',
            // w-max + whitespace-nowrap → 내용 길이만큼 가로로 펼쳐짐 (세로 줄바꿈 방지).
            'w-max max-w-[280px] whitespace-nowrap rounded-md border border-divider bg-brand-bezel px-3 py-2',
            'text-xs font-medium text-fg shadow-xl ring-1 ring-black/30',
          )}
        >
          <span style={{ color: presence.color }}>●</span> {label}
          {presence.isDrawing && <span className="ml-1.5 text-rec">· 그리는 중</span>}
        </span>
      )}
    </span>
  );
}
