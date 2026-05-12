'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScribbleOverlayUtil,
  Tldraw,
  useValue,
  type Editor,
  type TLComponents,
  type TLRecord,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { customShapeUtils } from './customShapeUtils';
import { CustomStylePanel } from './CustomStylePanel';
import { NoteAuthorLayer } from './NoteAuthorLayer';
import { OnboardingOverlay } from '@/components/story/OnboardingOverlay';
// cn 은 SaveIndicator 제거 후 미사용 → import 도 삭제

// tldraw v5 의 ScribbleOverlayUtil 은 <canvas> 에 직접 레이저 stroke 를 그린다.
// 본 프로젝트는 RemoteLaserLayer 가 동일 stroke 를 SVG (글로우/형광 효과) 로 다시
// 그리므로, native render 를 no-op 으로 바꿔 중복 표시를 막는다.
// mergeArraysAndReplaceDefaults('type', ...) 가 type='scribble' 기준으로 기본 util 을 교체.
class HiddenScribbleOverlayUtil extends ScribbleOverlayUtil {
  override render() {
    // no-op: SVG 오버레이가 본인 stroke 를 대체 렌더
  }
}
const overlayUtils = [HiddenScribbleOverlayUtil];

// 임의 색상(meta.customColor) 지원을 위한 StylePanel 교체.
// 기본 panel + HTML color picker section. customShapeUtils 가 meta 를 읽어 렌더에 반영.
const tldrawComponents: TLComponents = {
  StylePanel: CustomStylePanel,
};
import { saveStorySnapshotAction } from '@/app/actions/save-story-snapshot';
import type {
  CursorPayload,
  LaserPayload,
  PresenceState,
  SyncPayload,
} from '@/lib/hooks/useStoryRealtime';
import type { LaserShareMode } from '@/components/story/LaserShareToggle';
import { PresenceLayer } from './PresenceLayer';
import { RemoteLaserLayer, type RemoteLaserStroke } from './RemoteLaserLayer';

const AUTOSAVE_DEBOUNCE_MS = 1_500;
const CURSOR_THROTTLE_MS = 33; // ~30Hz
const LASER_THROTTLE_MS = 16; // ~60Hz (스무스한 트레일)
const DRAWING_RESET_MS = 800;

// 본인 레이저 글로우 색. user.color 대신 빨간색(#FF3D5A) 으로 통일 — 사용자 명시 요청.
// 다른 사용자는 RemoteLaserLayer 가 받은 user.color 그대로 사용.
const LOCAL_LASER_COLOR = '#FF3D5A';
const LASER_FADE_CLEANUP_MS = 3000;
const LASER_ORPHAN_TIMEOUT_MS = 2000;

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
  /** 본인 닉네임. 메모지(note) 생성 시 shape.meta.createdBy 에 자동 stamp. */
  currentUserNickname: string;
  broadcast: (changes: Omit<SyncPayload, 'fromUserId'>) => void;
  broadcastLaser: (point: Omit<LaserPayload, 'fromUserId' | 'color'>) => void;
  /** pointer_move 마다 호출 (30Hz throttle). presence.track 대신 broadcast 로 cursor 전송. */
  broadcastCursor: (point: Omit<CursorPayload, 'fromUserId'>) => void;
  updatePresence: (
    partial: Partial<Omit<PresenceState, 'userId' | 'nickname' | 'color'>>,
  ) => void;
  /** editor 인스턴스가 마운트/언마운트 될 때 부모에 알림 (handleRemoteSync 용). */
  onEditorMount: (editor: Editor | null) => void;
  /** 본인이 그리는 중 상태 변화 (channel-level presence 동기화용). */
  onLocalDrawingChange: (isDrawing: boolean) => void;
  /** 레이저 공유 모드. 'public' 일 때만 broadcastLaser 호출. */
  laserShareMode: LaserShareMode;
  /** 다른 사용자의 레이저 stroke 들. 부모(StoryWorkspace)가 onLaser 콜백으로 누적. */
  remoteLaserStrokes: Map<string, RemoteLaserStroke>;
  /** 저장 상태 변화를 부모에 알림 (헤더의 마지막 저장 배지 갱신용). */
  onSaveStateChange?: (state: SaveState) => void;
  /** flushSave 같은 컨트롤을 부모가 사용할 수 있게 전달 (수동 저장 버튼). */
  onSaveControlsReady?: (controls: SaveControls) => void;
}

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export interface SaveState {
  status: SaveStatus;
  /** 마지막 저장 성공 시각 (ms). 아직 한번도 저장 안 됐으면 null. */
  lastSavedAt: number | null;
  errorMsg: string | null;
}
export interface SaveControls {
  /** 사용자가 명시적으로 즉시 저장 요청. */
  manualSave: () => Promise<void>;
}

