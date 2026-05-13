'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { User } from '@/lib/domain/user';
import { LeaveConfirmDialog } from './LeaveConfirmDialog';
import { cn } from '@/lib/utils';

// D-014: "나가기" 클릭 시 LeaveConfirmDialog 모달 표시.
// - 익명: Google 연동 / 데이터 삭제 / 취소
// - 회원: 로그아웃 / 취소 (데이터 보존)

interface SignedInBannerProps {
  user: User;
  /** 우측 정렬용 컴팩트 모드 (랜딩/마이페이지 헤더용). */
  compact?: boolean;
}

export function SignedInBanner({ user, compact = false }: SignedInBannerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      {compact ? (
        <div className="flex items-center gap-3 text-sm">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full ring-1 ring-divider"
            style={{ backgroundColor: user.color }}
          />
          {/* 닉네임 클릭 → /me 이동. PresenceList 의 접속자 닉네임 hover 와 구분되도록
              underline-offset 으로 hover 표시. */}
          <Link
            href="/me"
            title="마이페이지로 이동"
            className="text-fg underline-offset-4 hover:underline"
          >
            {user.nickname}
          </Link>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="text-xs text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            나가기
          </button>
        </div>
      ) : (
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
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className={cn(
              'h-9 rounded-sm border border-divider px-4 text-sm text-fg-muted',
              'transition-colors hover:bg-brand-screen hover:text-fg',
            )}
          >
            나가기
          </button>
        </div>
      )}

      <LeaveConfirmDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        isAnonymous={user.isAnonymous}
      />
    </>
  );
}
