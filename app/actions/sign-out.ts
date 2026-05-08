'use server';

import { revalidatePath } from 'next/cache';
import { clearAnonymousCookie } from '@/lib/infra/auth/anonymous-provider';

export async function signOut(): Promise<void> {
  // TODO[Phase9-Email]: 회원 JWT 세션도 동시 종료.
  clearAnonymousCookie();
  revalidatePath('/');
}
