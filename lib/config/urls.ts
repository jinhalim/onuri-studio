import { env } from './env';

// 모든 외부 노출 URL은 본 헬퍼만 사용한다. 하드코딩 금지.
// Phase 9에서 NEXT_PUBLIC_APP_URL만 교체하면 모든 URL이 자동 갱신.

export const urls = {
  base: () => env.NEXT_PUBLIC_APP_URL,
  authCallback: () => `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  channel: (id: string) => `${env.NEXT_PUBLIC_APP_URL}/ch/${id}`,
  story: (channelId: string, storyId: string) =>
    `${env.NEXT_PUBLIC_APP_URL}/ch/${channelId}/story/${storyId}`,
  myPage: () => `${env.NEXT_PUBLIC_APP_URL}/me`,
  admin: () => `${env.NEXT_PUBLIC_APP_URL}/admin`,
} as const;
