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
  /**
   * 마지막으로 track() 된 시각 (ms epoch).
   * Supabase Realtime 은 CLOSED→재구독 사이클에서 stale presence 가
   * 잠시 남아있을 수 있다. 같은 userId 의 여러 엔트리 중 freshest 를 골라야
   * 옛 `isDrawing: true` 가 새로운 `false` 를 가리지 않는다.
   */
  updatedAt: number;
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
  /** 사용자가 채널을 떠났을 때 호출. cursor/laser 같은 보조 state 정리용. */
  onPresenceLeave?: (userId: string) => void;
  /** 채널 재연결 (CLOSED → SUBSCRIBED) 시 호출. missing broadcast 회복용. */
  onReconnect?: () => void;
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
  /**
   * 채널 연결 상태.
   * - 'overflow': 정원 초과 — 즉시 untrack 후 사용자가 다시 시도해야 입장 가능.
   */
  status: 'connecting' | 'connected' | 'closed' | 'error' | 'overflow';
}

// 스토리 화이트보드 1개당 동시 접속 정원.
// Quick wins + throttle 조정 후 안정 운영 가능한 상한.
// 50명 운영이 필요해지면 Yjs CRDT 마이그레이션으로 이행 (DESIGN.md § 17.9 참고).
export const MAX_STORY_PRESENCES = 25;