export function StudioCanvas({
  storyId,
  initialSnapshotJson,
  canEdit,
  presences,
  currentUserId,
  currentUserNickname,
  broadcast,
  broadcastLaser,
  broadcastCursor,
  updatePresence,
  onEditorMount,
  onLocalDrawingChange,
  laserShareMode,
  remoteLaserStrokes,
  onSaveStateChange,
  onSaveControlsReady,
}: StudioCanvasProps) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(
    // 초기 snapshot 이 있으면 페이지 로드 시각을 마지막 저장으로 추정.
    // (실제 DB 의 snapshot_updated_at 까지 가져오면 더 정확하지만 props 흐름 변경 필요)
    initialSnapshotJson ? Date.now() : null,
  );
  const [editor, setEditor] = useState<Editor | null>(null);

  // 부모에 상태 변화 알림
  useEffect(() => {
    onSaveStateChange?.({ status, lastSavedAt, errorMsg });
  }, [status, lastSavedAt, errorMsg, onSaveStateChange]);

  const editorRef = useRef<Editor | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimerRef = useRef<number>(0);
  const laserTimerRef = useRef<number>(0);
  const laserStrokeIdRef = useRef<string | null>(null);
  const drawingResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const laserShareModeRef = useRef(laserShareMode);
  const currentUserNicknameRef = useRef(currentUserNickname);
  useEffect(() => {
    laserShareModeRef.current = laserShareMode;
  }, [laserShareMode]);
  useEffect(() => {
    currentUserNicknameRef.current = currentUserNickname;
  }, [currentUserNickname]);

  // 본인 레이저 stroke 도 SVG 오버레이로 렌더해서 빛번짐/형광 효과를 본인에게도 적용.
  // tldraw v5 의 native scribble 은 <canvas> 에 그려져 CSS filter 가 안 먹음.
  // 본 state 는 본인 화면에만 보이고, broadcast 는 별도로 useStoryRealtime.broadcastLaser 가 처리.
  const [localLaserStrokes, setLocalLaserStrokes] = useState<Map<string, RemoteLaserStroke>>(
    () => new Map(),
  );

  // 본인 + 타인 stroke 합쳐서 RemoteLaserLayer 에 전달 (동일한 시각 효과)
  const allLaserStrokes = useMemo(() => {
    if (localLaserStrokes.size === 0) return remoteLaserStrokes;
    const merged = new Map(remoteLaserStrokes);
    for (const [id, stroke] of localLaserStrokes) merged.set(id, stroke);
    return merged;
  }, [remoteLaserStrokes, localLaserStrokes]);

  // 본인 stroke cleanup (페이드 끝난 것 + stuck stroke 제거)
  useEffect(() => {
    const interval = window.setInterval(() => {
      setLocalLaserStrokes((prev) => {
        if (prev.size === 0) return prev;
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [id, stroke] of prev) {
          const isFadedOut =
            stroke.completedAt && now - stroke.completedAt > LASER_FADE_CLEANUP_MS;
          const isStuck =
            !stroke.completedAt && now - stroke.lastUpdatedAt > LASER_ORPHAN_TIMEOUT_MS;
          if (isFadedOut || isStuck) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const flushSave = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed || !canEdit) return;
    setStatus('saving');
    setErrorMsg(null);
    try {
      // editor.getSnapshot() 은 { document: TLStoreSnapshot, session } 반환.
      // editor.loadSnapshot 이 동일 포맷 + 옛 store-level 포맷 모두 받음 → 호환 OK.
      const snapshot = ed.getSnapshot();
      const json = JSON.stringify(snapshot);
      console.log('[StudioCanvas] 저장 시작', { storyId, bytes: json.length });
      const result = await saveStorySnapshotAction(storyId, json);
      if (!result.ok) {
        console.error('[StudioCanvas] 저장 실패 (server):', result.error);
        setStatus('error');
        setErrorMsg(result.error ?? 'unknown');
        return;
      }
      console.log('[StudioCanvas] 저장 완료', result.savedAt);
      setStatus('saved');
      setLastSavedAt(Date.now());
      window.setTimeout(() => setStatus('idle'), 1500);
    } catch (err) {
      console.error('[StudioCanvas] 저장 실패 (network):', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'unknown');
    }
  }, [storyId, canEdit]);

  // unmount / 페이지 가시성 변경 시 pending debounce 를 즉시 발화.
  // fire-and-forget — Next.js client-side navigation 은 tab 이 살아있어 fetch 가 완료됨.
  // canEdit / storyId 는 페이지 생애주기 동안 고정이라 useCallback dep 으로 안전.
  const flushPendingSave = useCallback(() => {
    if (!debounceRef.current) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    const ed = editorRef.current;
    if (!ed || !canEdit) return;
    try {
      const snapshot = ed.getSnapshot();
      const json = JSON.stringify(snapshot);
      console.log('[StudioCanvas] pending save flush (unmount/visibility)', { bytes: json.length });
      // fire-and-forget. 페이지 떠난 후에도 Next.js 서버 액션이 처리 완료.
      void saveStorySnapshotAction(storyId, json).then((result) => {
        if (!result.ok) {
          console.error('[StudioCanvas] flush 저장 실패:', result.error);
        } else {
          console.log('[StudioCanvas] flush 저장 완료');
          setLastSavedAt(Date.now());
        }
      });
    } catch (err) {
      console.error('[StudioCanvas] flush 실패:', err);
    }
  }, [storyId, canEdit]);

  // 부모(StoryWorkspace)에 수동 저장 컨트롤 노출. flushSave 가 변경될 때마다 갱신.
  useEffect(() => {
    onSaveControlsReady?.({ manualSave: flushSave });
  }, [flushSave, onSaveControlsReady]);

  // visibilitychange: 탭 숨김 / 닫기 시도 시 강제 flush.
  useEffect(() => {
    if (!canEdit) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPendingSave();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushPendingSave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushPendingSave);
    };
  }, [canEdit, flushPendingSave]);

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
          const parsed = JSON.parse(initialSnapshotJson) as Record<string, unknown>;
          console.log('[StudioCanvas] snapshot 로드 시작', {
            bytes: initialSnapshotJson.length,
            keys: Object.keys(parsed),
          });
          // editor.loadSnapshot 은 TLEditorSnapshot({document,session}) 와
          // TLStoreSnapshot({store,schema}) 둘 다 받는다. editor.getSnapshot() 으로 저장한
          // 새 포맷 (document/session) 과 기존 store.getStoreSnapshot() 포맷 모두 호환.
          ed.loadSnapshot(parsed as Parameters<typeof ed.loadSnapshot>[0]);
          console.log('[StudioCanvas] 초기 snapshot 로드 완료');
        } catch (err) {
          console.warn('[StudioCanvas] 초기 snapshot 파싱 실패, 빈 캔버스로 시작:', err);
        }
      } else {
        console.log('[StudioCanvas] 초기 snapshot 없음 (빈 캔버스)');
      }

      if (!canEdit) {
        ed.updateInstanceState({ isReadonly: true });
      }

      const unsubscribe = ed.store.listen(handleStoreChange, {
        source: 'user',
        scope: 'document',
      });

      // 메모지(note) 도형 생성 시 작성자(닉네임) 을 meta.createdBy 에 stamp.
      // store.put 직전에 record 를 변환 → 한 번의 'added' 이벤트로 createdBy 가 포함된
      // record 가 broadcast 되어 다른 사용자도 동일하게 by 라벨을 볼 수 있다.
      // source==='remote' 면 다른 사용자가 만든 거라 그대로 통과.
      const disposeBeforeCreate = ed.sideEffects.registerBeforeCreateHandler(
        'shape',
        (record, source) => {
          if (source !== 'user') return record;
          if (record.type !== 'note') return record;
          const meta = record.meta as { createdBy?: string } | undefined;
          if (meta?.createdBy) return record;
          const nickname = currentUserNicknameRef.current;
          if (!nickname) return record;
          return {
            ...record,
            meta: { ...record.meta, createdBy: nickname },
          };
        },
      );

      // 사용자가 표준 팔레트 색상을 클릭하면 props.color 가 변경됨.
      // 이때 meta.customColor 가 남아있으면 그 hex 가 계속 override 되어 팔레트 색이
      // 적용 안 되는 것처럼 보임 → 같은 transaction 에서 customColor 자동 제거.
      // source==='remote' 면 다른 사용자의 변경이므로 그대로 통과.
      const disposeBeforeChange = ed.sideEffects.registerBeforeChangeHandler(
        'shape',
        (prev, next, source) => {
          if (source !== 'user') return next;
          const prevColor = (prev as { props?: { color?: string } }).props?.color;
          const nextColor = (next as { props?: { color?: string } }).props?.color;
          if (prevColor === nextColor) return next;
          const nextMeta = next.meta as { customColor?: unknown } | undefined;
          if (!nextMeta?.customColor) return next;
          const cleanedMeta = { ...next.meta };
          delete (cleanedMeta as Record<string, unknown>).customColor;
          return { ...next, meta: cleanedMeta };
        },
      );

      // 포인터 이벤트: cursor broadcast + 레이저 broadcast
      ed.on('event', (info) => {
        if (info.type !== 'pointer') return;
        const point = ed.inputs.currentPagePoint;
        const isLaserTool = ed.getCurrentToolId() === 'laser';

        // 1) cursor broadcast (30Hz 스로틀, 도구 무관). presence.track 대신 broadcast
        // 사용 — presence 의 ~100ms rate limit 우회. 그리는 중에도 cursor 가 안 끊김.
        if (info.name === 'pointer_move') {
          const now = Date.now();
          if (now - cursorTimerRef.current >= CURSOR_THROTTLE_MS) {
            cursorTimerRef.current = now;
            broadcastCursor({ x: point.x, y: point.y });
          }
        }

        // 2) 레이저 추적: 본인 stroke 누적 (공유 모드 무관) + 공유 모드일 때만 broadcast
        if (!isLaserTool) return;

        const isPublic = laserShareModeRef.current === 'public';

        if (info.name === 'pointer_down') {
          const newStrokeId = Math.random().toString(36).slice(2, 12);
          laserStrokeIdRef.current = newStrokeId;
          // 본인 화면용 stroke (빨간색 글로우)
          setLocalLaserStrokes((prev) => {
            const next = new Map(prev);
            next.set(newStrokeId, {
              strokeId: newStrokeId,
              userId: currentUserId,
              color: LOCAL_LASER_COLOR,
              points: [{ x: point.x, y: point.y }],
              completedAt: null,
              lastUpdatedAt: Date.now(),
            });
            return next;
          });
          if (isPublic) {
            broadcastLaser({ strokeId: newStrokeId, x: point.x, y: point.y, phase: 'start' });
          }
        } else if (info.name === 'pointer_move') {
          const strokeId = laserStrokeIdRef.current;
          if (!strokeId) return;
          const now = Date.now();
          if (now - laserTimerRef.current < LASER_THROTTLE_MS) return;
          laserTimerRef.current = now;
          // 본인 stroke 갱신
          setLocalLaserStrokes((prev) => {
            const existing = prev.get(strokeId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(strokeId, {
              ...existing,
              points: [...existing.points, { x: point.x, y: point.y }],
              lastUpdatedAt: now,
            });
            return next;
          });
          if (isPublic) {
            broadcastLaser({ strokeId, x: point.x, y: point.y, phase: 'move' });
          }
        } else if (info.name === 'pointer_up') {
          const strokeId = laserStrokeIdRef.current;
          if (!strokeId) return;
          // 본인 stroke 종료 (페이드 시작)
          setLocalLaserStrokes((prev) => {
            const existing = prev.get(strokeId);
            if (!existing) return prev;
            const next = new Map(prev);
            next.set(strokeId, {
              ...existing,
              completedAt: Date.now(),
              lastUpdatedAt: Date.now(),
            });
            return next;
          });
          if (isPublic) {
            broadcastLaser({ strokeId, x: point.x, y: point.y, phase: 'end' });
          }
          laserStrokeIdRef.current = null;
        }
      });

      return () => {
        // editor 가 dispose 되기 전에 pending save 를 먼저 flush.
        // 이 시점에는 editorRef.current 가 아직 valid → getStoreSnapshot 안전.
        flushPendingSave();
        unsubscribe();
        disposeBeforeCreate();
        disposeBeforeChange();
      };
    },
    [
      initialSnapshotJson,
      canEdit,
      handleStoreChange,
      broadcastLaser,
      broadcastCursor,
      onEditorMount,
      currentUserId,
      flushPendingSave,
    ],
  );

  // unmount 정리. flushPendingSave 는 이미 handleMount cleanup 에서 호출됨.
  useEffect(() => {
    return () => {
      if (drawingResetRef.current) clearTimeout(drawingResetRef.current);
      onEditorMount(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-full w-full">
      <Tldraw
        onMount={handleMount}
        overlayUtils={overlayUtils}
        shapeUtils={customShapeUtils}
        components={tldrawComponents}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
      <NoteAuthorLayer editor={editor} />
      <RemoteLaserLayer strokes={allLaserStrokes} editor={editor} />
      <PresenceLayer presences={presences} editor={editor} currentUserId={currentUserId} />
      <OnboardingForEmptyBoard editor={editor} storyId={storyId} />

      {/* 우상단: 읽기 전용 배지만. 저장 상태는 StoryWorkspace 헤더의 SaveStatusBadge 가 표시. */}
      {!canEdit && (
        <div className="pointer-events-none absolute right-4 top-4 z-50">
          <ReadOnlyBadge />
        </div>
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

// editor 가 reactive 라 useValue 로 도형 개수 추적 → 도형 추가/삭제 시 자동 갱신.
// 분리한 이유: useValue 가 editor 가 있어야 호출 가능 (null 가드).
function OnboardingForEmptyBoard({
  editor,
  storyId,
}: {
  editor: Editor | null;
  storyId: string;
}) {
  const isEmpty = useValue(
    'is empty board',
    () => (editor ? editor.getCurrentPageShapeIds().size === 0 : false),
    [editor],
  );
  if (!editor) return null;
  return <OnboardingOverlay isEmpty={isEmpty} storyId={storyId} />;
}
