'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Tldraw,
  type Editor,
  type StoreSnapshot,
  type TLRecord,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { saveStorySnapshotAction } from '@/app/actions/save-story-snapshot';
import type { PresenceState, SyncPayload } from '@/lib/hooks/useStoryRealtime';
import { PresenceLayer } from './PresenceLayer';
import { cn } from '@/lib/utils';

const AUTOSAVE_DEBOUNCE_MS = 5_000;
const CURSOR_THROTTLE_MS = 33; // ~30Hz
const DRAWING_RESET_MS = 800;

// 캔버스 본체. realtime 구독은 StoryWorkspace 가 관리하고
// 본 컴포넌트는 broadcast/updatePresence 콜백을 받아 사용한다.
//
// 화면 표시:
// - 좌상단: PresenceLayer (다른 사용자 커서) — tldraw UI 위에 띄우지 않음 (z-index 조정)
// - 우상단: 저장 인디케이터 / 읽기 전용 배지 (작은 floating)
// PresenceList / OnAir / RealtimeStatus 는 부모(StoryWorkspace) 헤더에서 처리.

interface StudioCanvasProps {
  storyId: string;
  initialSnapshotJson: string | null;
  canEdit: boolean;
  presences: PresenceState[];
  currentUserId: string;
  broadcast: (changes: Omit<SyncPayload, 'fromUserId'>) => void;
  updatePresence: (
    partial: Partial<Omit<PresenceState, 'userId' | 'nickname' | 'color'>>,
  ) => void;
  /** editor 인스턴스가 마운트/언마운트 될 때 부모에 알림 (handleRemoteSync 용). */
  onEditorMount: (editor: Editor | null) => void;
  /** 본인이 그리는 중 상태 변화 (channel-level presence 동기화용). */
  onLocalDrawingChange: (isDrawing: boolean) => void;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function StudioCanvas({
  storyId,
  initialSnapshotJson,
  canEdit,
  presences,
  currentUserId,
  broadcast,
  updatePresence,
  onEditorMount,
  onLocalDrawingChange,
}: StudioCanvasProps) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimerRef = useRef<number>(0);
  const drawingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSave = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed || !canEdit) return;
    setStatus('saving');
    setErrorMsg(null);
    try {
      const snapshot = ed.store.getStoreSnapshot();
      const json = JSON.stringify(snapshot);
      const result = await saveStorySnapshotAction(storyId, json);
      if (!result.ok) {
        setStatus('error');
        setErrorMsg(result.error ?? 'unknown');
        return;
      }
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      console.error('[StudioCanvas] save 실패:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'unknown');
    }
  }, [storyId, canEdit]);

  const handleStoreChange = useCallback(
    (entry: {
      source: 'user' | 'remote';
      changes: {
        added: Record<string, TLRecord>;
        updated: Record<string, [TLRecord, TLRecord]>;
        removed: Record<string, TLRecord>;
      };
    }) => {
      if (entry.source !== 'user') return;

      const added = Object.values(entry.changes.added);
      const updated = Object.values(entry.changes.updated).map(([, next]) => next);
      const removed = Object.keys(entry.changes.removed);

      if (added.length || updated.length || removed.length) {
        broadcast({ added, updated, removed });
      }

      // On Air 표시
      updatePresence({ isDrawing: true });
      onLocalDrawingChange(true);
      if (drawingResetRef.current) clearTimeout(drawingResetRef.current);
      drawingResetRef.current = setTimeout(() => {
        updatePresence({ isDrawing: false });
        onLocalDrawingChange(false);
      }, DRAWING_RESET_MS);

      // 자동 저장 (소유자만)
      if (canEdit) {
        setStatus('pending');
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS);
      }
    },
    [broadcast, updatePresence, onLocalDrawingChange, canEdit, flushSave],
  );

  const handleMount = useCallback(
    (ed: Editor) => {
      editorRef.current = ed;
      setEditor(ed);
      onEditorMount(ed);

      if (initialSnapshotJson) {
        try {
          const parsed = JSON.parse(initialSnapshotJson) as StoreSnapshot<TLRecord>;
          ed.store.loadStoreSnapshot(parsed);
        } catch (err) {
          console.warn('[StudioCanvas] 초기 snapshot 파싱 실패, 빈 캔버스로 시작:', err);
        }
      }

      if (!canEdit) {
        ed.updateInstanceState({ isReadonly: true });
      }

      const unsubscribe = ed.store.listen(handleStoreChange, {
        source: 'user',
        scope: 'document',
      });

      // 포인터 이동 → presence cursor (30Hz 스로틀)
      ed.on('event', (info) => {
        if (info.type === 'pointer' && info.name === 'pointer_move') {
          const now = Date.now();
          if (now - cursorTimerRef.current < CURSOR_THROTTLE_MS) return;
          cursorTimerRef.current = now;
          const point = ed.inputs.currentPagePoint;
          updatePresence({ cursor: { x: point.x, y: point.y } });
        }
      });

      return unsubscribe;
    },
    [initialSnapshotJson, canEdit, handleStoreChange, updatePresence, onEditorMount],
  );

  // unmount 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (drawingResetRef.current) clearTimeout(drawingResetRef.current);
      onEditorMount(null);
    };
    // onEditorMount는 매번 변하지 않는다고 가정 (StoryWorkspace에서 ref 캡처)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full">
      <Tldraw onMount={handleMount} />
      <PresenceLayer presences={presences} editor={editor} currentUserId={currentUserId} />

      {/* 우상단: 저장 인디케이터 / 읽기 전용 배지만 (다른 정보는 헤더로) */}
      <div className="pointer-events-none absolute right-4 top-4 z-50 flex flex-col items-end gap-2">
        {canEdit && <SaveIndicator status={status} errorMsg={errorMsg} onRetry={flushSave} />}
        {!canEdit && <ReadOnlyBadge />}
      </div>
    </div>
  );
}

function SaveIndicator({
  status,
  errorMsg,
  onRetry,
}: {
  status: SaveStatus;
  errorMsg: string | null;
  onRetry: () => void;
}) {
  const label =
    status === 'saving' ? '저장 중…'
    : status === 'pending' ? '편집 중 (5초 후 저장)'
    : status === 'saved' ? '저장됨'
    : status === 'error' ? `오류: ${errorMsg ?? ''}`
    : null;

  if (!label) return null;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          status === 'error' && 'rounded-sm border border-rec/40 bg-rec/10 px-3 py-1 text-xs text-rec',
          status === 'saved' && 'rounded-sm border border-live/40 bg-live/10 px-3 py-1 text-xs text-live',
          (status === 'saving' || status === 'pending') &&
            'rounded-sm border border-divider bg-brand-bezel/80 px-3 py-1 text-xs text-fg-muted backdrop-blur-sm',
        )}
      >
        {label}
      </div>
      {status === 'error' && (
        <button
          type="button"
          onClick={onRetry}
          className="pointer-events-auto rounded-sm border border-rec/40 bg-rec px-2 py-1 text-xs font-medium text-fg hover:brightness-110"
        >
          재시도
        </button>
      )}
    </div>
  );
}

function ReadOnlyBadge() {
  return (
    <div className="rounded-sm border border-divider bg-brand-bezel/80 px-3 py-1 text-xs text-fg-muted backdrop-blur-sm">
      읽기 전용 (방문자 모드)
    </div>
  );
}
