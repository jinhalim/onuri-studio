'use client';

import { useMemo, useState, useTransition } from 'react';
import { Check, X, Link2, MailX } from 'lucide-react';
import type { Notification } from '@/lib/domain/notification';
import { markNotificationReadAction } from '@/app/actions/mark-notification-read';
import { EditRequestDialog } from './EditRequestDialog';
import { RelativeTime } from '@/components/shared/RelativeTime';
import { urls } from '@/lib/config/urls';
import { cn } from '@/lib/utils';

// D-015: 알림 dropdown 본체.
// 알림 type 별 클릭 동작:
//   - edit_request          → EditRequestDialog 띄움 (허용/차단)
//   - edit_request_approved → markRead + 해당 스토리로 navigate + router.refresh
//                            (canEdit 가 새로 계산되어 편집 모드로 진입)
//   - edit_request_denied   → markRead 만

interface NotificationDropdownProps {
  notifications: Notification[];
  onClose: () => void;
  onMarkReadLocally: (id: string) => void;
  onRefetch: () => Promise<void>;
}

export function NotificationDropdown({
  notifications,
  onClose,
  onMarkReadLocally,
  onRefetch,
}: NotificationDropdownProps) {
  const [activeRequest, setActiveRequest] = useState<Notification | null>(null);
  const [, startTransition] = useTransition();

  // 답신/확인 완료된 (readAt 있는) 알림은 inbox 에서 숨김.
  // edit_request 측: owner 가 허용/차단 시 read_at 자동 설정 → 사라짐.
  // approved/denied 측: requester 가 클릭 시 markRead → 사라짐.
  const visibleNotifications = useMemo(
    () => notifications.filter((n) => !n.readAt),
    [notifications],
  );

  const handleClick = (n: Notification) => {
    if (n.type === 'edit_request') {
      setActiveRequest(n);
      return;
    }
    // approved / denied / google_link_* 클릭 처리
    startTransition(async () => {
      if (!n.readAt) {
        onMarkReadLocally(n.id);
        await markNotificationReadAction(n.id);
      }
      if (n.type === 'edit_request_approved') {
        // 해당 스토리로 이동 + 전체 페이지 리로드.
        // router.refresh() 는 React 상태를 보존해서 tldraw editor.isReadonly 등
        // 일부 mount-time 설정이 갱신 안 되는 stale closure 이슈가 있음 →
        // window.location.assign 으로 깨끗한 새 페이지 로드.
        onClose();
        window.location.assign(urls.story(n.payload.channelId, n.payload.storyId));
      } else if (
        n.type === 'google_link_approved' ||
        n.type === 'google_link_rejected'
      ) {
        // D-021: 마이페이지로 이동해서 갱신된 Google 연동 상태 확인.
        onClose();
        window.location.assign('/me');
      }
      // denied / rejected 는 read 처리만, 추가 동작 없음.
    });
  };

  return (
    <div
      role="dialog"
      aria-label="알림 목록"
      className={cn(
        'absolute right-0 top-full z-[80] mt-2 w-80 max-w-[calc(100vw-1rem)]',
        'rounded-md border border-divider bg-brand-bezel shadow-2xl',
      )}
    >
      <div className="flex items-center justify-between border-b border-divider px-3 py-2">
        <span className="text-sm font-semibold text-fg">알림</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="rounded-sm p-1 text-fg-muted hover:bg-brand-surface hover:text-fg"
        >
          <X size={14} />
        </button>
      </div>

      <ul className="max-h-[60vh] overflow-y-auto">
        {visibleNotifications.length === 0 ? (
          <li className="flex flex-col items-center gap-2 px-3 py-10 text-sm text-fg-muted">
            <MailX size={20} aria-hidden />
            <span>받은 알림이 없어요</span>
          </li>
        ) : (
          visibleNotifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => handleClick(n)}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2.5 text-left',
                  'hover:bg-brand-surface transition-colors',
                  !n.readAt && 'bg-brand-surface/50',
                )}
              >
                <NotificationIcon type={n.type} />
                <div className="min-w-0 flex-1">
                  <NotificationLabel notification={n} />
                  <div className="mt-0.5 text-[11px] text-fg-muted">
                    <RelativeTime date={n.createdAt} />
                  </div>
                </div>
                {!n.readAt && (
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rec"
                  />
                )}
              </button>
            </li>
          ))
        )}
      </ul>

      {activeRequest && activeRequest.type === 'edit_request' && (
        <EditRequestDialog
          notification={activeRequest}
          onClose={() => setActiveRequest(null)}
          onAfterAction={async () => {
            setActiveRequest(null);
            onClose();
            await onRefetch();
          }}
        />
      )}
    </div>
  );
}

function NotificationIcon({ type }: { type: Notification['type'] }) {
  if (type === 'edit_request') {
    return (
      <span
        className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-live/15 text-live"
        aria-hidden
      >
        <Link2 size={12} />
      </span>
    );
  }
  if (type === 'edit_request_approved' || type === 'google_link_approved') {
    return (
      <span
        className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500"
        aria-hidden
      >
        <Check size={12} />
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-rec/15 text-rec"
      aria-hidden
    >
      <X size={12} />
    </span>
  );
}

function NotificationLabel({ notification }: { notification: Notification }) {
  if (notification.type === 'edit_request') {
    return (
      <p className="text-sm text-fg">
        <strong className="font-semibold">{notification.payload.requesterNickname}</strong>
        {' 님이 내 스토리 "'}
        <span className="font-semibold">{notification.payload.storyTitle}</span>
        {'" 에 수정 권한 요청하였습니다'}
      </p>
    );
  }
  if (notification.type === 'edit_request_approved') {
    return (
      <p className="text-sm text-fg">
        스토리 &ldquo;
        <span className="font-semibold">{notification.payload.storyTitle}</span>
        &rdquo; 의 수정 권한이 허용되었습니다 — 클릭해서 편집 시작하기
      </p>
    );
  }
  if (notification.type === 'edit_request_denied') {
    return (
      <p className="text-sm text-fg">
        스토리 &ldquo;
        <span className="font-semibold">{notification.payload.storyTitle}</span>
        &rdquo; 의 수정 권한 요청이 거절되었습니다
      </p>
    );
  }
  if (notification.type === 'google_link_approved') {
    return (
      <p className="text-sm text-fg">
        Google 연동 등록 완료 —{' '}
        <span className="font-mono font-semibold">{notification.payload.email}</span>
        {' '}으로 로그인 가능. 클릭해서 마이페이지로 이동.
      </p>
    );
  }
  // google_link_rejected
  return (
    <p className="text-sm text-fg">
      Google 연동 요청이 거부됐어요 —{' '}
      <span className="font-mono">{notification.payload.email}</span>
      {notification.payload.reason ? ` (${notification.payload.reason})` : ''}
    </p>
  );
}
