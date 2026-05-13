'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useUserNotifications } from '@/lib/hooks/useUserNotifications';
import { NotificationDropdown } from './NotificationDropdown';
import { cn } from '@/lib/utils';

// D-015: 헤더용 알림 종 아이콘 + dropdown.
// userId 가 null 이면 렌더 안 함 (비로그인 = 익명 닉네임 입력 전).

interface NotificationBellProps {
  userId: string | null;
  className?: string;
}

export function NotificationBell({ userId, className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, refetch, markReadLocally } = useUserNotifications({
    userId,
  });

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!userId) return null;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`알림 ${unreadCount > 0 ? `(${unreadCount}개 미확인)` : ''}`}
        title={unreadCount > 0 ? `미확인 알림 ${unreadCount}개` : '알림'}
        className={cn(
          'relative inline-flex h-8 w-8 items-center justify-center rounded-sm',
          'text-fg-muted hover:bg-brand-surface hover:text-fg',
          'transition-colors',
        )}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center',
              'rounded-full bg-rec px-1 text-[10px] font-bold text-white',
              'ring-1 ring-brand-bezel',
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationDropdown
          notifications={notifications}
          onClose={() => setOpen(false)}
          onMarkReadLocally={markReadLocally}
          onRefetch={refetch}
        />
      )}
    </div>
  );
}
