'use client';

import { signOut } from '@/app/actions/sign-out';
import type { User } from '@/lib/domain/user';
import { cn } from '@/lib/utils';

interface SignedInBannerProps {
  user: User;
  /** 우측 정렬용 컴팩트 모드 (랜딩/마이페이지 헤더용). */
  compact?: boolean;
}

export function SignedInBanner({ user, compact = false }: SignedInBannerProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span
          aria-hidden
          className="h-3 w-3 rounded-full ring-1 ring-divider"
          style={{ backgroundColor: user.color }}
        />
        <span className="text-fg">{user.nickname}</span>
        <form action={signOut}>
          <button
            type="submit"
            className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            나가기
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full max-w-md flex-col items-center gap-4 rounded-lg p-6',
        'bg-brand-surface border border-divider',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-4 w-4 rounded-full ring-2 ring-divider"
          style={{ backgroundColor: user.color }}
        />
        <span className="text-lg text-fg">
          안녕하세요, <strong>{user.nickname}</strong> 님
        </span>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className={cn(
            'h-9 rounded-sm border border-divider px-4 text-sm text-fg-muted',
            'transition-colors hover:bg-brand-screen hover:text-fg',
          )}
        >
          나가기
        </button>
      </form>
    </div>
  );
}
