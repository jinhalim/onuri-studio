'use client';

import { useEffect, useState, useTransition } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import {
  listGoogleLinkRequestsAction,
  type GoogleLinkRequestRow,
} from '@/app/actions/list-google-link-requests';
import { approveGoogleLinkRequestAction } from '@/app/actions/approve-google-link-request';
import { rejectGoogleLinkRequestAction } from '@/app/actions/reject-google-link-request';
import { RelativeTime } from '@/components/shared/RelativeTime';

// D-021: /admin 페이지의 Google 연동 요청 관리 섹션.
//   - status 필터 (pending / approved / rejected / all).
//   - 각 요청: 닉네임, 이메일, 요청 시각 표시.
//   - 동작: "Google Console 열기" (외부 새 탭) + "완료 처리" / "거부".
//
// admin 의 처리 흐름:
//   1. "Google Console 열기" 클릭 → Test users 페이지로 이동 → 이메일 수동 등록.
//   2. 본 패널로 돌아와 "완료 처리" 클릭 → DB status='approved' + 요청자 알림.

const GOOGLE_CONSOLE_TEST_USERS_URL =
  'https://console.cloud.google.com/apis/credentials/consent';

export function GoogleLinkRequestsAdminSection() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [requests, setRequests] = useState<GoogleLinkRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async (s: typeof status = status) => {
    setLoading(true);
    setError(null);
    const res = await listGoogleLinkRequestsAction(s);
    if (!res.ok) {
      setError(res.error ?? '목록 조회 실패');
      setRequests([]);
    } else {
      setRequests(res.requests ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    void refresh(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-fg">Google 연동 요청</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            테스트 배포 모드 — Google Cloud Console 에 사용자 이메일을 수동 등록.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={GOOGLE_CONSOLE_TEST_USERS_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 rounded-md border border-divider bg-brand-surface px-2.5 py-1.5 text-[11px] font-medium text-fg hover:bg-brand-surface/80"
          >
            <ExternalLink size={12} />
            Google Console 열기
          </a>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="새로고침"
            title="새로고침"
            className="rounded-md border border-divider bg-brand-surface p-1.5 text-fg-muted hover:text-fg disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>
      </header>

      <div className="flex items-center gap-1.5">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
              status === s
                ? 'bg-fg text-bg-bezel'
                : 'border border-divider bg-brand-surface text-fg-muted hover:text-fg'
            }`}
          >
            {labelForStatus(s)}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-rec">{error}</p>}

      {requests.length === 0 && !loading && !error && (
        <p className="rounded-md border border-divider bg-brand-surface/40 px-3 py-4 text-center text-xs text-fg-muted">
          {status === 'pending' ? '대기 중인 요청이 없어요.' : '항목이 없어요.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {requests.map((r) => (
          <RequestRow key={r.id} request={r} onChanged={() => void refresh()} />
        ))}
      </div>
    </section>
  );
}

function RequestRow({
  request,
  onChanged,
}: {
  request: GoogleLinkRequestRow;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const handleApprove = () => {
    if (!confirm(`${request.email} 을 Google Console 에 등록한 뒤 완료 처리할까요?`))
      return;
    startTransition(async () => {
      const res = await approveGoogleLinkRequestAction(request.id);
      if (!res.ok) {
        alert(`승인 실패: ${res.error ?? '알 수 없는 오류'}`);
        return;
      }
      onChanged();
    });
  };

  const handleReject = () => {
    const reason = prompt('거부 사유 (선택, 사용자에게 보임):', '');
    if (reason === null) return; // 취소
    startTransition(async () => {
      const res = await rejectGoogleLinkRequestAction(request.id, reason || undefined);
      if (!res.ok) {
        alert(`거부 실패: ${res.error ?? '알 수 없는 오류'}`);
        return;
      }
      onChanged();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-divider bg-brand-surface/60 p-3 text-xs">
      <span
        aria-hidden
        className="h-2 w-2 flex-shrink-0 rounded-full"
        style={{ background: request.userColor }}
      />
      <span className="font-medium text-fg">{request.userNickname}</span>
      <span className="font-mono text-fg-muted">{request.email}</span>
      <span className="ml-auto text-[10px] text-fg-muted">
        <RelativeTime date={request.requestedAt} />
      </span>
      {request.status === 'pending' ? (
        <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
          <button
            type="button"
            onClick={handleReject}
            disabled={pending}
            className="rounded-md border border-divider px-2.5 py-1 text-[11px] font-medium text-fg-muted hover:text-rec disabled:opacity-50"
          >
            거부
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={pending}
            className="rounded-md bg-live px-2.5 py-1 text-[11px] font-medium text-bg-bezel hover:bg-live/90 disabled:opacity-50"
          >
            {pending ? '처리 중…' : '완료 처리'}
          </button>
        </div>
      ) : (
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
            request.status === 'approved'
              ? 'bg-live/15 text-live'
              : 'bg-rec/15 text-rec'
          }`}
        >
          {request.status === 'approved' ? '완료' : '거부'}{' '}
          {request.processedByNickname ? `· ${request.processedByNickname}` : ''}
        </span>
      )}
    </div>
  );
}

function labelForStatus(s: 'pending' | 'approved' | 'rejected' | 'all'): string {
  switch (s) {
    case 'pending':
      return '대기 중';
    case 'approved':
      return '완료';
    case 'rejected':
      return '거부';
    case 'all':
      return '전체';
  }
}
