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
import { useStoryRealtime, type SyncPayload } from '@/lib/hooks/useStoryRealtime';
import { OnAirIndicator } from '@/components/brand/OnAirIndicator';
import { PresenceLayer } from './PresenceLayer';
import type { User } from '@/lib/domain/user';

const AUTOSAVE_DEBOUNCE_MS = 5_000;
const CURSOR_THROTTLE_MS = 33; // ~30Hz
const DRAWING_RESET_MS = 800; // 마지막 변경 후 0.8초 동안 그리는 중 표시

interface StudioCanvasProps {
  storyId: string;
  initialSnapshotJson: string | null;
  canEdit: boolean;
  /** 로그인한 사용자. 비로그인이면 null (이 경우 realtime 비활성). */
  user: User | null;
}

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function StudioCanvas({ storyId, initialSnapshotJson, canEdit, user }: StudioCanvasProps) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const editorRef = useRef<Editor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimerRef = useRef<number>(0);
  const drawingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 원격 sync 적용 (loop 방지: mergeRemoteChanges 안에서 적용 → 'user' source 안 씀)
  const handleRemoteSync = useCallback((payload: SyncPayload) => {
    const ed = editorRef.current;
    if (!ed) return;
    ed.store.mergeRemoteChanges(() => {
      try {
        if (payload.added && payload.added.length > 0) {
          ed.store.put(payload.added as TLRecord[]);
        }
        if (payload.updated && payload.updated.length > 0) {
          ed.store.put(payload.updated as TLRecord[]);
        }
        if (payload.removed && payload.removed.length > 0) {
          ed.store.remove(payload.removed as Parameters<typeof ed.store.remove>[0]);
        }
      } catch (err) {
        console.error('[StudioCanvas] 원격 변경 적용 실패:', err);
      }
    });
  }, []);

  // realtime: user가 있을 때만 의미있게 동작 (anonymous도 user 있음)
  // user가 null인 경우엔 realtime 비활성. 안전한 dummy 인자 전달 후 status='error' 로 두어도 무관.
  const realtimeUser = user ?? {
    id: '__anon__',
    nickname: '익명 방문자',
    color: '#9A9AA8',
    isAnonymous: true,
    primaryAuthProvider: 'anonymous' as const,
    linkedProviders: [],
    role: 'user' as const,
    email: null,
    createdAt: '',
    lastSeenAt: '',
  };

  const { presences, broadcast, updatePresence } = useStoryRealtime({
    storyId,
    user: realtimeUser,
    onSync: handleRemoteSync,
  });

  // 다른 사용자가 그리는 중인지 (On Air)
  const someoneDrawing = presences.some(
    (p) => p.userId !== realtimeUser.id && p.isDrawing,
  );

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

  // editor.on('change-history') / store listener → broadcast + autosave + isDrawing 토글
  const handleStoreChange = useCallback(
    (entry: { source: 'user' | 'remote'; changes: { added: Record<string, TLRecord>; updated: Record<string, [TLRecord, TLRecord]>; removed: Record<string, TLRecord> } }) => {
      // 사용자 본인 변경만 처리. 'remote' source 는 우리가 mergeRemoteChanges 로 적용한 것이라 무시.
      if (entry.source !== 'user') return;

      const added = Object.values(entry.changes.added);
      const updated = Object.values(entry.changes.updated).map(([, next]) => next);
      const removed = Object.keys(entry.changes.removed);

      // 1) broadcast (편집 권한과 무관하게 — 방문자는 어차피 변경 자체가 안 일어남)
      if (added.length || updated.length || removed.length) {
        broadcast({ added, updated, removed });
      }

      // 2) On Air 표시
      updatePresence({ isDrawing: true });
      if (drawingResetRef.current) clearTimeout(drawingResetRef.current);
      drawingResetRef.current = setTimeout(
        () => updatePresence({ isDrawing: false }),
        DRAWING_RESET_MS,
      );

      // 3) 자동 저장 (소유자만)
      if (canEdit) {
        setStatus('pending');
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS);
      }
    },
    [broadcast, updatePresence, canEdit, flushSave],
  );

  const handleMount = useCallback(
    (ed: Editor) => {
      editorRef.current = ed;
      setEditor(ed);

      // 초기 snapshot 로드
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

      // 'user' source 만 받기 위해 source: 'user' 옵션 사용.
      // entry 의 형태가 우리가 정의한 것과 정확히 일치 (added/updated/removed)
      const unsubscribe = ed.store.listen(handleStoreChange, {
        source: 'user',
        scope: 'document',
      });

      // 포인터 위치 → presence cursor 갱신 (스로틀 30Hz)
      const handlePointerMove = () => {
        const now = Date.now();
        if (now - cursorTimerRef.current < CURSOR_THROTTLE_MS) return;
        cursorTimerRef.current = now;
        const point = ed.inputs.currentPagePoint;
        updatePresence({ cursor: { x: point.x, y: point.y } });
      };
      ed.on('event', (info) => {
        if (info.type === 'pointer' && info.name === 'pointer_move') {
          handlePointerMove();
        }
      });

      return unsubscribe;
    },
    [initialSnapshotJson, canEdit, handleStoreChange, updatePresence],
  );

  // 페이지 이탈 시 정리
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (drawingResetRef.current) clearTimeout(drawingResetRef.current);
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <Tldraw onMount={handleMount} />
      <PresenceLayer
        presences={presences}
        editor={editor}
        currentUserId={realtimeUser.id}
      />

      {/* 우상단 상태 영역 */}
      <div className="pointer-events-none absolute right-4 top-4 z-50 flex flex-col items-end gap-2">
        <OnAirIndicator active={someoneDrawing} />
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
        className={
          status === 'error'
            ? 'rounded-sm border border-rec/40 bg-rec/10 px-3 py-1 text-xs text-rec'
            : status === 'saved'
              ? 'rounded-sm border border-live/40 bg-live/10 px-3 py-1 text-xs text-live'
              : 'rounded-sm border border-divider bg-brand-bezel/80 px-3 py-1 text-xs text-fg-muted backdrop-blur-sm'
        }
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
