'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { User, AuthProvider } from '@/lib/domain/user';

// useOnuriAuth — Provider 추상화 훅.
// MVP에선 enabledProviders === ['anonymous']. Phase 7/9 활성화 시 자동으로 확장.
//
// 시그니처는 Phase 1부터 최종 형태로 고정.
// 비활성 메서드(예: convertToMember)는 명시적으로 throw 한다.

export interface OnuriAuthState {
  user: User | null;
  status: 'loading' | 'anonymous' | 'authenticated' | 'unauthenticated';
  enabledProviders: AuthProvider[];
  /** Phase 9에서 emailProvider 활성화 시 비로소 호출 가능. 그 전엔 throw 'EMAIL_AUTH_DISABLED' */
  convertToMember: (email: string) => Promise<void>;
}

const OnuriAuthContext = createContext<OnuriAuthState | null>(null);

interface OnuriAuthProviderProps {
  user: User | null;
  enabledProviders: AuthProvider[];
  children: ReactNode;
}

export function OnuriAuthProvider({ user, enabledProviders, children }: OnuriAuthProviderProps) {
  const status: OnuriAuthState['status'] = !user
    ? 'unauthenticated'
    : user.isAnonymous
      ? 'anonymous'
      : 'authenticated';

  const value: OnuriAuthState = {
    user,
    status,
    enabledProviders,
    async convertToMember(_email: string) {
      if (!enabledProviders.includes('email')) {
        throw new Error(
          'EMAIL_AUTH_DISABLED: 이메일 매직 링크는 Phase 9에서 활성화됩니다.',
        );
      }
      // TODO[Phase9-Email]: Server Action 호출 + 익명 자산 이전
      throw new Error('NOT_IMPLEMENTED: Phase 9에서 본문 구현 예정');
    },
  };

  return <OnuriAuthContext.Provider value={value}>{children}</OnuriAuthContext.Provider>;
}

export function useOnuriAuth(): OnuriAuthState {
  const ctx = useContext(OnuriAuthContext);
  if (!ctx) {
    throw new Error('useOnuriAuth must be used within <OnuriAuthProvider>');
  }
  return ctx;
}
