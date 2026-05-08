'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { deleteStoryAction, type DeleteStoryState } from '@/app/actions/delete-story';
import { cn } from '@/lib/utils';

const initialState: DeleteStoryState = { ok: false };

interface DeleteStoryButtonProps {
  storyId: string;
  channelId: string;
}

export function DeleteStoryButton({ storyId, channelId }: DeleteStoryButtonProps) {
  const [state, formAction] = useFormState(deleteStoryAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm('이 스토리를 삭제할까요? 되돌릴 수 없어요.')) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="storyId" value={storyId} />
      <input type="hidden" name="channelId" value={channelId} />
      <SubmitButton />
      {state.error && (
        <span className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs text-rec">
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
      aria-label="스토리 삭제"
      disabled={pending}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-sm',
        'bg-brand-bezel/80 text-fg-muted backdrop-blur-sm',
        'transition-colors hover:bg-rec hover:text-fg',
        'disabled:opacity-60',
      )}
    >
      <Trash2 size={14} />
    </button>
  );
}
