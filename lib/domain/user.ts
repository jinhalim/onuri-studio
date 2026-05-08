// 인증 제공자 타입.
// MVP: anonymous만 활성. email은 Phase 9, Google/GitHub/Microsoft/Apple은 Phase 7+에서 활성.
export type AuthProvider =
  | 'anonymous'
  | 'email'
  | 'google'    // TODO[Phase7]
  | 'github'    // TODO[Phase7]
  | 'microsoft' // TODO[Phase7]
  | 'apple';    // TODO[Phase7]

export interface User {
  id: string;
  email: string | null;
  nickname: string;
  color: string; // hex, D-007 색상 충돌 회피 알고리즘으로 배정
  primaryAuthProvider: AuthProvider;
  linkedProviders: AuthProvider[];
  isAnonymous: boolean;
  role: 'user' | 'admin';
  createdAt: string;
  lastSeenAt: string;
}

export interface AnonymousSession {
  id: string;
  sessionToken: string;
  convertedUserId: string | null; // TODO[Phase9-Email]: 회원 전환 시 채움
  createdAt: string;
}
