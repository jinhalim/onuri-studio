'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/infra/supabase/client';
import { listMyNotificationsAction } from '@/app/actions/list-my-notifications';
import type { Notification } from '@/lib/domain/notification';

// D-015: 본인이 받는 알림 inbox.
//
// 데이터 흐름:
//   1) 초기 fetch: server action `listMyNotificationsAction` (admin client → RLS 우회).
//      익명 사용자는 클라이언트 Supabase 세션이 없어 직접 SELECT 가 불가능 →
//      서버 액션이 본인 user_id 로 server-side 필터링 후 반환.
//   2) Realtime: broadcast 채널 `user-notifications:{userId}` 구독.
//      server action 이 DB INSERT/UPDATE 후 같은 채널로 broadcast →
//      클라이언트는 알림 ID 만 받고 다시 server action 으로 refetch.
//
// broadcast payload 는 메타정보만 (notificationId) — 본문은 refetch 로.
// (broadcast 자체엔 인증/RLS 가 없어서 민감 정보 담지 않음.)

export interface UseUserNotificationsOptions {
  userId: string | null;
}

export interface UseUserNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  /** 강제 재조회 (server action 호출 후 등 즉시 반영용) */
  refetch: () => Promise<void>;
  /** 낙관적: 1건 read 처리 */
  markReadLocally: (id: string) => void;
}

export function useUserNotifications({
  userId,
}: UseUserNotificationsOptions): UseUserNotificationsResult {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // refetch 의 최신 버전을 broadcast handler 가 부를 수 있게 ref 미러
  const refetchRef = useRef<() => Promise<void>>(async () => {});

  const refetch = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listMyNotificationsAction();
      if (res.ok) setNotifications(res.notifications);
    } catch (err) {
      console.error('[useUserNotifications] refetch 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  // 초기 fetch + userId 변경 시 reset
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    void refetch();
  }, [userId, refetch]);

  // Realtime broadcast 구독
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch (err) {
      console.error('[useUserNotifications] Supabase client 생성 실패:', err);
      return;
    }

    const topic = `user-notifications:${userId}`;
    const channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'new_notification' }, () => {
        if (cancelled) return;
        void refetchRef.current();
      })
      .on('broadcast', { event: 'notification_updated' }, () => {
        if (cancelled) return;
        void refetchRef.current();
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          console.log('[useUserNotifications] status:', status);
        }
      });

    channelRef.current = channel;

    return () => {
      cancelled = true;
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [userId]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );

  const markReadLocally = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
  }, []);

  return { notifications, unreadCount, loading, refetch, markReadLocally };
}
