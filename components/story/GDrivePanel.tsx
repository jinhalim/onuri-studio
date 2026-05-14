'use client';

import { useCallback, useRef, useState } from 'react';
import { X, ExternalLink, AlertTriangle, GripVertical, RefreshCw } from 'lucide-react';
import type { GDriveFileShape } from '@/components/canvas/gdriveShapeUtil';
import { buildGdriveEmbedUrl, labelForGdriveMime } from '@/lib/usecases/parse-gdrive-url';
import { refreshGdriveFileName } from '@/lib/client/gdrive-attach-flow';
import type { Editor } from '@/lib/editor';
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
  /**
   * 편집 권한. false 면 Sheets/Docs/Slides 의 /edit URL 대신 /preview 로 강제 →
   * 읽기 모드로 들어온 사용자가 iframe 안 편집 UI 자체를 못 보게 한다 (defense in depth).
   * Drive 자체 권한 (anyone-with-link reader) 이 1차 방어선, 본 prop 이 2차.
   */
  canEdit: boolean;
  /** tldraw Editor 인스턴스. <Tldraw> 바깥이라 useEditor() 못 써서 prop 으로 받음. */
  editor: Editor | null;
  className?: string;
}

export function GDrivePanel({
  shape,
  width,
  onWidthChange,
  minWidth = 280,
  maxWidth = 1000,
  onClose,
  canEdit,
  editor,
  className,
}: GDrivePanelProps) {
  const { fileName, mimeType, imported, fileId } = shape.props;
  const label = labelForGdriveMime(mimeType);
  // shape.props.embedUrl 은 첨부 시점에 결정된 URL (보통 /edit). canEdit 기반 재계산해서
  // 읽기 모드 사용자에게는 항상 /preview 가 가도록 한다.
  const embedUrl = fileId ? buildGdriveEmbedUrl(fileId, mimeType, !canEdit) : shape.props.embedUrl;
  // 새 탭 열기는 항상 원본 (편집 모드) — 그 사용자에게 Drive 권한이 있다면 거기서 편집 가능.
  // Drive 가 자체 권한 검증해서 차단해주므로 안전.
  const externalUrl = fileId ? buildGdriveEmbedUrl(fileId, mimeType, false).replace('?usp=sharing&rm=embedded', '') : shape.props.embedUrl.replace('?usp=sharing&rm=embedded', '');

  // 드래그 상태 — iframe 위에 transparent overlay 를 띄워서 iframe 이 pointer 이벤트를
  // 가로채지 못하게 한다. iframe 이 pointerup 을 흡수하면 마우스 떼도 드래그가 안 끝남 (버그).
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  // Drive → 캔버스 이름 sync. iframe 안에서 사용자가 Sheets/Docs 의 title bar 로 이름
  // 바꿔도 캔버스 라벨에 자동 반영 안 됨 (Google 이 push 안 줌) → 본 버튼으로 수동 sync.
  const [refreshState, setRefreshState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [refreshHint, setRefreshHint] = useState<string | null>(null);
  const handleRefreshName = useCallback(async () => {
    if (!fileId || imported || !editor) return;
    setRefreshState('loading');
    setRefreshHint(null);
    const res = await refreshGdriveFileName(fileId);
    if (res.ok) {
      if (res.name === shape.props.fileName) {
        setRefreshState('done');
        setRefreshHint('Drive 와 동일');
      } else {
        editor.updateShapes([
          {
            id: shape.id,
            type: shape.type,
            props: { ...shape.props, fileName: res.name },
          },
        ] as unknown as Parameters<typeof editor.updateShapes>[0]);
        setRefreshState('done');
        setRefreshHint(`'${res.name}' 로 업데이트`);
      }
    } else {
      setRefreshState('error');
      setRefreshHint(res.message);
    }
    // 2초 뒤 hint 사라짐
    window.setTimeout(() => {
      setRefreshState('idle');
      setRefreshHint(null);
    }, 2500);
  }, [editor, fileId, imported, shape.id, shape.type, shape.props]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current = { startX: e.clientX, startWidth: width };
      setIsDragging(true);
    },
    [width],
  );

  // overlay 의 pointermove — drag 중에만 활성. width 계산만 하고 cleanup 안 함.
  const onOverlayMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const s = dragStateRef.current;
      if (!s) return;
      // 패널이 캔버스 오른쪽 → 마우스 왼쪽 이동 = 폭 증가, 오른쪽 = 감소.
      const next = s.startWidth - (e.clientX - s.startX);
      onWidthChange(Math.max(minWidth, Math.min(maxWidth, next)));
    },
    [minWidth, maxWidth, onWidthChange],
  );

  // overlay 의 pointerup / cancel — drag 종료.
  const onOverlayUp = useCallback(() => {
    dragStateRef.current = null;
    setIsDragging(false);
  }, []);

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

      {/* 드래그 중 fullscreen overlay — iframe 위를 덮어서 pointer 이벤트 가로채기 차단.
          iframe 이 pointerup 을 흡수하는 버그 해결. drag 중에만 mount. */}
      {isDragging && (
        <div
          onPointerMove={onOverlayMove}
          onPointerUp={onOverlayUp}
          onPointerCancel={onOverlayUp}
          className="fixed inset-0 z-[300]"
          style={{ cursor: 'ew-resize', userSelect: 'none', touchAction: 'none' }}
          aria-hidden
        />
      )}
      {/* 헤더 */}
      <header className="flex items-center gap-2 border-b border-divider bg-brand-surface/50 px-3 py-2">
        <span className="flex-shrink-0 rounded-sm bg-live/15 px-2 py-0.5 text-[10px] font-semibold text-live">
          {label}
        </span>
        <h2 className="flex-1 truncate text-sm font-semibold text-fg" title={fileName}>
          {fileName}
        </h2>
        {!imported && fileId && (
          <button
            type="button"
            onClick={handleRefreshName}
            disabled={refreshState === 'loading'}
            title={
              refreshHint
                ? refreshHint
                : 'Drive 에서 현재 이름 다시 가져오기 (iframe 안에서 rename 한 경우)'
            }
            aria-label="Drive 에서 이름 다시 가져오기"
            className={cn(
              'rounded-sm p-1 hover:bg-brand-bezel',
              refreshState === 'error' ? 'text-rec' : 'text-fg-muted hover:text-fg',
              refreshState === 'done' && 'text-live',
            )}
          >
            <RefreshCw
              size={14}
              className={refreshState === 'loading' ? 'animate-spin' : undefined}
            />
          </button>
        )}
        {!imported && fileId && (
          <a
            href={externalUrl}
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
            // sandbox 확장: allow-presentation (Cast/Chromecast 동작 위해 필요 — 없으면
            // PresentationRequest sandboxed 콘솔 에러). allow-modals (Drive 의 dialog).
            // allow-downloads (파일 받기). 모두 Google 의 trusted iframe 이라 안전.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-modals allow-downloads"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )}
      </div>
    </aside>
  );
}
