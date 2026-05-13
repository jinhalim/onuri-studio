'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Editor, TLRecord } from '@/lib/editor';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { StoryTitleInline } from '@/components/story/StoryTitleInline';
import { LaserShareToggle, type LaserShareMode } from '@/components/story/LaserShareToggle';
import { ExportButton } from '@/components/story/ExportButton';
import { ShareButton } from '@/components/share/ShareButton';
import { ForceDarkTheme } from '@/components/theme/ForceDarkTheme';
import {
  StudioCanvas,
  type SaveState,
  type SaveControls,
} from '@/components/canvas/StudioCanvas';
import { loadStorySnapshotAction } from '@/app/actions/load-story-snapshot';
import type { RemoteLaserStroke } from '@/components/canvas/RemoteLaserLayer';
import { PresenceList } from '@/components/presence/PresenceList';
import { OnAirIndicator } from '@/components/brand/OnAirIndicator';
import { NotificationBell } from '@/components/notification/NotificationBell';
import { OverflowNotice } from '@/components/story/OverflowNotice';
import { GDriveAttachButton } from '@/components/story/GDriveAttachButton';
import { GDrivePanel } from '@/components/story/GDrivePanel';
import type { GDriveFileShape } from '@/components/canvas/gdriveShapeUtil';
import { useValue } from '@/lib/editor';
import {
  useStoryRealtime,
  type CursorPayload,
  type LaserPayload,
  type SyncPayload,
} from '@/lib/hooks/useStoryRealtime';
import { useChannelPresence } from '@/lib/hooks/useChannelPresence';
import type { User } from '@/lib/domain/user';
import type { Channel } from '@/lib/domain/channel';
import type { Story } from '@/lib/domain/story';
import { cn } from '@/lib/utils';

const LASER_FADE_CLEANUP_MS = 3000; // 1.5초 페이드 + 여유분
const LASER_ORPHAN_TIMEOUT_MS = 2000; // 'end' phase 가 안 오는 stuck stroke 청소 기준
// 일시 끊김 표시 지연. 너무 길면 50명 환경에서 진짜 끊김을 사용자가 늦게 인지 →
// 단순한 transient 만 가리는 1.5초로 단축.
const STATUS_DEBOUNCE_MS = 1500;

// 스토리 화이트보드 작업 영역.
// realtime 구독을 본 컴포넌트가 일괄 소유 → header + canvas 가 공유.
// 헤더에 PresenceList / RealtimeStatusBadge / OnAirIndicator 배치 (캔버스 위 가림 X).

interface StoryWorkspaceProps {
  channel: Channel;
  story: Story;
  user: User | null;
  canEdit: boolean;
  initialSnapshotJson: string | null;
  shareUrl: string;
}

