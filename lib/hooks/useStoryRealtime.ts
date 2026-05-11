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

// 레이저 포인터 broadcast 페이로드.
// 한 stroke = pointer down ~ up 까지의 일련의 점.
// receiver 가 strokeId 로 점 누적, phase='end' 후 ~1.5초 페이드.
export interface LaserPayload {
  fromUserId: string;
  color: string;
  strokeId: string;
  x: number;
  y: number;
  phase: 'start' | 'move' | 'end';
}

// 커서 위치 broadcast 페이로드.
// presence.track 으로 보내면 Supabase 의 ~100ms 기본 rate limit 에 걸려 silent drop.
// broadcast 는 별도 채널이라 훨씬 관대 → 30Hz cursor 송신해도 안전.
export interface CursorPayload {
  fromUserId: string;
  x: number;
  y: number;
}

export interface UseStoryRealtimeOptions {
  storyId: string;
  user: User;
  /** 원격에서 도착한 sync 이벤트 처리. 호출 측이 mergeRemoteChanges 로 적용. */
  onSync: (payload: SyncPayload) => void;
  /** 원격 레이저 포인터 페이로드 처리. */
  onLaser?: (payload: LaserPayload) => void;
  /** 원격 커서 위치 페이로드 처리. */
  onCursor?: (payload: CursorPayload) => void;
}

export interface UseStoryRealtimeResult {
  presences: PresenceState[];
  /** 본인 변경을 다른 사용자에게 broadcast. */
  broadcast: (changes: Omit<SyncPayload, 'fromUserId'>) => void;
  /** 본인 레이저 포인터 점 broadcast (공유 모드일 때만 호출 권장). */
  broadcastLaser: (point: Omit<LaserPayload, 'fromUserId' | 'color'>) => void;
  /** 본인 커서 위치 broadcast (pointer_move 시). */
  broadcastCursor: (point: Omit<CursorPayload, 'fromUserId'>) => void;
  /** 본인 presence (그리는 중 상태 등) 갱신. cursor 는 broadcastCursor 사용. */
  updatePresence: (partial: Partial<Omit<PresenceState, 'userId' | 'nickname' | 'color'>>) => void;
  /** 채널 연결 상태. UI 디버깅용. */
  status: 'connecting' | 'connected' | 'closed' | 'error';
}

