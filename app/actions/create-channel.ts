'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createChannel } from '@/lib/usecases/create-channel';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { channelNameSchema } from '@/lib/security/validators';
import { checkRateLimit } from '@/lib/usecases/check-rate-limit';

export interface CreateChannelState {
  ok: boolean;
  error?: string;
}

export async function createChannelAction(
  _prevState: CreateChannelState,
  formData: FormData,
): Promise<CreateChannelState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '먼저 닉네임으로 입장해주세요' };

  // Rate limit: 채널 생성 5회/분/사용자 (CLAUDE.md §7).
  const rl = await checkRateLimit({
    key: `channel:create:${user.id}`,
    maxPerWindow: 5,
    windowMs: 60_000,
  });
  if (!rl.ok) {
    return {
      ok: false,
      error: `채널 생성 요청이 너무 잦아요. ${rl.retryAfterSec}초 후 다시 시도해주세요.`,
    };
  }

  const raw = formData.get('name');
  const parsed = channelNameSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? '채널 이름이 유효하지 않아요' };
  }

  let channelId: string;
  try {
    const channel = await createChannel({ name: parsed.data, ownerId: user.id });
    channelId = channel.id;
  } catch (err) {
    console.error('[createChannelAction] 실패:', err);
    return { ok: false, error: '채널 생성 중 오류가 발생했어요' };
  }

  revalidatePath('/');
  revalidatePath('/me');
  redirect(`/ch/${channelId}`);
}
