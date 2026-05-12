import type { AuthProvider } from '@/lib/domain/user';
import type { AuthProviderAdapter } from './types';
import { anonymousProvider } from './anonymous-provider';
import { emailProvider } from './email-provider';
import { googleProvider } from './google-provider';
// TODO[Phase7]: import { githubProvider } from './github-provider';

// AuthProvider 활성화 레지스트리.
// MVP+D-013: anonymous + google 활성. (google 은 env.GOOGLE_CLIENT_ID 있을 때만)
// Phase 9: emailProvider 본문 구현 시 자동으로 isEnabled() === true 되어 활성.
export const authRegistry: Record<AuthProvider, AuthProviderAdapter | null> = {
  anonymous: anonymousProvider,
  email: emailProvider,    // stub. isEnabled()는 RESEND_API_KEY/EMAIL_FROM 유무로 판정.
  google: googleProvider,  // D-013. isEnabled()는 GOOGLE_CLIENT_ID 유무로 판정.
  github: null,            // TODO[Phase7]: githubProvider
  microsoft: null,          // TODO[Phase7]
  apple: null,              // TODO[Phase7]
};

export function enabledProviders(): AuthProvider[] {
  return (Object.entries(authRegistry) as [AuthProvider, AuthProviderAdapter | null][])
    .filter(([, p]) => p?.isEnabled())
    .map(([id]) => id);
}

export function getProvider(id: AuthProvider): AuthProviderAdapter {
  const p = authRegistry[id];
  if (!p) throw new Error(`AUTH_PROVIDER_NOT_REGISTERED: ${id}`);
  if (!p.isEnabled()) throw new Error(`AUTH_PROVIDER_DISABLED: ${id}`);
  return p;
}
