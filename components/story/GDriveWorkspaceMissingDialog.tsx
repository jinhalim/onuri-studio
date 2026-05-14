'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FolderTree, ExternalLink, X, Check } from 'lucide-react';
import { setGdriveWorkspaceAction } from '@/app/actions/set-gdrive-workspace';
import { DEFAULT_WORKSPACE_PATH } from '@/lib/domain/gdrive';
import { cn } from '@/lib/utils';

// D-018 Phase 8b — Workspace 미설정 안내 (#3 Hybrid).
// 두 가지 옵션:
//   1) 지금 빠르게 설정: 기본 경로 `/onuri-studio` 로 자동 저장 → 다음 첨부 시 폴더 생성
//   2) 마이페이지에서 직접 설정: 사용자가 path 변경/조정

interface Props {
  onClose: () => void;
  /** 빠른 설정 성공 후 콜백 (보통 attach flow 재시도). */
  onQuickSetupDone?: () => void;
}

export function GDriveWorkspaceMissingDialog({ onClose, onQuickSetupDone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleQuickSetup = () => {
    setError(null);
    startTransition(async () => {
      const res = await setGdriveWorkspaceAction({
        path: DEFAULT_WORKSPACE_PATH,
        folderId: null,
      });
      if (!res.ok) {
        setError(res.error ?? '설정 실패');
        return;
      }
      router.refresh();
      onQuickSetupDone?.();
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ws-missing-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
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
          <X size={16} />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <FolderTree className="text-live" size={20} aria-hidden />
          <h2 id="ws-missing-title" className="text-lg font-bold text-fg">
            Drive Workspace 가 설정되지 않았어요
          </h2>
        </div>

        <p className="mb-5 text-sm text-fg-muted">
          Drive 파일 첨부를 위해 Google Drive 안에 폴더 위치를 정해주세요.
          정해진 경로 아래에 채널/스토리별 폴더가 자동으로 생성됩니다.
        </p>

        {error && (
          <p className="mb-3 rounded-sm bg-rec/15 px-3 py-2 text-xs text-rec">{error}</p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleQuickSetup}
            disabled={pending}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-md',
              'bg-live px-4 py-2.5 text-sm font-semibold text-brand-bezel',
              'hover:brightness-110 disabled:opacity-50',
            )}
          >
            <Check size={14} />
            {pending ? '설정 중…' : `지금 빠르게 설정 (${DEFAULT_WORKSPACE_PATH})`}
          </button>
          <p className="px-3 text-[11px] text-fg-muted/80">
            ↳ 기본 경로로 저장. 실제 Drive 폴더는 첫 번째 첨부 시 자동 생성됩니다.
          </p>

          <button
            type="button"
            onClick={() => {
              router.push('/me');
              onClose();
            }}
            disabled={pending}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-md',
              'border border-divider bg-brand-surface px-4 py-2.5 text-sm font-semibold text-fg',
              'hover:bg-brand-surface/70 disabled:opacity-50',
            )}
          >
            <ExternalLink size={14} />
            마이페이지에서 직접 설정
          </button>
          <p className="px-3 text-[11px] text-fg-muted/80">
            ↳ 다른 경로 / 기존 폴더 재사용 등 자세한 설정.
          </p>

          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="mt-1 rounded-md px-4 py-2 text-sm text-fg-muted hover:bg-brand-surface disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
