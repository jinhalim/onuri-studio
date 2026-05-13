'use client';

import { useEffect, useTransition } from 'react';
import { Check, X, CheckCircle2 } from 'lucide-react';
import type { Notification } from '@/lib/domain/notification';
import { approveEditRequestAction } from '@/app/actions/approve-edit-request';
import { denyEditRequestAction } from '@/app/actions/deny-edit-request';
import { cn } from '@/lib/utils';

// D-015: owner 가 edit_request 알림을 클릭했을 때 뜨는 허용/차단 팝업.

interface EditRequestDialogProps {
  notification: Notification & { type: 'edit_request' };
  onClose: () => void;
  onAfterAction: () => void | Promise<void>;
}

export function EditRequestDialog({
  notification,
  onClose,
  onAfterAction,
}: EditRequestDialogProps) {
  const [pending, startTransition] = useTransition();

  // Esc 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  const handleApprove = () => {
    startTransition(async () => {
      const res = await approveEditRequestAction(notification.id);
      if (!res.ok) {
        console.error('[EditRequestDialog] approve 실패:', res.error);
        return;
      }
      await onAfterAction();
    });
  };

  const handleDeny = () => {
    startTransition(async () => {
      const res = await denyEditRequestAction(notification.id);
      if (!res.ok) {
        console.error('[EditRequestDialog] deny 실패:', res.error);
        return;
      }
      await onAfterAction();
    });
  };

  // Defense-in-depth: dropdown 에서 이미 read 알림은 필터링되지만, 다른 탭 race 등으로
  // 처리된 알림이 dialog 로 열린 경우 허용/차단 버튼 대신 "이미 처리됨" 메시지 표시.
  const alreadyHandled = notification.readAt !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-request-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-divider bg-brand-bezel p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          {alreadyHandled ? (
            <CheckCircle2 size={16} className="text-emerald-500" aria-hidden />
          ) : (
            <span
              aria-hidden
              className="h-3 w-3 rounded-full ring-2 ring-divider"
              style={{ backgroundColor: notification.payload.requesterColor }}
            />
          )}
          <h2 id="edit-request-title" className="text-lg font-bold text-fg">
            {alreadyHandled ? '이미 처리된 요청' : '수정 권한 요청'}
          </h2>
        </div>

        {alreadyHandled ? (
          <>
            <p className="mb-5 text-sm text-fg-muted">
              이 수정 권한 요청은 이미 답신이 완료된 건입니다.
              <br />
              <span className="text-fg/80">
                <strong className="font-semibold text-fg">
                  {notification.payload.requesterNickname}
                </strong>
                {' 님 / 스토리 '}
                &ldquo;
                <strong className="font-semibold text-fg">
                  {notification.payload.storyTitle}
                </strong>
                &rdquo;
              </span>
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  'inline-flex items-center justify-center rounded-md',
                  'border border-divider bg-brand-surface px-4 py-2.5 text-sm font-semibold text-fg',
                  'hover:bg-brand-surface/70',
                )}
              >
                닫기
              </button>
            </div>
          </>
        ) : (
        <>
        <p className="mb-5 text-sm text-fg-muted">
          <strong className="font-semibold text-fg">
            {notification.payload.requesterNickname}
          </strong>{' '}
          님이 내 스토리 &ldquo;
          <strong className="font-semibold text-fg">
            {notification.payload.storyTitle}
          </strong>
          &rdquo; 에 수정 권한을 요청하였습니다.
          <br />
          <span className="text-fg/80">
            허용하면 이 사용자가 해당 스토리를 함께 편집할 수 있어요.
          </span>
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={pending}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-md',
              'bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white',
              'hover:brightness-110 disabled:opacity-50',
            )}
          >
            <Check size={14} />
            허용
          </button>
          <button
            type="button"
            onClick={handleDeny}
            disabled={pending}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-md',
              'border border-rec/40 bg-rec/10 px-4 py-2.5 text-sm font-semibold text-rec',
              'hover:bg-rec/20 disabled:opacity-50',
            )}
          >
            <X size={14} />
            차단
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
