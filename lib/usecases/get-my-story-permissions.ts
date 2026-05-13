import 'server-only';
import { createAdminClient } from '@/lib/infra/supabase/admin';

// D-015 권한 이력 — 마이페이지 표시용.
// 두 관점:
//   1) received: 본인이 다른 스토리에서 'editor' 권한을 받은 목록
//   2) granted:  본인 소유 스토리에 다른 사용자가 editor 권한을 받은 목록 (owner 만 의미 있음)

export interface ReceivedPermission {
  id: string;
  storyId: string;
  storyTitle: string;
  channelId: string;
  channelName: string;
  ownerNickname: string;
  grantedAt: string;
}

export interface GrantedPermission {
  id: string;
  storyId: string;
  storyTitle: string;
  channelId: string;
  /** 권한을 받은 사용자. */
  granteeUserId: string;
  granteeNickname: string;
  granteeColor: string;
  grantedAt: string;
}

export interface MyStoryPermissions {
  received: ReceivedPermission[];
  granted: GrantedPermission[];
}

export async function getMyStoryPermissions(
  userId: string,
): Promise<MyStoryPermissions> {
  const admin = createAdminClient();

  // 1) received: story_permissions where user_id = me
  //    join stories → channels → users(owner)
  const { data: receivedRows, error: receivedErr } = await admin
    .from('story_permissions')
    .select(
      `
      id,
      granted_at,
      story_id,
      stories!inner (
        id,
        title,
        channel_id,
        channels!inner (
          id,
          name,
          owner_id,
          users!channels_owner_id_fkey ( nickname )
        )
      )
    `,
    )
    .eq('user_id', userId)
    .eq('role', 'editor')
    .order('granted_at', { ascending: false });

  if (receivedErr) {
    console.error('[getMyStoryPermissions] received 조회 실패:', receivedErr);
  }

  const received: ReceivedPermission[] = (receivedRows ?? []).flatMap((row) => {
    const story = row.stories as unknown as {
      id: string;
      title: string;
      channel_id: string;
      channels: {
        id: string;
        name: string;
        owner_id: string;
        users: { nickname: string } | null;
      };
    } | null;
    if (!story) return [];
    return [
      {
        id: row.id as string,
        storyId: story.id,
        storyTitle: story.title,
        channelId: story.channels.id,
        channelName: story.channels.name,
        ownerNickname: story.channels.users?.nickname ?? '(알 수 없음)',
        grantedAt: row.granted_at as string,
      },
    ];
  });

  // 2) granted: 본인 소유 채널의 스토리에서 editor 권한 받은 사람들.
  //    2-step: (a) 본인 소유 스토리 id 조회 → (b) 그 story_id 들의 permissions.
  const { data: myStories } = await admin
    .from('stories')
    .select('id, title, channel_id, channels!inner(owner_id)')
    .eq('channels.owner_id', userId);

  const myStoryIds = (myStories ?? []).map((s) => s.id as string);
  const storyMetaById = new Map(
    (myStories ?? []).map((s) => [
      s.id as string,
      { title: s.title as string, channelId: s.channel_id as string },
    ]),
  );

  let granted: GrantedPermission[] = [];
  if (myStoryIds.length > 0) {
    const { data: grantedRows, error: grantedErr } = await admin
      .from('story_permissions')
      .select(
        `
        id,
        granted_at,
        story_id,
        user_id,
        users!story_permissions_user_id_fkey ( nickname, color )
      `,
      )
      .eq('role', 'editor')
      .in('story_id', myStoryIds)
      .order('granted_at', { ascending: false });

    if (grantedErr) {
      console.error('[getMyStoryPermissions] granted 조회 실패:', grantedErr);
    }

    granted = (grantedRows ?? []).flatMap((row) => {
      const meta = storyMetaById.get(row.story_id as string);
      if (!meta) return [];
      const grantee = row.users as unknown as {
        nickname: string;
        color: string;
      } | null;
      if (!grantee) return [];
      return [
        {
          id: row.id as string,
          storyId: row.story_id as string,
          storyTitle: meta.title,
          channelId: meta.channelId,
          granteeUserId: row.user_id as string,
          granteeNickname: grantee.nickname,
          granteeColor: grantee.color,
          grantedAt: row.granted_at as string,
        },
      ];
    });
  }

  return { received, granted };
}
