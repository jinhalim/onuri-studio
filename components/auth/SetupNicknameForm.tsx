'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  setupNicknameAction,
  type SetupNicknameState,
} from '@/app/actions/setup-nickname';
import { cn } from '@/lib/utils';

const initialState: SetupNicknameState = { ok: false };

interface Props {
  suggested?: string;
}

export function SetupNicknameForm({ suggested }: Props) {
  const [state, formAction] = useFormState(setupNicknameAction, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-3">
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
        defaultValue={suggested ?? ''}
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
        'h-12 rounded-md bg-rec px-6 font-semibold text-white',
        'transition-all duration-200 ease-onuri',
        'hover:brightness-110 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {pending ? '저장 중…' : '확정하기'}
    </button>
  );
}
