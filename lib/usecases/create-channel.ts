import 'server-only';
import { nanoid } from 'nanoid';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { channelNameSchema } from '@/lib/security/validators';
import type { Channel } from '@/lib/domain/channel';

const ID_LENGTH = 12;
const MAX_RETRIES = 5;

export interface CreateChannelInput {
  name: string;
  ownerId: string;
}

// 채널 생성 + 소유자 participations(role='owner') 자동 등록.
// nanoid 12자(63bit 엔트로피)는 충돌이 사실상 0이지만,
// DB unique constraint 위반 시 최대 5회 재시도하는 방어 코드 포함.

export async function createChannel(input: CreateChannelInput): Promise<Channel> {
  const name = channelNameSchema.parse(input.name);
  const supabase = createAdminClient();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const id = nanoid(ID_LENGTH);

    const { data, error } = await supabase
      .from('channels')
      .insert({ id, name, owner_id: input.ownerId })
      .select()
      .single();

    if (!error && data) {
      // owner participation 기록
      await supabase.from('participations').upsert(
        {
          user_id: input.ownerId,
          channel_id: data.id,
          story_id: null,
          role: 'owner',
        },
        { onConflict: 'user_id,channel_id,story_id' },
      );

      return {
        id: data.id,
        name: data.name,
        ownerId: data.owner_id,
        createdAt: data.created_at,
      };
    }

    // unique violation 만 재시도 (Postgres 23505)
    const isDuplicate = error?.code === '23505';
    if (!isDuplicate) {
      console.error('[createChannel] insert 실패:', error);
      throw new Error(`CHANNEL_CREATE_FAILED: ${error?.message ?? 'unknown'}`);
    }
    // 재시도
  }

  throw new Error('CHANNEL_CREATE_FAILED: nanoid 충돌이 5회 연속 발생 (사실상 불가능, DB 상태 확인 필요)');
}
