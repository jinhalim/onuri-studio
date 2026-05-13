'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { FileSpreadsheet, X } from 'lucide-react';
import type { Editor } from '@/lib/editor';
import {
  parseGdriveUrl,
  labelForGdriveMime,
} from '@/lib/usecases/parse-gdrive-url';
import { cn } from '@/lib/utils';

// D-018 Phase 8a — Drive 파일 첨부 버튼 + URL paste 모달.
// 사용자가 Drive 공유 URL 을 붙여넣으면 우리 파서가 fileId / mimeType / embedUrl 추출 →
// 캔버스에 `gdrive-file` shape 생성.
//
// Phase 8b 도입 시: 본 모달을 Google Picker SDK 로 교체. shape 생성 흐름은 그대로 재사용.

interface GDriveAttachButtonProps {
  editorRef: RefObject<Editor | null>;
  disabled?: boolean;
}

export function GDriveAttachButton({ editorRef, disabled }: GDriveAttachButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
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

      {open && (
        <GDriveAttachDialog
          editorRef={editorRef}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function GDriveAttachDialog({
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
    const camera = ed.getCamera();
    const viewport = ed.getViewportPageBounds();
    // 화면 중앙에 배치 (대략) — 한 화면에 여러 shape 첨부 시 약간씩 옆으로 어긋나게.
    const offset = ed.getCurrentPageShapes().length * 12;
    const x = viewport.midX - 70 + offset;
    const y = viewport.midY - 70 + offset;

    // tldraw 의 createShape 는 built-in shape type union 으로 닫혀있어서 custom type
    // 'gdrive-file' 은 직접 안 받음. cast 로 우회 (실제 동작은 등록된 custom shape util 이 처리).
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
    // 사용 안 하는 변수 — TypeScript 경고 회피
    void camera;
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdrive-attach-title"
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
        <h2 id="gdrive-attach-title" className="mb-2 text-lg font-bold text-fg">
          Google Drive 파일 첨부
        </h2>
        <p className="mb-4 text-xs text-fg-muted">
          Drive / Sheets / Docs / Slides 의 공유 링크를 붙여넣으면 캔버스에 카드가 추가돼요.
          클릭하면 옆에 미리보기 / 편집 패널이 열립니다.
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
