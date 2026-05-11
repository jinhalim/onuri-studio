'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/infra/supabase/client';
import type { User } from '@/lib/domain/user';

// Channel Guide / Story 페이지에서 채널 단위 presence 만 가벼운 채널로 공유.
// 본 채널은 cursor/broadcast 없이 presence 만 사용 → 트래픽 절약.
// 채널 이름: presence-channel:{channelId}
//
// 각 사용자가 어느 스토리에 있는지 + 그리는 중인지를 기록.
// Channel Guide 는 이걸로 "라이브 도트"를 그린다.

export interface ChannelPresence {
  userId: string;
  nickname: string;
  color: string;
  /** 현재 어디 있는지. null = Channel Guide, 값 = 그 storyId. */
  currentStoryId: string | null;
  isDrawing: boolean;
}

export interface UseChannelPresenceOptions {
  channelId: string;
  user: User | null;
  /** 현재 사용자가 진입한 스토리. Channel Guide 페이지면 null. */
  currentStoryId?: string | null;
  /** 본인이 그리고 있는 중인지. Story 페이지에서 갱신. */
  isDrawing?: boolean;
}

export function useChannelPresence({
  channelId,
  user,
  currentStoryId = null,
  isDrawing = false,
}: UseChannelPresenceOptions) {
  const [presences, setPresences] = useState<ChannelPresence[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const stateRef = useRef<ChannelPresence | null>(null);

  // 본인 presence를 currentStoryId / isDrawing 변화 시 갱신.
  useEffect(() => {
    if (!user) return;
    stateRef.current = {
      userId: user.id,
      nickname: user.nickname,
      color: user.color,
      currentStoryId,
      isDrawing,
    };
    const channel = channelRef.current;
    if (channel) void channel.track(stateRef.current);
  }, [user, currentStoryId, isDrawing]);

  useEffect(() => {
    if (!user) return; // 비로그인 사용자는 presence 안 보냄
    let cancelled = false;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (err) {
      console.error('[useChannelPresence] Supabase client 생성 실패:', err);
      return;
    }

    const topic = `presence-channel:${channelId}`;
    const channel = supabase.channel(topic, {
      config: {
        presence: { key: user.id },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<ChannelPresence>();
      // userId 단위 dedupe. 같은 사용자가 여러 탭이면 가장 최신/그리는 중인 항목 채택.
      const dedupedMap = new Map<string, ChannelPresence>();
      for (const p of Object.values(state).flat()) {
        const existing = dedupedMap.get(p.userId);
        if (!existing || (p.isDrawing && !existing.isDrawing)) {
          dedupedMap.set(p.userId, p);
        }
      }
      const list = Array.from(dedupedMap.values());
      if (!cancelled) setPresences(list);
    });

    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    channel.subscribe(async (status) => {
      if (cancelled) return;
      console.log('[useChannelPresence] status:', status);
      if (status === 'SUBSCRIBED' && stateRef.current) {
        await channel.track(stateRef.current);
      } else if (status === 'CLOSED') {
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          if (cancelled) return;
          console.log('[useChannelPresence] CLOSED 후 재구독 시도');
          void channel.subscribe();
        }, 1500);
      }
    });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      channel.unsubscribe();
      channelRef.current = null;
    };
    // channelId 또는 user.id 변경 시에만 재구독
  }, [channelId, user]);

  return { presences };
}
