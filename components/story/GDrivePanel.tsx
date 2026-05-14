'use client';

import { useCallback, useRef } from 'react';
import { X, ExternalLink, AlertTriangle, GripVertical } from 'lucide-react';
import type { GDriveFileShape } from '@/components/canvas/gdriveShapeUtil';
import { labelForGdriveMime } from '@/lib/usecases/parse-gdrive-url';
import { cn } from '@/lib/utils';

// D-018 Phase 8a — 캔버스 우측 split-screen iframe 패널.
// 선택된 gdrive-file shape 의 embedUrl 을 iframe 으로 표시.
//
// imported=true 인 shape (외부 import 로 들어옴) 는 iframe 안 띄움 — 안내 메시지만.
//
// 너비는 부모(StoryWorkspace)가 state 로 관리. 좌측 핸들 드래그로 width 조정 가능.

interface GDrivePanelProps {
  shape: GDriveFileShape;
  width: number;
  onWidthChange: (next: number) => void;
  /** min/max 클램핑 — viewport 기준 동적 계산은 부모가 처리. */
  minWidth?: number;
  maxWidth?: number;
  onClose: () => void;
  className?: string;
}

export function GDrivePanel({
  shape,
  width,
  onWidthChange,
  minWidth = 280,
  maxWidth = 1000,
  onClose,
  className,
}: GDrivePanelProps) {
  const { fileName, mimeType, embedUrl, imported, fileId } = shape.props;
  const label = labelForGdriveMime(mimeType);

  // 드래그 시작 시점의 pointer X + width 를 capture, document-level pointermove/up 으로
  // 핸들 밖에 마우스 나가도 안정적으로 추적. iframe 위로 마우스 가도 capture 됨.
  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current = { startX: e.clientX, startWidth: width };

      const handleMove = (ev: PointerEvent) => {
        const s = dragStateRef.current;
        if (!s) return;
        // 패널이 캔버스 오른쪽에 있으니 마우스 왼쪽으로 가면 폭 증가, 오른쪽 가면 감소.
        const next = s.startWidth - (ev.clientX - s.startX);
        onWidthChange(Math.max(minWidth, Math.min(maxWidth, next)));
      };
      const handleUp = () => {
        dragStateRef.current = null;
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        document.removeEventListener('pointercancel', handleUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      document.addEventListener('pointercancel', handleUp);
      // 드래그 중 본문 텍스트 선택 + iframe 안 hover 효과 차단
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    },
    [width, minWidth, maxWidth, onWidthChange],
  );

  return (
    <aside
      style={{ width: `${width}px`, flexShrink: 0 }}
      className={cn(
        'relative flex h-full flex-col border-l border-divider bg-brand-bezel',
        className,
      )}
    >
      {/* 좌측 resize 핸들 — 패널 왼쪽 가장자리에 absolute 로 배치, 4px 너비 +
          호버/드래그 시 강조. iframe 위에 떠 있어야 하니 z-10. */}
      <div
        onPointerDown={onPointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 너비 조정"
        title="드래그해서 너비 조정"
        className={cn(
          'absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-ew-resize',
          'group flex items-center justify-center',
          // 핸들 보이는 영역 — hover 시 강조
          'hover:bg-live/30 active:bg-live/50',
          'transition-colors',
        )}
        style={{ touchAction: 'none' }}
      >
        {/* hover 시 표시될 grip 아이콘 (중앙) */}
        <GripVertical
          size={14}
          className="opacity-0 transition-opacity group-hover:opacity-60"
          aria-hidden
        />
      </div>
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
