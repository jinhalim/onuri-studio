'use client';

import { useFormState, useFormStatus } from 'react-dom';
import {
  createChannelAction,
  type CreateChannelState,
} from '@/app/actions/create-channel';
import { cn } from '@/lib/utils';

const initialState: CreateChannelState = { ok: false };

export function CreateChannelForm() {
  const [state, formAction] = useFormState(createChannelAction, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-md flex-col gap-3">
      <label htmlFor="channelName" className="text-sm text-fg-muted">
        새 채널 이름
      </label>
      {/* 모바일에서는 세로로 stack (입력 위, 버튼 아래 — 버튼이 풀폭). 태블릿/데스크탑은 가로. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="channelName"
          name="name"
          type="text"
          required
          autoComplete="off"
          maxLength={50}
          placeholder="예: 5월 회의실"
          className={cn(
            'h-11 flex-1 rounded-md bg-brand-surface px-4 text-base text-fg outline-none',
            'border border-divider transition-colors',
            'focus:border-live focus:ring-2 focus:ring-live/30',
            'placeholder:text-fg-muted/60',
          )}
        />
        <SubmitButton />
      </div>
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
        'h-11 shrink-0 whitespace-nowrap rounded-md bg-rec px-5 font-semibold text-fg',
        'transition-all duration-200 ease-onuri',
        'hover:brightness-110 active:scale-[0.98]',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      {pending ? '만드는 중…' : '만들기'}
    </button>
  );
}
