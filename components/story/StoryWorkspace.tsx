'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { Editor, TLRecord } from 'tldraw';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { StoryTitleInline } from '@/components/story/StoryTitleInline';
import { ShareButton } from '@/components/share/ShareButton';
import { StudioCanvas } from '@/components/canvas/StudioCanvas';
import { PresenceList } from '@/components/presence/PresenceList';
import { OnAirIndicator } from '@/components/brand/OnAirIndicator';
import { useStoryRealtime, type SyncPayload } from '@/lib/hooks/useStoryRealtime';
import { useChannelPresence } from '@/lib/hooks/useChannelPresence';
import type { User } from '@/lib/domain/user';
import type { Channel } from '@/lib/domain/channel';
import type { Story } from '@/lib/domain/story';
import { cn } from '@/lib/utils';

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
  const [isDrawingLocal, setIsDrawingLocal] = useState(false);

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

  const { presences, broadcast, updatePresence, status } = useStoryRealtime({
    storyId: story.id,
    user: realtimeUser,
    onSync: handleRemoteSync,
  });

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
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-divider bg-brand-bezel px-6 py-3">
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
        </div>

        {/* Right: presence + status + share + signin */}
        <div className="flex flex-wrap items-center gap-3">
          <OnAirIndicator active={someoneDrawing || isDrawingLocal} />
          <PresenceList presences={presences} currentUserId={realtimeUser.id} />
          <RealtimeStatusBadge status={status} />
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
          broadcast={broadcast}
          updatePresence={updatePresence}
          onEditorMount={(ed) => {
            editorRef.current = ed;
          }}
          onLocalDrawingChange={setIsDrawingLocal}
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
