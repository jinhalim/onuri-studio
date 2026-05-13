'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileImage, FileCode, FileJson } from 'lucide-react';
import type { Editor } from '@/lib/editor';
import {
  exportAsOnuriJson,
  exportAsPng,
  exportAsSvg,
} from '@/components/canvas/export-image';
import { cn } from '@/lib/utils';

interface ExportButtonProps {
  /** editor 인스턴스 — StoryWorkspace 가 onEditorMount 로 캡처해서 전달. */
  editorRef: { current: Editor | null };
  /** 다운로드 파일명 (확장자 자동). 보통 스토리 제목 사용. */
  fileName: string;
  /** .onuri.json export 시 meta.story.id 에 들어감 (가져오기 시 무시되지만 추적용). */
  storyId?: string;
  /** .onuri.json meta.exportedBy.nickname 에 들어감. */
  exporterNickname: string;
  /** .onuri.json meta.appVersion. */
  appVersion: string;
}

type Status = 'idle' | 'exporting' | 'empty' | 'error';

// 헤더의 작은 다운로드 버튼. 클릭 시 PNG / SVG 선택 드롭다운.
// LaserShareToggle 과 동일한 시각 패턴.

export function ExportButton({
  editorRef,
  fileName,
  storyId,
  exporterNickname,
  appVersion,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  // status 표시는 잠깐만 (1.5초)
  useEffect(() => {
    if (status === 'idle' || status === 'exporting') return;
    const timer = window.setTimeout(() => setStatus('idle'), 1500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const doExport = async (kind: 'png' | 'svg' | 'onuri') => {
    const ed = editorRef.current;
    if (!ed) return;
    setOpen(false);
    setStatus('exporting');
    let result;
    if (kind === 'png') {
      result = await exportAsPng(ed, fileName);
    } else if (kind === 'svg') {
      result = await exportAsSvg(ed, fileName);
    } else {
      // .onuri.json 은 빈 캔버스도 export 허용 (메타데이터만)
      result = exportAsOnuriJson(ed, fileName, storyId, exporterNickname, appVersion);
    }
    if (result.ok) {
      setStatus('idle');
    } else if (result.reason === 'empty') {
      setStatus('empty');
    } else {
      setStatus('error');
    }
  };

  const label =
    status === 'exporting' ? '내보내는 중…'
    : status === 'empty' ? '빈 캔버스'
    : status === 'error' ? '실패'
    : '내보내기';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={status === 'exporting'}
        title="이미지로 내보내기"
        className={cn(
          'flex items-center gap-1.5 rounded-sm border border-divider bg-brand-surface px-2.5 py-1',
          'text-xs text-fg-muted hover:text-fg',
          status === 'error' && 'border-rec/40 text-rec',
        )}
      >
        <Download size={12} />
        <span>{label}</span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-50 mt-1.5 min-w-[160px] rounded-sm border border-divider',
            'bg-brand-bezel shadow-lg',
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => doExport('png')}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-fg hover:bg-brand-surface"
          >
            <FileImage size={14} />
            <span>PNG 이미지</span>
            <span className="ml-auto text-fg-muted/70">@2x</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => doExport('svg')}
            className="flex w-full items-center gap-2 border-t border-divider px-3 py-2 text-left text-xs text-fg hover:bg-brand-surface"
          >
            <FileCode size={14} />
            <span>SVG 벡터</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => doExport('onuri')}
            className="flex w-full items-center gap-2 border-t border-divider px-3 py-2 text-left text-xs text-fg hover:bg-brand-surface"
          >
            <FileJson size={14} />
            <span>.onuri.json</span>
            <span className="ml-auto text-fg-muted/70">백업/이동</span>
          </button>
        </div>
      )}
    </div>
  );
}
