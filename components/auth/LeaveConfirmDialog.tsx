'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Link2, Trash2, X } from 'lucide-react';
import { signOut } from '@/app/actions/sign-out';
import { deleteAnonymousAccountAction } from '@/app/actions/delete-anonymous-account';
import { cn } from '@/lib/utils';

// D-014: 나가기 클릭 시 확인 모달.
// - 익명 사용자: 3 옵션 (취소 / Google 연동하러 가기 → /me / 데이터 삭제 → cascade)
// - 회원 사용자: 2 옵션 (취소 / 세션 종료 — 데이터 보존)
//
// SignedInBanner 의 "나가기" 버튼이 이 모달을 띄움.

interface LeaveConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  isAnonymous: boolean;
}

export function LeaveConfirmDialog({ open, onClose, isAnonymous }: LeaveConfirmDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<'signOut' | 'delete' | null>(null);

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSignOut = () => {
    setBusyAction('signOut');
    startTransition(async () => {
      await signOut();
    });
  };

  const handleConnectGoogle = () => {
    onClose();
    router.push('/me');
  };

  const handleDelete = () => {
    setBusyAction('delete');
    startTransition(async () => {
      await deleteAnonymousAccountAction();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-confirm-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-lg border border-divider bg-brand-bezel p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label="닫기"
          className="absolute right-3 top-3 rounded-sm p-1 text-fg-muted hover:bg-brand-surface hover:text-fg disabled:opacity-50"
        >
          <X size={18} />
        </button>

        <h2 id="leave-confirm-title" className="mb-2 text-lg font-bold text-fg">
          나가기
        </h2>

        {isAnonymous ? (
          <>
            <p className="mb-5 text-sm text-fg-muted">
              익명 트랙으로 사용 중이에요. 데이터를 어떻게 할까요?
              <br />
              <span className="text-rec">
                ⚠ 데이터 삭제를 선택하면 만든 채널·스토리가 모두 사라져요.
              </span>
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={pending}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md',
                  'border border-divider bg-brand-surface px-4 py-2.5 text-sm font-semibold text-fg',
                  'hover:border-live/60 disabled:opacity-50',
                )}
              >
                <Link2 size={14} />
                Google 로 연동해서 보존하기
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md',
                  'border border-rec/40 bg-rec/10 px-4 py-2.5 text-sm font-semibold text-rec',
                  'hover:bg-rec/20 disabled:opacity-50',
                )}
              >
                <Trash2 size={14} />
                {busyAction === 'delete' && pending ? '삭제 중…' : '데이터 삭제하고 나가기'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-md px-4 py-2 text-sm text-fg-muted hover:bg-brand-surface disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-5 text-sm text-fg-muted">
              로그아웃하면 같은 기기에서 다시 로그인할 때까지 사용할 수 없어요.
              <br />
              <span className="text-fg/80">
                만든 채널·스토리는 계정에 그대로 보존돼요.
              </span>
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSignOut}
                disabled={pending}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md',
                  'bg-rec px-4 py-2.5 text-sm font-semibold text-white',
                  'hover:brightness-110 disabled:opacity-50',
                )}
              >
                <LogOut size={14} />
                {busyAction === 'signOut' && pending ? '로그아웃 중…' : '로그아웃'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-md px-4 py-2 text-sm text-fg-muted hover:bg-brand-surface disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