export function StoryWorkspace({
  channel,
  story,
  user,
  canEdit,
  initialSnapshotJson,
  shareUrl,
}: StoryWorkspaceProps) {
  const editorRef = useRef<Editor | null>(null);
  // D-018 PoC: gdrive panel 의 useValue 가 editor 변화를 reactive 하게 추적하려면
  // ref 외에 state 도 필요 (ref 는 React render 트리거 안 함).
  const [editor, setEditor] = useState<Editor | null>(null);
  const saveControlsRef = useRef<SaveControls | null>(null);
  // broadcast 함수는 useStoryRealtime 에서 반환되는데 handleReconnect 가 그것의 인자로
  // 들어가는 circular dependency 회피용 ref. 아래 useStoryRealtime 호출 후 채워진다.
  const broadcastRef = useRef<((changes: Omit<SyncPayload, 'fromUserId'>) => void) | null>(null);
  const [isDrawingLocal, setIsDrawingLocal] = useState(false);
  // D-018 PoC: 사용자가 명시적으로 패널을 닫으면 같은 shape 재선택해도 자동 안 열림.
  // 다른 gdrive shape 선택 시엔 다시 열림. shape.id 단위로 "닫힘 상태" 추적.
  const [closedPanelShapeIds, setClosedPanelShapeIds] = useState<Set<string>>(() => new Set());
  const [laserShareMode, setLaserShareMode] = useState<LaserShareMode>('private');
  const [remoteLaserStrokes, setRemoteLaserStrokes] = useState<Map<string, RemoteLaserStroke>>(
    () => new Map(),
  );
  // StudioCanvas 가 알려주는 저장 상태. lastSavedAt 의 초기값은 DB 의 snapshotUpdatedAt.
  const [saveState, setSaveState] = useState<SaveState>(() => ({
    status: 'idle',
    lastSavedAt: story.snapshotUpdatedAt ? new Date(story.snapshotUpdatedAt).getTime() : null,
    errorMsg: null,
  }));
  const handleSaveStateChange = useCallback((s: SaveState) => {
    // StudioCanvas 가 initialSnapshotJson 있을 때 Date.now() 로 추정한 값보다,
    // DB 의 실제 snapshotUpdatedAt 이 더 정확. 거기서 받은 게 더 오래된 경우 우리 값 유지.
    setSaveState((prev) => {
      if (s.lastSavedAt && prev.lastSavedAt && s.lastSavedAt < prev.lastSavedAt) {
        return { ...s, lastSavedAt: prev.lastSavedAt };
      }
      return s;
    });
  }, []);
  const handleSaveControlsReady = useCallback((controls: SaveControls) => {
    saveControlsRef.current = controls;
  }, []);
  const handleManualSave = useCallback(() => {
    void saveControlsRef.current?.manualSave();
  }, []);

  // realtime 비로그인 사용자도 임시 dummy ID 로 구독 (방문 카운트 목적)
  const realtimeUser =
    user ?? ({
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
    } satisfies User);

  // 원격 변경을 editor.store 에 적용 (loop 방지: mergeRemoteChanges)
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
        console.error('[StoryWorkspace] 원격 변경 적용 실패:', err);
      }
    });
  }, []);

  // 원격 커서 위치. cursor 는 presence.track 대신 broadcast 로 받아서 별도 Map 에 보관.
  // (presence.track 은 Supabase 기본 rate limit ~100ms 라서 그리는 중 cursor 가 drop 됨)
  const [remoteCursors, setRemoteCursors] = useState<
    Map<string, { x: number; y: number; updatedAt: number }>
  >(() => new Map());
  const handleRemoteCursor = useCallback((payload: CursorPayload) => {
    setRemoteCursors((prev) => {
      const next = new Map(prev);
      next.set(payload.fromUserId, { x: payload.x, y: payload.y, updatedAt: Date.now() });
      return next;
    });
  }, []);
  // B5: 사용자가 채널을 떠나면 cursor 도 즉시 정리 (30초 timeout 기다리지 않음)
  const handlePresenceLeave = useCallback((userId: string) => {
    setRemoteCursors((prev) => {
      if (!prev.has(userId)) return prev;
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  // A2 — Non-destructive reconnect:
  // 재연결 시 서버 snapshot 으로 store 를 'replace' 하면 disconnect 동안의 로컬 변경이
  // 통째로 사라짐 → 사용자가 자주 보고한 "내가 그린 게 사라짐" 의 한 원인.
  // 따라서 loadSnapshot 대신 서버 record 들을 store.put 으로 머지 (로컬 추가분 보존).
  // 보너스: 본인의 로컬 record 들을 catch-up broadcast 로 재전송해서 다른 사용자가
  // disconnect 동안의 변경을 받을 수 있게 한다.
  const handleReconnect = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    try {
      const result = await loadStorySnapshotAction(story.id);
      if (!result.ok || !result.snapshotJson) return;
      const parsed = JSON.parse(result.snapshotJson) as {
        document?: { store?: Record<string, TLRecord> };
        store?: Record<string, TLRecord>;
      };
      // editor.getSnapshot() 의 신 포맷 ({document:{store,...}}) + 옛 store.getStoreSnapshot()
      // ({store,...}) 모두 호환.
      const serverStore = parsed.document?.store ?? parsed.store;
      if (!serverStore) return;
      const serverRecords = Object.values(serverStore);
      if (serverRecords.length === 0) return;

      ed.store.mergeRemoteChanges(() => {
        // 머지만 — 명시적 remove 안 함. 로컬에 unsynced 추가분이 있어도 보존.
        // 트레이드오프: 다른 사용자가 disconnect 동안 정당하게 삭제한 record 가 로컬에
        // 부활할 수 있음. 다음 user-source 변경 시 그 사용자가 다시 삭제하면 자연 회복.
        ed.store.put(serverRecords);
      });

      // 본인 로컬 변경 catch-up broadcast — 다른 사용자가 놓친 우리 변경 회복.
      // shape 만 대상 (other record types 는 instance/page 등 sync 대상 아님).
      const localShapes = ed.store
        .allRecords()
        .filter((r) => r.typeName === 'shape') as TLRecord[];
      if (localShapes.length > 0) {
        broadcastRef.current?.({ updated: localShapes });
      }
    } catch (err) {
      console.error('[StoryWorkspace] 재연결 snapshot 재로드 실패:', err);
    }
  }, [story.id]);
  // 30초 이상 cursor update 없으면 제거 (사용자 이탈)
  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemoteCursors((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [id, c] of prev) {
          if (now - c.updatedAt > 30_000) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, []);

  // 원격 레이저 stroke 누적. 'end' 미수신 stuck stroke 도 청소되도록 lastUpdatedAt 기록.
  const handleRemoteLaser = useCallback((payload: LaserPayload) => {
    setRemoteLaserStrokes((prev) => {
      const next = new Map(prev);
      const existing = next.get(payload.strokeId);
      const now = Date.now();
      if (payload.phase === 'start') {
        next.set(payload.strokeId, {
          strokeId: payload.strokeId,
          userId: payload.fromUserId,
          color: payload.color,
          points: [{ x: payload.x, y: payload.y }],
          completedAt: null,
          lastUpdatedAt: now,
        });
      } else if (existing) {
        const updatedStroke: RemoteLaserStroke = {
          ...existing,
          points: [...existing.points, { x: payload.x, y: payload.y }],
          completedAt: payload.phase === 'end' ? now : existing.completedAt,
          lastUpdatedAt: now,
        };
        next.set(payload.strokeId, updatedStroke);
      }
      return next;
    });
  }, []);

  // 주기적 cleanup: 페이드 끝난 stroke + 오랫동안 업데이트 없는 stuck stroke 제거.
  // Stuck stroke 는 채널 재연결 등으로 'end' phase 가 누락된 경우 발생.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemoteLaserStrokes((prev) => {
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

  const {
    presences: rawPresences,
    broadcast,
    broadcastLaser,
    broadcastCursor,
    updatePresence,
    status,
  } = useStoryRealtime({
    storyId: story.id,
    user: realtimeUser,
    onSync: handleRemoteSync,
    onLaser: handleRemoteLaser,
    onCursor: handleRemoteCursor,
    onPresenceLeave: handlePresenceLeave,
    onReconnect: handleReconnect,
  });

  // handleReconnect 의 catch-up broadcast 가 사용할 수 있게 ref 갱신.
  useEffect(() => {
    broadcastRef.current = broadcast;
  }, [broadcast]);

  // remoteCursors 를 presence 와 머지해서 PresenceLayer 가 쓸 형태로 변환.
  // presence 는 닉네임/색상/그리는 중 등 메타, cursor 는 별도 broadcast 라 따로 관리.
  const presences = useMemo(() => {
    return rawPresences.map((p) => {
      const c = remoteCursors.get(p.userId);
      return c ? { ...p, cursor: { x: c.x, y: c.y } } : p;
    });
  }, [rawPresences, remoteCursors]);

  // status 디바운스: 일시적 끊김(< 3초)은 사용자에게 안 보이게.
  // 'connected' 는 즉시 반영, 그 외 상태는 3초 유지된 후에만 표시.
  const [displayStatus, setDisplayStatus] = useState(status);
  useEffect(() => {
    if (status === 'connected') {
      setDisplayStatus('connected');
      return;
    }
    const timer = window.setTimeout(() => setDisplayStatus(status), STATUS_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  // Channel Guide 라이브 인디케이터용
  useChannelPresence({
    channelId: channel.id,
    user,
    currentStoryId: story.id,
    isDrawing: isDrawingLocal,
  });

  // 다른 사용자가 그리는 중 (본인 제외)
  const someoneDrawing = presences.some(
    (p) => p.userId !== realtimeUser.id && p.isDrawing,
  );

  // D-018 PoC: 캔버스에서 선택된 gdrive-file shape 추적 (가장 마지막에 선택된 것 1개).
  // useValue 가 tldraw 의 reactive signal 변화에 자동 재계산 → selection 변하면 panel 갱신.
  // type cast 이유: tldraw 의 TLShape union 은 built-in shape 만 포함 — custom 'gdrive-file' 은
  // shapeUtils 등록으로 런타임엔 동작하지만 type 시스템엔 안 보임.
  // ⚠ useValue 는 Hook 이라 early return 보다 반드시 위에서 호출 (rules-of-hooks).
  const selectedGDriveShape = useValue<GDriveFileShape | null>(
    'selected-gdrive-shape',
    () => {
      if (!editor) return null;
      const selected = editor.getSelectedShapes();
      const gdrive = selected.find((s) => (s.type as string) === 'gdrive-file');
      return (gdrive as unknown as GDriveFileShape | undefined) ?? null;
    },
    [editor],
  );

  // 패널 표시 여부: 선택된 gdrive shape 있고, 사용자가 명시적으로 닫은 적 없으면 표시.
  const panelOpen =
    selectedGDriveShape !== null && !closedPanelShapeIds.has(selectedGDriveShape.id);

  const handleClosePanel = () => {
    if (!selectedGDriveShape) return;
    setClosedPanelShapeIds((prev) => {
      const next = new Set(prev);
      next.add(selectedGDriveShape.id);
      return next;
    });
  };

  // D-017: 정원 초과 시 캔버스 대신 안내 페이지 표시. 채널 진입 즉시 untrack 되고
  // 사용자가 "다시 시도" 버튼으로 페이지 리로드해야 입장 재시도.
  if (status === 'overflow') {
    return (
      <main className="flex h-dvh flex-col">
        <ForceDarkTheme />
        <OverflowNotice
          channelId={channel.id}
          channelName={channel.name}
          storyTitle={story.title}
        />
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col">
      {/* 스토리 페이지는 다크 고정 (사용자 명시 요청). 떠나면 이전 테마로 복원. */}
      <ForceDarkTheme />
      {/* z-[1000] + isolation: isolate — tldraw 의 도형 z-index (300) 보다
          충분히 높이고 새 stacking context 생성. 헤더 자식 (PresenceList tooltip 등)
          이 캔버스 위로 항상 그려짐. */}
      <header
        className="relative z-[1000] flex flex-wrap items-center justify-between gap-x-2 gap-y-3 border-b border-divider bg-brand-bezel px-4 py-3 sm:gap-x-3 sm:px-6"
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          isolation: 'isolate',
        }}
      >
        {/* Left: back + title */}
        <div className="flex flex-col gap-1">
          <Link
            href={`/ch/${channel.id}`}
            className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg"
          >
            <ArrowLeft size={12} />
            <span>{channel.name}</span>
          </Link>
          <StoryTitleInline
            storyId={story.id}
            initialTitle={story.title}
            channelId={channel.id}
            canEdit={canEdit}
          />
          {canEdit && (
            <SaveStatusBadge state={saveState} onManualSave={handleManualSave} />
          )}
        </div>

        {/* Right: presence + status + laser + share + signin */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <OnAirIndicator active={someoneDrawing || isDrawingLocal} />
          <PresenceList presences={presences} currentUserId={realtimeUser.id} />
          <RealtimeStatusBadge status={displayStatus} />
          <LaserShareToggle mode={laserShareMode} onChange={setLaserShareMode} />
          {/* D-014: 익명 + 비-owner 일 때는 export 불가 (남의 채널 콘텐츠 내보내기 차단).
              owner 거나 Google 회원이면 자유롭게 export 가능. */}
          {/* D-018 PoC: 모든 접속자 (소유자 포함) 가 첨부 가능. 첨부된 카드는 broadcast 로
              다른 사용자에게도 자동 전파. Phase 8b 부터는 권한 정책 검토 필요. */}
          <GDriveAttachButton editorRef={editorRef} disabled={!canEdit} />
          {(canEdit || (user && !user.isAnonymous)) && (
            <ExportButton
              editorRef={editorRef}
              fileName={story.title}
              storyId={story.id}
              exporterNickname={realtimeUser.nickname}
              appVersion="0.1.0"
            />
          )}
          <ShareButton url={shareUrl} label="스토리 URL 공유" />
          <NotificationBell userId={user?.id ?? null} />
          {user && <SignedInBanner user={user} compact />}
        </div>
      </header>

      {/* D-018 PoC: 캔버스 + 우측 gdrive panel split-screen.
          panelOpen=true 일 때만 panel 표시 + 캔버스는 폭 줄어듦. */}
      <section className="flex flex-1 overflow-hidden">
        <div className={cn('flex-1 overflow-hidden', panelOpen && 'min-w-0')}>
          <StudioCanvas
            storyId={story.id}
            initialSnapshotJson={initialSnapshotJson}
            canEdit={canEdit}
            presences={presences}
            currentUserId={realtimeUser.id}
            currentUserNickname={realtimeUser.nickname}
            broadcast={broadcast}
            broadcastLaser={broadcastLaser}
            broadcastCursor={broadcastCursor}
            updatePresence={updatePresence}
            onEditorMount={(ed) => {
              editorRef.current = ed;
              setEditor(ed);
            }}
            onLocalDrawingChange={setIsDrawingLocal}
            laserShareMode={laserShareMode}
            remoteLaserStrokes={remoteLaserStrokes}
            onSaveStateChange={handleSaveStateChange}
            onSaveControlsReady={handleSaveControlsReady}
          />
        </div>
        {panelOpen && selectedGDriveShape && (
          <GDrivePanel
            shape={selectedGDriveShape}
            onClose={handleClosePanel}
            className="w-2/5 min-w-[320px] max-w-[640px]"
          />
        )}
      </section>
    </main>
  );
}

function RealtimeStatusBadge({
  status,
}: {
  status: 'connecting' | 'connected' | 'closed' | 'error' | 'overflow';
}) {
  // overflow 는 부모가 일찍 early return 하므로 본 컴포넌트엔 도달 안 함.
  // 타입 안전성 위해 case 만 포함 (fallback 표시).
  const config = {
    connecting: { label: '연결 중', color: 'text-fg-muted', dot: 'bg-fg-muted/50 animate-pulse' },
    connected: { label: '실시간', color: 'text-live', dot: 'bg-live' },
    closed: { label: '연결 끊김', color: 'text-fg-muted', dot: 'bg-fg-muted/50' },
    error: { label: '연결 오류', color: 'text-rec', dot: 'bg-rec animate-pulse-rec' },
    overflow: { label: '정원 초과', color: 'text-rec', dot: 'bg-rec' },
  }[status];

  return (
    <div className="flex items-center gap-1.5 rounded-sm border border-divider bg-brand-surface px-2.5 py-1">
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      <span className={cn('text-[10px] font-medium', config.color)}>{config.label}</span>
    </div>
  );
}

// 제목 밑에 작게: "마지막 저장: 1분 전" 형식. 클릭 시 즉시 저장.
// 상태에 따라 라벨 변경: pending=편집 중, saving=저장 중, error=실패(재시도).
function SaveStatusBadge({
  state,
  onManualSave,
}: {
  state: SaveState;
  onManualSave: () => void;
}) {
  const [, forceTick] = useState(0);
  // 60초마다 상대 시간 재계산 (분 단위 표시 갱신용)
  useEffect(() => {
    const interval = window.setInterval(() => forceTick((t) => t + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const label = (() => {
    if (state.status === 'saving') return '저장 중…';
    if (state.status === 'pending') return '편집 중 (자동 저장 대기)';
    if (state.status === 'error') return `저장 실패 — 클릭해서 재시도`;
    if (state.lastSavedAt) return `마지막 저장: ${formatRelative(state.lastSavedAt)}`;
    return '아직 저장된 적 없음';
  })();

  const color =
    state.status === 'error'
      ? 'text-rec'
      : state.status === 'saving' || state.status === 'pending'
        ? 'text-fg-muted'
        : 'text-fg-muted/80';

  return (
    <button
      type="button"
      onClick={onManualSave}
      title="클릭해서 즉시 저장"
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-sm px-1 py-0.5 text-[10px]',
        'hover:bg-brand-surface/70 transition-colors',
        color,
      )}
    >
      {/* SSR 시각과 client hydration 시각의 Date.now() 차이로 "32초 전" vs
          "43초 전" mismatch 가 발생 → suppressHydrationWarning 으로 React #425
          억제 (client 값이 SSR 값을 덮어씀). 60s interval 로 이후 갱신됨. */}
      <span suppressHydrationWarning>{label}</span>
    </button>
  );
}

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return '방금 전';
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}
