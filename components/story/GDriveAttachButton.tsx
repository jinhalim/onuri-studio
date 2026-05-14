'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { FileSpreadsheet, FolderTree, FolderOpen, Link2, X, ExternalLink } from 'lucide-react';
import type { Editor } from '@/lib/editor';
import {
  parseGdriveUrl,
  labelForGdriveMime,
} from '@/lib/usecases/parse-gdrive-url';
import {
  runDriveAttachFlow,
  ensureGdriveFoldersOnly,
  type AttachedFileResult,
} from '@/lib/client/gdrive-attach-flow';
import type { GDriveWorkspace } from '@/lib/domain/gdrive';
import { GDriveWorkspaceMissingDialog } from './GDriveWorkspaceMissingDialog';
import { cn } from '@/lib/utils';

// D-018 — Drive 파일 첨부 버튼.
// Phase 8b 흐름:
//   1) 클릭 → choice dialog (Picker / URL 직접)
//   2a) Picker → workspace 검증 → runDriveAttachFlow → 결과로 tldraw shape 생성
//   2b) URL → 기존 Phase 8a paste 모달 (변경 없음)
//   3) workspace 미설정 시 Picker 선택하면 Hybrid 안내 (#3)

interface GDriveAttachButtonProps {
  editorRef: RefObject<Editor | null>;
  /** Google 연동 사용자만 첨부 가능. 익명/canEdit false 면 비활성. */
  disabled?: boolean;
  /** 사용자의 Drive Workspace (마이페이지에서 설정). 없으면 #3 Hybrid 안내. */
  workspace: GDriveWorkspace | null;
  channelId: string;
  channelName: string;
  storyId: string;
  storyTitle: string;
}

type Stage =
  | { kind: 'idle' }
  | { kind: 'choice' }
  | { kind: 'url-modal' }
  | { kind: 'workspace-missing' }
  | { kind: 'picker-running' }
  | { kind: 'open-folder-running' }
  | { kind: 'error'; message: string };

