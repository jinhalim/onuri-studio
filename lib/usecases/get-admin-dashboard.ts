import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// /admin 대시보드용 통계 + 최근 항목.
// 호출 전에 호출자가 user.role === 'admin' 검증해야 함 (페이지에서 처리).

export interface AdminDashboardStats {
  users: { total: number; anonymous: number; member: number };
  channels: { total: number };
  stories: { total: number; withSnapshot: number };
}

export interface RecentUserRow {
  id: string;
  nickname: string;
  isAnonymous: boolean;
  role: 'user' | 'admin';
  createdAt: string;
  lastSeenAt: string;
}

export interface RecentChannelRow {
  id: string;
  name: string;
  ownerId: string;
  ownerNickname: string;
  createdAt: string;
}

export interface RecentStoryRow {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  createdAt: string;
  snapshotUpdatedAt: string | null;
}

export interface AdminDashboard {
  stats: AdminDashboardStats;
  recentUsers: RecentUserRow[];
  recentChannels: RecentChannelRow[];
  recentStories: RecentStoryRow[];
}

const RECENT_LIMIT = 10;

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const supabase = createAdminClient();

  // count 들 병렬 실행
  const [
    usersTotalRes,
    usersAnonRes,
    channelsRes,
    storiesRes,
    storiesWithSnapshotRes,
    recentUsersRes,
    recentChannelsRes,
    recentStoriesRes,
  ] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('is_anonymous', true),
    supabase.from('channels').select('id', { count: 'exact', head: true }),
    supabase.from('stories').select('id', { count: 'exact', head: true }),
    supabase
      .from('stories')
      .select('id', { count: 'exact', head: true })
      .not('snapshot_updated_at', 'is', null),
    supabase
      .from('users')
      .select('id, nickname, is_anonymous, role, created_at, last_seen_at')
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from('channels')
      .select('id, name, owner_id, created_at')
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from('stories')
      .select(
        'id, channel_id, title, created_at, snapshot_updated_at, channels!inner(name)',
      )
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
  ]);

  const usersTotal = usersTotalRes.count ?? 0;
  const usersAnon = usersAnonRes.count ?? 0;

  // recent channels 의 owner nickname N+1 방지
  const ownerIds = Array.from(
    new Set((recentChannelsRes.data ?? []).map((c) => c.owner_id as string)),
  );
  let nicknameById = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from('users')
      .select('id, nickname')
      .in('id', ownerIds);
    nicknameById = new Map((owners ?? []).map((o) => [o.id, o.nickname]));
  }

  return {
    stats: {
      users: {
        total: usersTotal,
        anonymous: usersAnon,
        member: Math.max(0, usersTotal - usersAnon),
      },
      channels: { total: channelsRes.count ?? 0 },
      stories: {
        total: storiesRes.count ?? 0,
        withSnapshot: storiesWithSnapshotRes.count ?? 0,
      },
    },
    recentUsers: (recentUsersRes.data ?? []).map((u) => ({
      id: u.id as string,
      nickname: u.nickname as string,
      isAnonymous: u.is_anonymous as boolean,
      role: u.role as 'user' | 'admin',
      createdAt: u.created_at as string,
      lastSeenAt: u.last_seen_at as string,
    })),
    recentChannels: (recentChannelsRes.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      ownerId: c.owner_id as string,
      ownerNickname: nicknameById.get(c.owner_id as string) ?? '익명',
      createdAt: c.created_at as string,
    })),
    recentStories: (recentStoriesRes.data ?? []).map((s) => ({
      id: s.id as string,
      channelId: s.channel_id as string,
      channelName: (s.channels as unknown as { name: string }).name,
      title: s.title as string,
      createdAt: s.created_at as string,
      snapshotUpdatedAt: (s.snapshot_updated_at as string | null) ?? null,
    })),
  };
}
