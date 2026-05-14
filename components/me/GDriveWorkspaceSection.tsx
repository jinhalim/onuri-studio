'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FolderTree, Edit2, Check, X, AlertTriangle, ExternalLink } from 'lucide-react';
import {
  DEFAULT_WORKSPACE_PATH,
  isValidWorkspacePath,
  type GDriveWorkspace,
} from '@/lib/domain/gdrive';
import { setGdriveWorkspaceAction } from '@/app/actions/set-gdrive-workspace';
import { cn } from '@/lib/utils';

// D-018 Phase 8b: 마이페이지의 Drive Workspace 설정 섹션.
// Google 연동 사용자한테만 표시됨 (부모가 분기).
//
// 동작:
// 1) 현재 workspace 표시 (path + 검증 상태)
// 2) "수정" 클릭 → modal 로 path 입력
// 3) "저장" → server action 호출 (folderId 는 null 로 — 실제 검증은 Drive 첨부 시점)
//    folderId 가 null 이면 첨부 시 Picker 가 폴더를 만들거나 찾아서 갱신.

interface GDriveWorkspaceSectionProps {
  workspace: GDriveWorkspace | null;
}

export function GDriveWorkspaceSection({ workspace }: GDriveWorkspaceSectionProps) {
  const [editing, setEditing] = useState(false);
  const hasWorkspace = workspace !== null;
  const isVerified = workspace?.folderId !== null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-fg-muted">Drive Workspace</h2>
        <span className="text-[11px] text-fg-muted/70">Google Drive 연동 첨부 시 사용</span>
      </div>

      <div className="rounded-md border border-divider bg-brand-surface/50 p-4">
        {hasWorkspace ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <FolderTree className="mt-0.5 flex-shrink-0 text-live" size={18} aria-hidden />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <code className="rounded bg-brand-bezel px-2 py-0.5 font-mono text-sm text-fg">
                    {workspace.path}
                  </code>
                  {isVerified ? (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-500">
                      <Check size={11} /> Drive 연결됨
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-500">
                      <AlertTriangle size={11} /> 첫 첨부 시 자동 생성/연결
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-fg-muted/80">
                  채널/스토리 첨부 시 이 경로 아래에{' '}
                  <code className="font-mono">{'{채널} [{id}]/{스토리} [{id}]/'}</code> 폴더가 자동
                  생성됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded-sm border border-divider px-2 py-1 text-xs text-fg-muted hover:border-live/60 hover:text-fg"
              >
                <Edit2 size={11} />
                수정
              </button>
            </div>
            {workspace.folderId && (
              <a
                href={`https://drive.google.com/drive/folders/${workspace.folderId}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex w-fit items-center gap-1 text-[11px] text-live underline-offset-2 hover:underline"
              >
                <ExternalLink size={11} />
                Drive 에서 폴더 열기
              </a>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fg-muted">
              아직 설정되지 않았어요. Drive 파일 첨부 전에 폴더 위치를 정해주세요.
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex w-fit items-center gap-1.5 rounded-md bg-live px-3 py-2 text-sm font-semibold text-brand-bezel hover:brightness-110"
            >
              <FolderTree size={14} />
              Workspace 설정
            </button>
          </div>
        )}
      </div>

      {editing && (
        <WorkspaceEditDialog
          initialPath={workspace?.path ?? DEFAULT_WORKSPACE_PATH}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}

function WorkspaceEditDialog({
  initialPath,
  onClose,
}: {
  initialPath: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [path, setPath] = useState(initialPath);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidWorkspacePath(path)) {
      setError('경로 형식이 올바르지 않아요. /onuri-studio 처럼 시작은 /, 위험 문자 제외.');
      return;
    }
    startTransition(async () => {
      // 경로만 저장 — folderId 는 null 로 (다음 첨부 시 Picker SDK 가 실제 Drive 폴더 만들거나 찾음)
      const res = await setGdriveWorkspaceAction({ path: path.trim(), folderId: null });
      if (!res.ok) {
        setError(res.error ?? '저장 실패');
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ws-edit-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-lg border border-divider bg-brand-bezel p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          aria-label="닫기"
          className="absolute right-3 top-3 rounded-sm p-1 text-fg-muted hover:bg-brand-surface hover:text-fg disabled:opacity-50"
        >
          <X size={16} />
        </button>
        <h2 id="ws-edit-title" className="mb-2 text-lg font-bold text-fg">
          Workspace 경로 설정
        </h2>
        <p className="mb-4 text-xs text-fg-muted">
          Google Drive 안에서 onuri-studio 의 파일을 모아둘 폴더 경로를 정해주세요.
          이 폴더 아래에 채널/스토리 단위로 자동 생성됩니다.
        </p>

        <label className="mb-4 flex flex-col gap-1">
          <span className="text-xs text-fg-muted">경로 *</span>
          <input
            type="text"
            required
            placeholder={DEFAULT_WORKSPACE_PATH}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="rounded-md border border-divider bg-brand-surface px-3 py-2 font-mono text-sm text-fg focus:border-live/60 focus:outline-none"
          />
          <span className="text-[11px] text-fg-muted/70">
            예: <code>/onuri-studio</code>, <code>/work/onuri</code> — 시작은 /, 끝에 /는 빼주세요.
          </span>
        </label>

        {error && (
          <p className="mb-3 rounded-sm bg-rec/15 px-3 py-2 text-xs text-rec">{error}</p>
        )}

        <p className="mb-4 rounded-sm bg-live/10 px-3 py-2 text-[11px] text-fg-muted">
          ℹ 실제 Drive 폴더 생성/연결은 첫 번째 Drive 첨부 시점에 진행됩니다 (Google Picker
          가 Drive 권한 동의 + 폴더 생성을 함께 처리). 지금은 경로만 저장.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-brand-surface disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-4 py-2 text-sm font-semibold',
              'bg-live text-brand-bezel hover:brightness-110 disabled:opacity-50',
            )}
          >
            {pending ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </div>
  );
}