export function GDriveAttachButton({
  editorRef,
  disabled,
  workspace,
  channelId,
  channelName,
  storyId,
  storyTitle,
}: GDriveAttachButtonProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });

  const openChoice = () => setStage({ kind: 'choice' });
  const close = () => setStage({ kind: 'idle' });

  // 캔버스에 attached file 들을 shape 로 추가.
  const addShapesToCanvas = (files: AttachedFileResult[]) => {
    const ed = editorRef.current;
    if (!ed) return;
    const viewport = ed.getViewportPageBounds();
    files.forEach((f, idx) => {
      const x = viewport.midX - 70 + idx * 24;
      const y = viewport.midY - 70 + idx * 24;
      ed.createShape({
        type: 'gdrive-file',
        x,
        y,
        props: {
          w: 140,
          h: 140,
          fileId: f.gdriveFileId,
          fileName: f.fileName,
          mimeType: f.mimeType,
          imported: false,
          embedUrl: f.embedUrl,
        },
      } as unknown as Parameters<Editor['createShape']>[0]);
    });
  };

  const runPicker = async () => {
    if (!workspace) {
      setStage({ kind: 'workspace-missing' });
      return;
    }
    setStage({ kind: 'picker-running' });
    try {
      const res = await runDriveAttachFlow({
        workspace,
        channelId,
        channelName,
        storyId,
        storyTitle,
      });
      if (!res.ok) {
        setStage({ kind: 'error', message: res.error ?? '첨부 실패' });
        return;
      }
      if (res.files && res.files.length > 0) {
        addShapesToCanvas(res.files);
      }
      setStage({ kind: 'idle' });
    } catch (err) {
      setStage({
        kind: 'error',
        message: err instanceof Error ? err.message : '알 수 없는 오류',
      });
    }
  };

  // "Drive 폴더 열기" — ensure folders 후 새 탭으로 스토리 폴더 열기.
  // Picker SDK 안에서 폴더/파일 생성이 불가능하므로 Drive 웹 사이트에서 직접 생성하라는 흐름.
  const runOpenFolder = async () => {
    if (!workspace) {
      setStage({ kind: 'workspace-missing' });
      return;
    }
    setStage({ kind: 'open-folder-running' });
    try {
      const res = await ensureGdriveFoldersOnly({
        workspace,
        channelId,
        channelName,
        storyId,
        storyTitle,
      });
      if (!res.ok || !res.storyFolderId) {
        setStage({ kind: 'error', message: res.error ?? '폴더 준비 실패' });
        return;
      }
      // 새 탭으로 Drive 의 스토리 폴더 열기
      window.open(
        `https://drive.google.com/drive/folders/${res.storyFolderId}`,
        '_blank',
        'noopener,noreferrer',
      );
      setStage({ kind: 'idle' });
    } catch (err) {
      setStage({
        kind: 'error',
        message: err instanceof Error ? err.message : '알 수 없는 오류',
      });
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={openChoice}
        title="Google Drive 파일 첨부"
        className={cn(
          'inline-flex items-center gap-1 rounded-sm border border-divider px-2 py-1',
          'text-xs text-fg-muted hover:border-live/60 hover:text-fg',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        <FileSpreadsheet size={12} />
        <span>Drive 첨부</span>
      </button>

      {stage.kind === 'choice' && (
        <ChoiceDialog
          onOpenFolder={runOpenFolder}
          onPicker={runPicker}
          onUrlMode={() => setStage({ kind: 'url-modal' })}
          onClose={close}
        />
      )}

      {stage.kind === 'url-modal' && (
        <UrlPasteDialog editorRef={editorRef} onClose={close} />
      )}

      {stage.kind === 'workspace-missing' && (
        <GDriveWorkspaceMissingDialog
          onClose={close}
          onQuickSetupDone={runPicker}
        />
      )}

      {stage.kind === 'picker-running' && <RunningOverlay label="Picker 준비 중…" hint="폴더 확인 / Picker 띄움 / Shortcut 생성을 진행하고 있어요." />}

      {stage.kind === 'open-folder-running' && <RunningOverlay label="Drive 폴더 준비 중…" hint="폴더 구조 확인 후 새 탭으로 이동합니다." />}

      {stage.kind === 'error' && (
        <ErrorDialog message={stage.message} onClose={close} />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Choice Dialog — Picker vs URL
// ──────────────────────────────────────────────────────────────────────────────

function ChoiceDialog({
  onOpenFolder,
  onPicker,
  onUrlMode,
  onClose,
}: {
  onOpenFolder: () => void;
  onPicker: () => void;
  onUrlMode: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdrive-choice-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-lg border border-divider bg-brand-bezel p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 rounded-sm p-1 text-fg-muted hover:bg-brand-surface hover:text-fg"
        >
          <X size={16} />
        </button>
        <h2 id="gdrive-choice-title" className="mb-2 text-lg font-bold text-fg">
          Drive 파일 첨부 방식
        </h2>
        <p className="mb-5 text-sm text-fg-muted">
          어떻게 첨부할까요?
        </p>

        <div className="flex flex-col gap-2">
          {/* 1) Drive 폴더 열기 — 새 파일/폴더는 Drive 웹 사이트에서만 생성 가능.
              이 옵션이 그 위치로 직접 보내는 link. 사용자가 거기서 파일 만든 후
              아래 Picker 옵션으로 와서 첨부. */}
          <button
            type="button"
            onClick={onOpenFolder}
            className={cn(
              'flex flex-col items-start gap-1 rounded-md border border-live/40 bg-live/10 p-3 text-left',
              'hover:border-live/60 hover:bg-live/15 transition-colors',
            )}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
              <FolderOpen size={14} className="text-live" />
              Drive 폴더 열기 (새 파일 만들기)
              <ExternalLink size={11} className="text-fg-muted" />
            </span>
            <span className="text-[11px] text-fg-muted">
              스토리의 Drive 폴더를 새 탭으로 열어요. 거기서 새 문서/시트/슬라이드를
              만든 후 다시 와서 아래 &ldquo;Picker&rdquo; 로 첨부하세요. (Picker SDK 자체엔 폴더/파일
              생성 기능이 없어요)
            </span>
          </button>

          {/* 2) Picker — 기존 파일 첨부 */}
          <button
            type="button"
            onClick={onPicker}
            className={cn(
              'flex flex-col items-start gap-1 rounded-md border border-divider bg-brand-surface p-3 text-left',
              'hover:border-live/60 hover:bg-brand-surface/70 transition-colors',
            )}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
              <FolderTree size={14} className="text-live" />내 Drive 에서 선택 (Picker)
            </span>
            <span className="text-[11px] text-fg-muted">
              Google Picker 로 내 Drive 파일 탐색 + 첨부. 폴더 구조 자동 생성 + 협업자
              viewer 권한 share. 시작 위치는 스토리 폴더.
            </span>
          </button>

          {/* 3) URL 직접 입력 */}
          <button
            type="button"
            onClick={onUrlMode}
            className={cn(
              'flex flex-col items-start gap-1 rounded-md border border-divider bg-brand-surface p-3 text-left',
              'hover:border-live/60 hover:bg-brand-surface/70 transition-colors',
            )}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg">
              <Link2 size={14} className="text-live" />URL 로 직접 입력
            </span>
            <span className="text-[11px] text-fg-muted">
              Drive 공유 링크 붙여넣기. 폴더 구조에 포함되지 않고 metadata 만 저장.
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-1 rounded-md px-4 py-2 text-sm text-fg-muted hover:bg-brand-surface"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// URL Paste Dialog (Phase 8a 그대로 유지)
// ──────────────────────────────────────────────────────────────────────────────

function UrlPasteDialog({
  editorRef,
  onClose,
}: {
  editorRef: RefObject<Editor | null>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parsed = url.trim() ? parseGdriveUrl(url) : null;
  const detectedLabel = parsed ? labelForGdriveMime(parsed.mimeType) : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsedNow = parseGdriveUrl(url);
    if (!parsedNow) {
      setError('Drive / Sheets / Docs / Slides 공유 링크 형식이 아니에요.');
      return;
    }
    const ed = editorRef.current;
    if (!ed) {
      setError('캔버스 준비 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const name = fileName.trim() || labelForGdriveMime(parsedNow.mimeType);
    const viewport = ed.getViewportPageBounds();
    const offset = ed.getCurrentPageShapes().length * 12;
    const x = viewport.midX - 70 + offset;
    const y = viewport.midY - 70 + offset;

    ed.createShape({
      type: 'gdrive-file',
      x,
      y,
      props: {
        w: 140,
        h: 140,
        fileId: parsedNow.fileId,
        fileName: name,
        mimeType: parsedNow.mimeType,
        imported: false,
        embedUrl: parsedNow.embedUrl,
      },
    } as unknown as Parameters<Editor['createShape']>[0]);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdrive-url-title"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-lg border border-divider bg-brand-bezel p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 rounded-sm p-1 text-fg-muted hover:bg-brand-surface hover:text-fg"
        >
          <X size={16} />
        </button>
        <h2 id="gdrive-url-title" className="mb-2 text-lg font-bold text-fg">
          URL 로 첨부
        </h2>
        <p className="mb-4 text-xs text-fg-muted">
          Drive / Sheets / Docs / Slides 의 공유 링크를 붙여넣으면 카드가 추가돼요.
          폴더 구조 / Shortcut / share 없이 metadata 만 저장됩니다.
        </p>

        <label className="mb-3 flex flex-col gap-1">
          <span className="text-xs text-fg-muted">공유 URL *</span>
          <input
            ref={inputRef}
            type="url"
            required
            placeholder="https://docs.google.com/spreadsheets/d/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="rounded-md border border-divider bg-brand-surface px-3 py-2 text-sm text-fg focus:border-live/60 focus:outline-none"
          />
          {parsed && (
            <span className="text-[11px] text-emerald-500">
              ✓ {detectedLabel} 으로 인식됨 (file id: {parsed.fileId.slice(0, 8)}…)
            </span>
          )}
        </label>

        <label className="mb-4 flex flex-col gap-1">
          <span className="text-xs text-fg-muted">표시 이름 (선택)</span>
          <input
            type="text"
            placeholder="(비워두면 파일 종류로 표시)"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            className="rounded-md border border-divider bg-brand-surface px-3 py-2 text-sm text-fg focus:border-live/60 focus:outline-none"
          />
        </label>

        {error && (
          <p className="mb-3 rounded-sm bg-rec/15 px-3 py-2 text-xs text-rec">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-brand-surface"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!parsed}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-4 py-2 text-sm font-semibold',
              'bg-live text-brand-bezel hover:brightness-110',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            첨부
          </button>
        </div>
      </form>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Picker 진행 중 / Error 다이얼로그
// ──────────────────────────────────────────────────────────────────────────────

function RunningOverlay({ label, hint }: { label: string; hint: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50"
    >
      <div className="rounded-lg border border-divider bg-brand-bezel px-6 py-4 shadow-2xl">
        <p className="text-sm text-fg">{label}</p>
        <p className="mt-1 text-[11px] text-fg-muted">{hint}</p>
      </div>
    </div>
  );
}

function ErrorDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-lg border border-rec/40 bg-brand-bezel p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3 top-3 rounded-sm p-1 text-fg-muted hover:bg-brand-surface hover:text-fg"
        >
          <X size={16} />
        </button>
        <h2 className="mb-3 text-lg font-bold text-rec">Drive 첨부 실패</h2>
        <p className="mb-4 text-sm text-fg-muted whitespace-pre-line">{message}</p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-brand-surface px-4 py-2 text-sm text-fg hover:bg-brand-surface/70"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
