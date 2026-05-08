import type { AuthProviderAdapter, AuthResult } from './types';
import { env } from '@/lib/config/env';

// TODO[Phase9-Email]: 본 stub 을 본문 구현으로 교체.
// Phase 9에서 Resend 도메인 인증 + Supabase signInWithOtp + handleCallback 구현.
// 그 전까지는 isEnabled() === false 이므로 AuthGate에 노출되지 않는다.

export const emailProvider: AuthProviderAdapter = {
  id: 'email',

  isEnabled() {
    // Phase 9에서 RESEND_API_KEY + EMAIL_FROM 둘 다 설정되면 자동 활성.
    return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  },

  async signIn(_input: unknown): Promise<AuthResult> {
    throw new Error(
      'EMAIL_AUTH_DISABLED: 이메일 매직 링크는 Phase 9에서 활성화됩니다. ' +
        'lib/infra/auth/email-provider.ts 를 구현하고 RESEND_API_KEY/EMAIL_FROM 을 설정하세요.',
    );
  },

  async handleCallback(_req: Request): Promise<AuthResult> {
    throw new Error('EMAIL_AUTH_DISABLED: Phase 9에서 활성화됩니다.');
  },
};
