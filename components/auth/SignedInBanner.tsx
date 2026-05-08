'use client';

import { signOut } from '@/app/actions/sign-out';
import type { User } from '@/lib/domain/user';
import { cn } from '@/lib/utils';

interface SignedInBannerProps {
  user: User;
}

export function SignedInBanner({ user }: SignedInBannerProps) {
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
      <p className="text-sm text-fg-muted">
        지금은 익명 트랙입니다. 채널/스토리 기능은 Phase 2에서 추가됩니다.
      </p>
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
