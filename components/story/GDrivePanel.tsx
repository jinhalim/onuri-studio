'use client';

import { X, ExternalLink, AlertTriangle } from 'lucide-react';
import type { GDriveFileShape } from '@/components/canvas/gdriveShapeUtil';
import { labelForGdriveMime } from '@/lib/usecases/parse-gdrive-url';
import { cn } from '@/lib/utils';

// D-018 Phase 8a — 캔버스 우측 split-screen iframe 패널.
// 선택된 gdrive-file shape 의 embedUrl 을 iframe 으로 표시.
//
// imported=true 인 shape (외부 import 로 들어옴) 는 iframe 안 띄움 — 안내 메시지만.

interface GDrivePanelProps {
  shape: GDriveFileShape;
  onClose: () => void;
  className?: string;
}

export function GDrivePanel({ shape, onClose, className }: GDrivePanelProps) {
  const { fileName, mimeType, embedUrl, imported, fileId } = shape.props;
  const label = labelForGdriveMime(mimeType);

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-l border-divider bg-brand-bezel',
        className,
      )}
    >
      {/* 헤더 */}
      <header className="flex items-center gap-2 border-b border-divider bg-brand-surface/50 px-3 py-2">
        <span className="flex-shrink-0 rounded-sm bg-live/15 px-2 py-0.5 text-[10px] font-semibold text-live">
          {label}
        </span>
        <h2 className="flex-1 truncate text-sm font-semibold text-fg" title={fileName}>
          {fileName}
        </h2>
        {!imported && fileId && (
          <a
            href={embedUrl.replace('?usp=sharing&rm=embedded', '')}
            target="_blank"
            rel="noreferrer noopener"
            title="Drive 에서 새 탭으로 열기"
            className="rounded-sm p-1 text-fg-muted hover:bg-brand-bezel hover:text-fg"
          >
            <ExternalLink size={14} />
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="패널 닫기"
          className="rounded-sm p-1 text-fg-muted hover:bg-brand-bezel hover:text-fg"
        >
          <X size={14} />
        </button>
      </header>

      {/* 본문 */}
      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        {imported || !fileId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle size={24} className="text-amber-500" aria-hidden />
            <p className="text-sm font-semibold text-fg-muted">
              외부 import — Drive 연동 안 됨
            </p>
            <p className="max-w-sm text-xs text-fg-muted/70">
              이 카드는 .onuri.json 가져오기로 들어온 항목입니다. 원본 파일에 대한 권한이
              없어서 미리보기/편집을 제공하지 않아요. 새 Drive 파일로 직접 첨부해주세요.
            </p>
          </div>
        ) : (
          <iframe
            src={embedUrl}
            title={fileName}
            className="h-full w-full border-0"
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}
      </div>
    </aside>
  );
}
