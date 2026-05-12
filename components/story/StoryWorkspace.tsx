'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Editor, TLRecord } from 'tldraw';
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
const STATUS_DEBOUNCE_MS = 3000; // 일시적 끊김은 사용자에게 보이지 않게

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
  const saveControlsRef = useRef<SaveControls | null>(null);
  const [isDrawingLocal, setIsDrawingLocal] = useState(false);
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
    if (!ed) {
      console.warn('[StoryWorkspace] handleRemoteSync: editor 미준비');
      return;
    }
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
        console.log('[StoryWorkspace] 원격 변경 적용 완료');
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

  // B6: 재연결 시 서버의 최신 snapshot 으로 editor store 를 다시 채움.
  // CLOSED ↔ SUBSCRIBED 사이의 broadcast 들을 놓쳤을 수 있으므로 복원 필수.
  // mergeRemoteChanges 안에서 적용 → handleStoreChange 가 'remote' source 로 무시.
  const handleReconnect = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    try {
      const result = await loadStorySnapshotAction(story.id);
      if (!result.ok || !result.snapshotJson) return;
      const parsed = JSON.parse(result.snapshotJson) as Record<string, unknown>;
      ed.store.mergeRemoteChanges(() => {
        ed.loadSnapshot(parsed as Parameters<typeof ed.loadSnapshot>[0]);
      });
      console.log('[StoryWorkspace] 재연결 후 snapshot 재로드 완료');
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

  return (
    <main className="flex h-dvh flex-col">
      {/* 스토리 페이지는 다크 고정 (사용자 명시 요청). 떠나면 이전 테마로 복원. */}
      <ForceDarkTheme />
      <header
        className="flex flex-wrap items-center justify-between gap-2 border-b border-divider bg-brand-bezel px-4 py-2 sm:gap-3 sm:px-6 sm:py-3"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
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
        <div className="flex flex-wrap items-center gap-3">
          <OnAirIndicator active={someoneDrawing || isDrawingLocal} />
          <PresenceList presences={presences} currentUserId={realtimeUser.id} />
          <RealtimeStatusBadge status={displayStatus} />
          <LaserShareToggle mode={laserShareMode} onChange={setLaserShareMode} />
          <ExportButton
            editorRef={editorRef}
            fileName={story.title}
            storyId={story.id}
            exporterNickname={realtimeUser.nickname}
            appVersion="0.1.0"
          />
          <ShareButton url={shareUrl} label="스토리 URL 공유" />
          {user && <SignedInBanner user={user} compact />}
        </div>
      </header>

      <section className="flex-1 overflow-hidden">
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
          }}
          onLocalDrawingChange={setIsDrawingLocal}
          laserShareMode={laserShareMode}
          remoteLaserStrokes={remoteLaserStrokes}
          onSaveStateChange={handleSaveStateChange}
          onSaveControlsReady={handleSaveControlsReady}
        />
      </section>
    </main>
  );
}

function RealtimeStatusBadge({
  status,
}: {
  status: 'connecting' | 'connected' | 'closed' | 'error';
}) {
  const config = {
    connecting: { label: '연결 중', color: 'text-fg-muted', dot: 'bg-fg-muted/50 animate-pulse' },
    connected: { label: '실시간', color: 'text-live', dot: 'bg-live' },
    closed: { label: '연결 끊김', color: 'text-fg-muted', dot: 'bg-fg-muted/50' },
    error: { label: '연결 오류', color: 'text-rec', dot: 'bg-rec animate-pulse-rec' },
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
      <span>{label}</span>
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
