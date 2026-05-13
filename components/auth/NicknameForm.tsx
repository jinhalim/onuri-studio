'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  signInAnonymous,
  type SignInAnonymousState,
} from '@/app/actions/sign-in-anonymous';
import { cn } from '@/lib/utils';

const initialState: SignInAnonymousState = { ok: false };

interface NicknameFormProps {
  /** D-014: 미인증 사용자가 다른 URL 로 접근 시 middleware 가 `?next=...` 보존.
   * 가입 성공 후 그 URL 로 redirect (signInAnonymous action 에서 처리). */
  next?: string;
}

export function NicknameForm({ next }: NicknameFormProps) {
  const [state, formAction] = useFormState(signInAnonymous, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-3">
      {next && <input type="hidden" name="next" value={next} />}
      <label htmlFor="nickname" className="text-sm text-fg-muted">
        닉네임
      </label>
      <input
        id="nickname"
        name="nickname"
        type="text"
        required
        autoComplete="off"
        autoFocus
        maxLength={24}
        placeholder="예: 누리"
        className={cn(
          'h-12 rounded-md bg-brand-surface px-4 text-base text-fg outline-none',
          'border border-divider transition-colors',
          'focus:border-live focus:ring-2 focus:ring-live/30',
          'placeholder:text-fg-muted/60',
        )}
      />
      <SubmitButton />
      {state.error && (
        <p role="alert" className="text-sm text-rec">
          {state.error}
        </p>
      )}
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(
        'h-12 rounded-md bg-rec px-6 font-semibold text-fg',
        'transition-all duration-200 ease-onuri',
        'hover:brightness-110 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {pending ? '입장 중…' : '스튜디오 켜기'}
    </button>
  );
}
