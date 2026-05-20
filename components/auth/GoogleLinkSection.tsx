'use client';

import { useState, useTransition } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { submitGoogleLinkRequestAction } from '@/app/actions/submit-google-link-request';
import type { MyGoogleLinkRequest } from '@/app/actions/get-my-google-link-request';
import { cn } from '@/lib/utils';

// D-021: Google 연동 요청 흐름의 통합 UI. 사용자 상태에 따라 4가지 모습.
//   1) 미요청 → "Google 연동 요청" 버튼 → dialog 로 이메일 입력 후 제출.
//   2) pending → "관리자 처리 대기 중 ({email})" 안내 + 알림 대기.
//   3) approved → 기존 GoogleSignInButton 노출 (정상 OAuth 흐름).
//   4) rejected → 재요청 버튼 + 사유 표시.

interface GoogleLinkSectionProps {
  /** 사용자 본인이 익명 + google provider 활성 = 연동 가능한 환경인지. */
  canConnectGoogle: boolean;
  initialRequest: MyGoogleLinkRequest | null;
}

export function GoogleLinkSection({
  canConnectGoogle,
  initialRequest,
}: GoogleLinkSectionProps) {
  const [request, setRequest] = useState<MyGoogleLinkRequest | null>(initialRequest);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!canConnectGoogle) return null;

  // 승인 상태: 정상 Google OAuth 버튼.
  if (request?.status === 'approved') {
    return (
      <div className="flex flex-col gap-1.5">
        <GoogleSignInButton
          label="Google 계정 연결"
          className="h-8 px-3 text-xs"
        />
        <p className="text-[10px] text-fg-muted/80">
          관리자 등록 완료 — {request.email} 으로 Google 로그인 가능합니다.
        </p>
      </div>
    );
  }

  // 대기 상태.
  if (request?.status === 'pending') {
    return (
      <div className="inline-flex flex-col gap-1.5 rounded-md border border-divider bg-brand-surface/50 px-3 py-2">
        <span className="text-xs font-medium text-fg">
          관리자 처리 대기 중
        </span>
        <span className="text-[11px] text-fg-muted">
          {request.email} — 등록이 완료되면 알림으로 알려드릴게요.
        </span>
      </div>
    );
  }

  // 거부 상태 — 재요청 가능.
  if (request?.status === 'rejected') {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <span className="text-[11px] text-rec">
          이전 요청이 거부됐어요 ({request.email})
        </span>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="rounded-md border border-divider bg-brand-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-brand-surface/80"
        >
          다시 요청 보내기
        </button>
        {dialogOpen && (
          <RequestDialog
            onClose={() => setDialogOpen(false)}
            onSubmitted={(req) => {
              setRequest(req);
              setDialogOpen(false);
            }}
          />
        )}
      </div>
    );
  }

  // 미요청 — 첫 요청 버튼.
  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-divider bg-brand-surface px-3 text-xs font-medium text-fg hover:bg-brand-surface/80"
      >
        <span aria-hidden>📧</span>
        Google 연동 요청
      </button>
      {dialogOpen && (
        <RequestDialog
          onClose={() => setDialogOpen(false)}
          onSubmitted={(req) => {
            setRequest(req);
            setDialogOpen(false);
          }}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Dialog — 이메일 입력 + 제출.
// ──────────────────────────────────────────────────────────────────────────────

interface RequestDialogProps {
  onClose: () => void;
  onSubmitted: (req: MyGoogleLinkRequest) => void;
}

function RequestDialog({ onClose, onSubmitted }: RequestDialogProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('이메일을 입력해주세요');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await submitGoogleLinkRequestAction(email.trim());
      if (!res.ok) {
        setError(res.error ?? '요청 실패');
        return;
      }
      // 제출 성공 — 임시 객체로 UI 갱신 (정확한 ID 는 다음 fetch 에서).
      onSubmitted({
        id: 'pending-local',
        email: email.trim().toLowerCase(),
        status: 'pending',
        requestedAt: new Date().toISOString(),
        processedAt: null,
      });
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Google 연동 등록 요청"
      onClick={onClose}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-divider bg-brand-bezel p-5 shadow-xl"
      >
        <header>
          <h2 className="text-base font-semibold text-fg">
            Google 연동 등록 요청
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-fg-muted">
            현재 테스트 배포 상태로 운영 중입니다. Google 로그인을 사용하려면
            먼저 관리자가 Google Cloud Console 의 테스트 사용자 목록에 본인의
            이메일을 등록해야 합니다.
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
            아래에 <strong className="text-fg">Google 로그인에 사용할 이메일</strong> 을
            남겨주시면, 관리자가 등록 후 알림을 보내드립니다 (보통 1~3일 소요).
          </p>
        </header>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg">이메일 주소</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your-email@gmail.com"
            required
            autoFocus
            disabled={pending}
            className={cn(
              'h-9 rounded-md border border-divider bg-brand-surface px-3 text-sm text-fg',
              'placeholder:text-fg-muted/60 focus:border-live focus:outline-none',
            )}
          />
        </label>

        {error && (
          <p className="text-xs text-rec" role="alert">
            {error}
          </p>
        )}

        <footer className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-divider bg-brand-surface px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-rec px-3 py-1.5 text-xs font-medium text-white hover:bg-rec/90 disabled:opacity-50"
          >
            {pending ? '제출 중…' : '요청 보내기'}
          </button>
        </footer>
      </form>
    </div>
  );
}
