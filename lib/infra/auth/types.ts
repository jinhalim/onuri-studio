import type { AuthProvider } from '@/lib/domain/user';

// AuthProvider 어댑터 인터페이스.
// MVP는 anonymous만 활성. email/SSO/Workspace는 stub 유지하다가 해당 Phase에서 본문 구현.

export interface AuthResult {
  userId: string;
  isAnonymous: boolean;
  redirectTo: string;
}

export interface AuthProviderAdapter {
  id: AuthProvider;
  /** 환경변수/설정 기준으로 활성 여부 반환. UI 표시 결정 근거. */
  isEnabled(): boolean;
  /** 로그인 시작. 입력은 provider별로 다름 (anonymous: nickname, email: email 주소 등). */
  signIn(input: unknown): Promise<AuthResult>;
  /** OAuth/매직링크 콜백 처리. 해당 없는 provider는 미구현. */
  handleCallback?(req: Request): Promise<AuthResult>;
}
