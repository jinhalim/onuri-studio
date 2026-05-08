'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Plus } from 'lucide-react';
import {
  createStoryAction,
  type CreateStoryState,
} from '@/app/actions/create-story';
import { cn } from '@/lib/utils';

const initialState: CreateStoryState = { ok: false };

interface CreateStoryButtonProps {
  channelId: string;
}

// 제목 입력 없이 클릭 한 번으로 새 스토리 생성. 기본 제목은 서버가 "이름 N" 자동 부여.
export function CreateStoryButton({ channelId }: CreateStoryButtonProps) {
  const [state, formAction] = useFormState(createStoryAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="channelId" value={channelId} />
      <SubmitButton />
      {state.error && (
        <span role="alert" className="text-xs text-rec">
          {state.error}
        </span>
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
        'flex aspect-video flex-col items-center justify-center gap-2 rounded-md',
        'border-2 border-dashed border-divider bg-brand-surface/50 text-fg-muted',
        'transition-colors hover:border-live hover:text-live',
        'disabled:cursor-not-allowed disabled:opacity-60',
      )}
    >
      <Plus size={28} />
      <span className="text-sm font-medium">{pending ? '만드는 중…' : '새 스토리'}</span>
    </button>
  );
}