export function useStoryRealtime({
  storyId,
  user,
  onSync,
  onLaser,
  onCursor,
  onPresenceLeave,
  onReconnect,
}: UseStoryRealtimeOptions): UseStoryRealtimeResult {
  const channelRef = useRef<RealtimeChannel | null>(null);
  // 채널 SUBSCRIBED 여부. send 호출 전 ready 체크용.
  // Supabase Realtime SDK 가 미준비 채널에서 send 호출 시 REST fallback 하면서
  // deprecation warning 발생 → ready 일 때만 send 호출해서 warning + 불필요한 REST 호출 차단.
  const isReadyRef = useRef(false);
  // overflow 상태 ref 미러 — subscribe 콜백에서 자동 재시도 결정용.
  const overflowRef = useRef(false);
  const presenceRef = useRef<PresenceState>({
    userId: user.id,
    nickname: user.nickname,
    color: user.color,
    cursor: null,
    isDrawing: false,
    updatedAt: Date.now(),
  });
  const onSyncRef = useRef(onSync);
  const onLaserRef = useRef(onLaser);
  const onCursorRef = useRef(onCursor);
  const onPresenceLeaveRef = useRef(onPresenceLeave);
  const onReconnectRef = useRef(onReconnect);
  // 첫 SUBSCRIBED 는 reconnect 가 아님 (초기 연결).
  // 두 번째 이상 SUBSCRIBED 일 때만 onReconnect 발화.
  const hasSubscribedOnceRef = useRef(false);
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
    onPresenceLeaveRef.current = onPresenceLeave;
  }, [onPresenceLeave]);
  useEffect(() => {
    onReconnectRef.current = onReconnect;
  }, [onReconnect]);

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

    const channel = supabase.channel(topic, {
      config: {
        presence: { key: user.id },
        broadcast: { self: false }, // 자기 메시지는 받지 않음 (loop 방지)
      },
    });

    channel
      .on('broadcast', { event: 'sync' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        onSyncRef.current(payload as SyncPayload);
      })
      .on('broadcast', { event: 'laser' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        onLaserRef.current?.(payload as LaserPayload);
      })
      .on('broadcast', { event: 'cursor' }, ({ payload }) => {
        if (!payload || typeof payload !== 'object') return;
        onCursorRef.current?.(payload as CursorPayload);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceState>();
        // 같은 user.id 가 여러 엔트리로 보일 수 있다 (멀티탭 정상 / CLOSED→재구독
        // 사이클에서 stale entry 비정상). updatedAt 기준 freshest 우선 dedupe.
        const dedupedMap = new Map<string, PresenceState>();
        for (const p of Object.values(state).flat()) {
          const existing = dedupedMap.get(p.userId);
          if (!existing || (p.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
            dedupedMap.set(p.userId, p);
          }
        }
        const list = Array.from(dedupedMap.values());

        // 정원 검사: 본인이 이미 dedupedMap 에 포함됐고 총원이 MAX 초과면
        // 내가 마지막에 들어와 정원을 넘긴 사람 → 즉시 untrack + overflow 상태 알림.
        // Race window 가 있어서 동시 입장 시 N 명까지 잠시 초과할 수 있지만 곧 해소.
        const includesMe = dedupedMap.has(user.id);
        if (includesMe && list.length > MAX_STORY_PRESENCES) {
          void channel.untrack();
          isReadyRef.current = false;
          overflowRef.current = true;
          if (!cancelled) {
            setStatus('overflow');
            setPresences([]);
          }
          return;
        }

        if (!cancelled) setPresences(list);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        // 떠난 사용자의 보조 state (cursor 등) 정리 — 메모리 절약 + 즉시 사라짐
        const ids = new Set<string>();
        if (typeof key === 'string') ids.add(key);
        for (const p of leftPresences ?? []) {
          const userId = (p as unknown as { userId?: unknown })?.userId;
          if (typeof userId === 'string') ids.add(userId);
        }
        for (const id of ids) onPresenceLeaveRef.current?.(id);
      });

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = (delayMs: number) => {
      if (cancelled) return;
      if (retryCountRef.current >= MAX_RETRIES) {
        console.error('[useStoryRealtime] 최대 재시도 초과 — 사용자가 새로고침 필요');
        return;
      }
      const wait = delayMs * Math.pow(1.5, retryCountRef.current); // exponential backoff
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (cancelled) return;
        retryCountRef.current += 1;
        // useEffect 를 재실행시켜 새 channel 을 만든다 (subscribe 두 번 호출 금지)
        setRetryTick((t) => t + 1);
      }, wait);
    };

    channel.subscribe(async (subscribeStatus) => {
      if (cancelled) return;
      if (subscribeStatus === 'SUBSCRIBED') {
        retryCountRef.current = 0; // 성공 시 카운터 리셋
        isReadyRef.current = true; // send 허용
        setStatus('connected');
        // 재구독 시 stale entry 보다 fresh 하게 보이도록 updatedAt 갱신.
        presenceRef.current = { ...presenceRef.current, updatedAt: Date.now() };
        await channel.track(presenceRef.current);
        // 첫 SUBSCRIBED 는 초기 연결, 두 번째 이상은 재연결.
        // 재연결 시 호출자(StoryWorkspace)가 서버 snapshot 재로드해서
        // missing broadcast 들을 회복할 수 있게 알림.
        if (hasSubscribedOnceRef.current) {
          onReconnectRef.current?.();
        }
        hasSubscribedOnceRef.current = true;
      } else if (subscribeStatus === 'CLOSED') {
        if (!cancelled) {
          isReadyRef.current = false;
          // overflow 로 untrack 한 경우 자동 재시도 안 함 — 사용자가 수동으로 다시 시도.
          if (overflowRef.current) {
            setStatus('overflow');
            return;
          }
          setStatus('closed');
          scheduleRetry(1500);
        }
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        isReadyRef.current = false;
        setStatus('error');
        scheduleRetry(3000);
      }
    });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      isReadyRef.current = false;
      if (retryTimer) clearTimeout(retryTimer);
      // 남은 broadcast buffer 가 있으면 즉시 flush — 페이지 떠나기 전 마지막 변경 전송.
      if (broadcastTimerRef.current) {
        clearTimeout(broadcastTimerRef.current);
        broadcastTimerRef.current = null;
        // isReadyRef = false 라 실제 send 는 skip 되지만 buffer 정리는 됨.
      }
      channel.unsubscribe();
      channelRef.current = null;
    };
    // retryTick 변화 시 새 channel 인스턴스 생성 (Supabase 제약 우회)
  }, [storyId, user.id, user.nickname, user.color, retryTick]);

  // A3: broadcast 송신을 50ms window 로 batch.
  // 매 store change 마다 즉시 송신 → 50명 동시 편집 시 broadcast 폭주 + 수신측 re-render 폭주.
  // 50ms window 안의 변경을 누적 후 1번 송신. 같은 record id 의 updated 는 마지막 것만 (dedupe).
  // 50ms 는 사용자 체감 거의 없음 (~20fps, cursor throttle 과 동급).
  const broadcastBufferRef = useRef<{
    added: Map<string, unknown>;
    updated: Map<string, unknown>;
    removed: Set<string>;
  }>({
    added: new Map(),
    updated: new Map(),
    removed: new Set(),
  });
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBroadcastBuffer = useCallback(() => {
    broadcastTimerRef.current = null;
    const channel = channelRef.current;
    if (!channel || !isReadyRef.current) {
      // ready 아니면 버퍼만 초기화 (재시도 안 함 — 다음 변경 + autosave 로 자연 회복)
      broadcastBufferRef.current = {
        added: new Map(),
        updated: new Map(),
        removed: new Set(),
      };
      return;
    }
    const buf = broadcastBufferRef.current;
    if (buf.added.size === 0 && buf.updated.size === 0 && buf.removed.size === 0) return;
    const payload: SyncPayload = {
      fromUserId: user.id,
      added: buf.added.size > 0 ? Array.from(buf.added.values()) : undefined,
      updated: buf.updated.size > 0 ? Array.from(buf.updated.values()) : undefined,
      removed: buf.removed.size > 0 ? Array.from(buf.removed) : undefined,
    };
    broadcastBufferRef.current = {
      added: new Map(),
      updated: new Map(),
      removed: new Set(),
    };
    void channel.send({ type: 'broadcast', event: 'sync', payload });
  }, [user.id]);

  const broadcast = useCallback(
    (changes: Omit<SyncPayload, 'fromUserId'>) => {
      if (!isReadyRef.current) return;
      const buf = broadcastBufferRef.current;
      // 같은 record id 의 added/updated 는 최신 것만 유지 (Map.set 으로 덮어쓰기).
      // record.id 추출 — added/updated 는 객체이고 보통 .id 속성 있음.
      if (changes.added) {
        for (const r of changes.added) {
          const id = (r as { id?: string }).id;
          if (id) {
            buf.added.set(id, r);
            buf.updated.delete(id); // 새로 added 면 이전 updated 무시
          }
        }
      }
      if (changes.updated) {
        for (const r of changes.updated) {
          const id = (r as { id?: string }).id;
          if (id && !buf.added.has(id)) {
            buf.updated.set(id, r); // 이미 added 큐에 있으면 add 가 최종 — updated 무시
          }
        }
      }
      if (changes.removed) {
        for (const id of changes.removed) {
          buf.removed.add(id);
          buf.added.delete(id); // remove 가 최종 — add/update 무시
          buf.updated.delete(id);
        }
      }
      // 이미 timer 가 돌고 있으면 추가 schedule 안 함.
      if (broadcastTimerRef.current === null) {
        broadcastTimerRef.current = setTimeout(flushBroadcastBuffer, 50);
      }
    },
    [flushBroadcastBuffer],
  );

  const updatePresence = useCallback(
    (partial: Partial<Omit<PresenceState, 'userId' | 'nickname' | 'color'>>) => {
      const channel = channelRef.current;
      if (!channel) return;
      // updatedAt 을 항상 갱신해서 stale entry 와 구분되게 한다 (dedupe freshest-wins).
      presenceRef.current = { ...presenceRef.current, ...partial, updatedAt: Date.now() };
      void channel.track(presenceRef.current);
    },
    [],
  );

  const broadcastLaser = useCallback(
    (point: Omit<LaserPayload, 'fromUserId' | 'color'>) => {
      const channel = channelRef.current;
      if (!channel || !isReadyRef.current) return;
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
      if (!channel || !isReadyRef.current) return;
      void channel.send({
        type: 'broadcast',
        event: 'cursor',
        payload: { fromUserId: user.id, ...point } satisfies CursorPayload,
      });
    },
    [user.id],
  );

  // Keep-alive: 주기적 빈 broadcast 로 idle timeout 방지.
  // Supabase Realtime free tier 의 idle 채널 종료 회피. 50명 동시 접속 환경에선
  // 너무 짧으면 메시지 카운트 폭증 → 45초로 늘림 (idle timeout ~60s 이내).
  useEffect(() => {
    if (status !== 'connected') return;
    const interval = window.setInterval(() => {
      const channel = channelRef.current;
      if (!channel || !isReadyRef.current) return;
      void channel.send({
        type: 'broadcast',
        event: 'keepalive',
        payload: { ts: Date.now() },
      });
    }, 45_000);
    return () => window.clearInterval(interval);
  }, [status]);

  return { presences, broadcast, broadcastLaser, broadcastCursor, updatePresence, status };
}
