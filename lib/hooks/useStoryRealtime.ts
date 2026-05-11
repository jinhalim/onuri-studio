'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/infra/supabase/client';
import type { User } from '@/lib/domain/user';

// 스토리별 Supabase Realtime 채널 구독.
// 채널 이름: story:{storyId}
// 메시지 종류:
//   - broadcast 'sync': tldraw store diff (added/updated/removed)
//   - presence: 사용자 닉네임/색상/커서/그리는 중 여부
//
// MVP 정책 (D-010): tldraw 변경은 last-write-wins, Yjs CRDT는 후속 마이그레이션.

export interface PresenceState {
  userId: string;
  nickname: string;
  color: string;
  cursor: { x: number; y: number } | null; // tldraw page coords
  isDrawing: boolean;
}

export interface SyncPayload {
  fromUserId: string;
  // tldraw 직렬화 호환 (TLRecord/TLId는 string 기반이라 그대로 JSON 가능)
  added?: unknown[];
  updated?: unknown[];
  removed?: string[];
}

export interface UseStoryRealtimeOptions {
  storyId: string;
  user: User;
  /** 원격에서 도착한 sync 이벤트 처리. 호출 측이 mergeRemoteChanges 로 적용. */
  onSync: (payload: SyncPayload) => void;
}

export interface UseStoryRealtimeResult {
  presences: PresenceState[];
  /** 본인 변경을 다른 사용자에게 broadcast. */
  broadcast: (changes: Omit<SyncPayload, 'fromUserId'>) => void;
  /** 본인 presence (커서/그리는 중) 갱신. */
  updatePresence: (partial: Partial<Omit<PresenceState, 'userId' | 'nickname' | 'color'>>) => void;
  /** 채널 연결 상태. UI 디버깅용. */
  status: 'connecting' | 'connected' | 'closed' | 'error';
}

export function useStoryRealtime({
  storyId,
  user,
  onSync,
}: UseStoryRealtimeOptions): UseStoryRealtimeResult {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const presenceRef = useRef<PresenceState>({
    userId: user.id,
    nickname: user.nickname,
    color: user.color,
    cursor: null,
    isDrawing: false,
  });
  const onSyncRef = useRef(onSync);
  const [presences, setPresences] = useState<PresenceState[]>([]);
  const [status, setStatus] = useState<UseStoryRealtimeResult['status']>('connecting');

  // onSync 콜백을 ref로 보관해서 effect 의존성에서 제외 (재구독 방지)
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);

  useEffect(() => {
    let cancelled = false;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (err) {
      console.error('[useStoryRealtime] Supabase client 생성 실패:', err);
      setStatus('error');
      return;
    }

    const topic = `story:${storyId}`;
    console.log('[useStoryRealtime] 채널 구독 시작:', topic, '(user:', user.nickname, ')');

    const channel = supabase.channel(topic, {
      config: {
        presence: { key: user.id },
        broadcast: { self: false }, // 자기 메시지는 받지 않음 (loop 방지)
      },
    });

    channel
      .on('broadcast', { event: 'sync' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        const p = payload as SyncPayload;
        if (p.fromUserId === user.id) return; // 안전망 (broadcast.self=false 무시되는 경우 대비)
        console.log('[useStoryRealtime] ← broadcast 수신:', {
          from: p.fromUserId,
          added: p.added?.length ?? 0,
          updated: p.updated?.length ?? 0,
          removed: p.removed?.length ?? 0,
        });
        onSyncRef.current(p);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        const list = Object.values(state).flat();
        console.log('[useStoryRealtime] presence sync:', list.length, '명 접속');
        if (!cancelled) setPresences(list);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[useStoryRealtime] → join:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[useStoryRealtime] ← leave:', key, leftPresences);
      });

    channel.subscribe(async (subscribeStatus, err) => {
      if (cancelled) return;
      console.log('[useStoryRealtime] subscribe status:', subscribeStatus, err ?? '');
      if (subscribeStatus === 'SUBSCRIBED') {
        setStatus('connected');
        const trackResult = await channel.track(presenceRef.current);
        console.log('[useStoryRealtime] track 결과:', trackResult);
      } else if (subscribeStatus === 'CLOSED') {
        setStatus('closed');
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        setStatus('error');
      }
    });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [storyId, user.id, user.nickname, user.color]);

  const broadcast = useCallback(
    (changes: Omit<SyncPayload, 'fromUserId'>) => {
      const channel = channelRef.current;
      if (!channel) {
        console.warn('[useStoryRealtime] broadcast 호출됐으나 channel null');
        return;
      }
      console.log('[useStoryRealtime] → broadcast 송신:', {
        added: changes.added?.length ?? 0,
        updated: changes.updated?.length ?? 0,
        removed: changes.removed?.length ?? 0,
      });
      void channel
        .send({
          type: 'broadcast',
          event: 'sync',
          payload: { fromUserId: user.id, ...changes } satisfies SyncPayload,
        })
        .then((result) => {
          if (result !== 'ok') {
            console.warn('[useStoryRealtime] broadcast send 결과:', result);
          }
        });
    },
    [user.id],
  );

  const updatePresence = useCallback(
    (partial: Partial<Omit<PresenceState, 'userId' | 'nickname' | 'color'>>) => {
      const channel = channelRef.current;
      if (!channel) return;
      presenceRef.current = { ...presenceRef.current, ...partial };
      void channel.track(presenceRef.current);
    },
    [],
  );

  return { presences, broadcast, updatePresence, status };
}