export function useStoryRealtime({
  storyId,
  user,
  onSync,
  onLaser,
  onCursor,
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
  const onLaserRef = useRef(onLaser);
  const onCursorRef = useRef(onCursor);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 10;
  const [presences, setPresences] = useState<PresenceState[]>([]);
  const [status, setStatus] = useState<UseStoryRealtimeResult['status']>('connecting');
  // useEffect 를 강제로 재실행시켜 새 channel 인스턴스를 만들기 위한 카운터.
  // Supabase Realtime 은 같은 channel 에 subscribe() 를 두 번 호출 못함 →
  // CLOSED/오류 시 본 카운터를 증가시켜 effect 가 새 channel 을 만들게 함.
  const [retryTick, setRetryTick] = useState(0);

  // 콜백을 ref로 보관해서 effect 의존성에서 제외 (재구독 방지)
  useEffect(() => {
    onSyncRef.current = onSync;
  }, [onSync]);
  useEffect(() => {
    onLaserRef.current = onLaser;
  }, [onLaser]);
  useEffect(() => {
    onCursorRef.current = onCursor;
  }, [onCursor]);

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
      .on('broadcast', { event: 'laser' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        const p = payload as LaserPayload;
        if (p.fromUserId === user.id) return;
        onLaserRef.current?.(p);
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        const p = payload as CursorPayload;
        if (p.fromUserId === user.id) return;
        onCursorRef.current?.(p);
      })
      // 시스템 이벤트(연결/끊김/오류) 가시화 — 디버깅용
      .on('system', {}, (payload: unknown) => {
        console.log('[useStoryRealtime] system event:', payload);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        // 같은 user.id 가 여러 탭으로 접속하면 배열 길이가 N. userId 단위로 dedupe.
        // 여러 탭 중 그리는 중인 탭이 있으면 그쪽을 우선 채택.
        const dedupedMap = new Map<string, PresenceState>();
        for (const p of Object.values(state).flat()) {
          const existing = dedupedMap.get(p.userId);
          if (!existing) {
            dedupedMap.set(p.userId, p);
          } else if (p.isDrawing && !existing.isDrawing) {
            dedupedMap.set(p.userId, p);
          }
        }
        const list = Array.from(dedupedMap.values());
        console.log(
          '[useStoryRealtime] presence sync:',
          list.length,
          '명 접속 (raw',
          Object.values(state).flat().length,
          ')',
        );
        if (!cancelled) setPresences(list);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[useStoryRealtime] → join:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[useStoryRealtime] ← leave:', key, leftPresences);
      });

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (delayMs: number, reason: string) => {
      if (cancelled) return;
      if (retryCountRef.current >= MAX_RETRIES) {
        console.error(
          `[useStoryRealtime] 최대 재시도 ${MAX_RETRIES}회 초과 — 자동 재구독 중단 (사용자가 새로고침 필요)`,
        );
        return;
      }
      const wait = delayMs * Math.pow(1.5, retryCountRef.current); // exponential backoff
      console.warn(
        `[useStoryRealtime] ${reason} → ${Math.round(wait)}ms 후 새 channel 으로 재구독 (시도 ${
          retryCountRef.current + 1
        }/${MAX_RETRIES})`,
      );
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (cancelled) return;
        retryCountRef.current += 1;
        // useEffect 를 재실행시켜 새 channel 을 만든다 (subscribe 두 번 호출 금지)
        setRetryTick((t) => t + 1);
      }, wait);
    };

    channel.subscribe(async (subscribeStatus, err) => {
      if (cancelled) return;
      console.log('[useStoryRealtime] subscribe status:', subscribeStatus, err ?? '');
      if (subscribeStatus === 'SUBSCRIBED') {
        retryCountRef.current = 0; // 성공 시 카운터 리셋
        setStatus('connected');
        const trackResult = await channel.track(presenceRef.current);
        console.log('[useStoryRealtime] track 결과:', trackResult);
      } else if (subscribeStatus === 'CLOSED') {
        if (!cancelled) {
          setStatus('closed');
          scheduleRetry(1500, 'CLOSED 수신');
        }
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        setStatus('error');
        scheduleRetry(3000, `${subscribeStatus} 수신`);
      }
    });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      channel.unsubscribe();
      channelRef.current = null;
    };
    // retryTick 변화 시 새 channel 인스턴스 생성 (Supabase 제약 우회)
  }, [storyId, user.id, user.nickname, user.color, retryTick]);

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

  const broadcastLaser = useCallback(
    (point: Omit<LaserPayload, 'fromUserId' | 'color'>) => {
      const channel = channelRef.current;
      if (!channel) return;
      void channel.send({
        type: 'broadcast',
        event: 'laser',
        payload: {
          fromUserId: user.id,
          color: user.color,
          ...point,
        } satisfies LaserPayload,
      });
    },
    [user.id, user.color],
  );

  const broadcastCursor = useCallback(
    (point: Omit<CursorPayload, 'fromUserId'>) => {
      const channel = channelRef.current;
      if (!channel) return;
      void channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { fromUserId: user.id, ...point } satisfies CursorPayload,
      });
    },
    [user.id],
  );

  // Keep-alive: 20초마다 빈 broadcast 송신해서 idle timeout 방지.
  // Supabase Realtime free tier 에서 idle 채널이 빠르게 닫히는 현상 완화.
  useEffect(() => {
    if (status !== 'connected') return;
    const interval = window.setInterval(() => {
      const channel = channelRef.current;
      if (!channel) return;
      void channel.send({
        type: 'broadcast',
        event: 'keepalive',
        payload: { ts: Date.now() },
      });
    }, 20_000);
    return () => window.clearInterval(interval);
  }, [status]);

  return { presences, broadcast, broadcastLaser, broadcastCursor, updatePresence, status };
}
