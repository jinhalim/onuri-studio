import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// 마이페이지 히스토리: 최근 방문한 채널 + 즐겨찾기.
// participations 테이블의 channel-level row (story_id IS NULL) 만 사용해서
// 한 채널을 한 행으로 본다. 스토리 단위 history 는 향후 확장.

export interface ChannelHistoryItem {
  channelId: string;
  channelName: string;
  ownerNickname: string;
  /** 본인이 owner 인지 visitor 인지. */
  myRole: 'owner' | 'visitor';
  lastVisitedAt: string;
  isFavorite: boolean;
}

export interface MyHistory {
  /** 최근 방문 (last_visited_at desc) — 본인 소유 채널 포함. 최대 RECENT_LIMIT 개. */
  recent: ChannelHistoryItem[];
  /** 즐겨찾기 — owner 여부 무관. */
  favorites: ChannelHistoryItem[];
}

const RECENT_LIMIT = 20;

export async function getMyHistory(userId: string): Promise<MyHistory> {
  const supabase = createAdminClient();

  // channel-level participation (story_id IS NULL) 만 조회.
  // 채널 join 으로 이름, owner_id 얻고, owner_id 로 닉네임 한 번 더 join.
  const { data, error } = await supabase
    .from('participations')
    .select(
      'channel_id, role, last_visited_at, is_favorite, channels!inner(id, name, owner_id)',
    )
    .eq('user_id', userId)
    .is('story_id', null)
    .order('last_visited_at', { ascending: false });

  if (error) {
    console.error('[getMyHistory] participations 조회 실패:', error);
    return { recent: [], favorites: [] };
  }

  type Row = {
    channel_id: string;
    role: 'owner' | 'visitor';
    last_visited_at: string;
    is_favorite: boolean;
    channels: { id: string; name: string; owner_id: string };
  };
  const rows = (data ?? []) as unknown as Row[];

  // owner_id 모아서 nickname 한꺼번에 fetch (N+1 방지)
  const ownerIds = Array.from(new Set(rows.map((r) => r.channels.owner_id)));
  let nicknameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from('users')
      .select('id, nickname')
      .in('id', ownerIds);
    nicknameById = new Map((owners ?? []).map((o) => [o.id, o.nickname]));
  }

  const all = rows.map((r) => ({
    channelId: r.channel_id,
    channelName: r.channels.name,
    ownerNickname: nicknameById.get(r.channels.owner_id) ?? '익명',
    myRole: r.role,
    lastVisitedAt: r.last_visited_at,
    isFavorite: r.is_favorite,
  }));

  return {
    recent: all.slice(0, RECENT_LIMIT),
    favorites: all.filter((c) => c.isFavorite),
  };
}
