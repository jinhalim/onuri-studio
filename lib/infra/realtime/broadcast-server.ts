import 'server-only';
import { env } from '@/lib/config/env';

// D-015: 서버사이드에서 Supabase Realtime broadcast 송신.
// 익명 사용자는 클라이언트 Supabase 세션이 없어서 Postgres Changes / RLS-protected SELECT
// 가 동작하지 않는다. 따라서 알림 push 는 RLS 와 무관한 broadcast 채널 사용.
//
// 구현: Supabase 의 REST 엔드포인트 `/realtime/v1/api/broadcast` 호출.
// (channel.subscribe + send 패턴보다 빠르고 ephemeral 소켓 안 만듦)
//
// 참고: 본 broadcast 자체는 인증/RLS 검증 안 함 — 메시지는 누구나 받을 수 있으므로
// payload 에 민감정보 (token, email 등) 담지 말 것. 알림 메타데이터만 보낸다.

export interface BroadcastMessage {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

export async function broadcastFromServer(message: BroadcastMessage): Promise<void> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('[broadcastFromServer] Supabase 미설정 — skip');
    return;
  }
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            topic: message.topic,
            event: message.event,
            payload: message.payload,
            private: false,
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[broadcastFromServer] 응답 비정상:', res.status, body);
    }
  } catch (err) {
    // 실패해도 본 흐름은 계속 — broadcast 는 보조 채널, DB 가 SSOT.
    console.error('[broadcastFromServer] 실패:', err);
  }
}
