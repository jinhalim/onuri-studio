'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { idSchema } from '@/lib/security/validators';

export interface ToggleFavoriteResult {
  ok: boolean;
  isFavorite?: boolean;
  error?: string;
}

// 채널의 즐겨찾기 토글. participations 의 channel-level row (story_id IS NULL)
// 를 upsert. row 없으면 새로 만들고 is_favorite=true.
// 사용자가 한번도 채널에 진입한 적 없어도 즐겨찾기 가능 (URL 만 알면).

export async function toggleFavoriteAction(channelId: string): Promise<ToggleFavoriteResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요' };

  const parsedId = idSchema.safeParse(channelId);
  if (!parsedId.success) return { ok: false, error: '채널 ID가 유효하지 않아요' };

  const supabase = createAdminClient();

  // 기존 participation 조회
  const { data: existing } = await supabase
    .from('participations')
    .select('is_favorite, role')
    .eq('user_id', user.id)
    .eq('channel_id', parsedId.data)
    .is('story_id', null)
    .maybeSingle();

  // 채널이 존재하는지 + 소유자인지 확인 (role 결정용)
  const { data: channel, error: chErr } = await supabase
    .from('channels')
    .select('owner_id')
    .eq('id', parsedId.data)
    .maybeSingle();
  if (chErr || !channel) return { ok: false, error: '채널을 찾을 수 없어요' };
  const role = channel.owner_id === user.id ? 'owner' : 'visitor';

  const nextValue = !existing?.is_favorite;
  const { error } = await supabase.from('participations').upsert(
    {
      user_id: user.id,
      channel_id: parsedId.data,
      story_id: null,
      role,
      is_favorite: nextValue,
      last_visited_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,channel_id,story_id' },
  );

  if (error) {
    console.error('[toggleFavoriteAction] upsert 실패:', error);
    return { ok: false, error: '즐겨찾기 변경 실패' };
  }

  revalidatePath('/me');
  return { ok: true, isFavorite: nextValue };
}
