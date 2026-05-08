'use client';

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { updateStoryTitleAction } from '@/app/actions/update-story-title';
import { storyTitleSchema } from '@/lib/security/validators';
import { cn } from '@/lib/utils';

// 상태 머신:
// idle ── click ──▶ editing
//                    │ Enter / blur(valid) → saving
//                    │ Esc                 → idle (rollback)
//                    │ blur(empty)         → idle (rollback)
// saving ── success ──▶ idle (broadcast)
//        ── error   ──▶ editing (rollback + toast)

type State = 'idle' | 'editing' | 'saving';

interface StoryTitleInlineProps {
  storyId: string;
  initialTitle: string;
  channelId: string;
  canEdit: boolean;
}

export function StoryTitleInline({
  storyId,
  initialTitle,
  channelId,
  canEdit,
}: StoryTitleInlineProps) {
  const [title, setTitle] = useState(initialTitle);
  const [draft, setDraft] = useState(initialTitle);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // initialTitle이 외부에서 바뀌면(다른 클라이언트의 동기화) 동기화
  useEffect(() => {
    if (state === 'idle') setTitle(initialTitle);
  }, [initialTitle, state]);

  // editing 진입 시 input focus + select
  useEffect(() => {
    if (state === 'editing') {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [state]);

  function enterEditing() {
    if (!canEdit || state !== 'idle') return;
    setDraft(title);
    setError(null);
    setState('editing');
  }

  function cancel() {
    setDraft(title);
    setError(null);
    setState('idle');
  }

  function commit() {
    const parsed = storyTitleSchema.safeParse(draft);
    if (!parsed.success) {
      // 빈 문자열/공백/위험문자 → 롤백
      setError(parsed.error.issues[0]?.message ?? '제목이 유효하지 않아요');
      cancel();
      return;
    }
    if (parsed.data === title) {
      setState('idle');
      return;
    }

    // 낙관적 업데이트
    const previous = title;
    setTitle(parsed.data);
    setState('saving');
    setError(null);

    startTransition(async () => {
      const result = await updateStoryTitleAction(storyId, parsed.data, channelId);
      if (!result.ok) {
        // 롤백 + editing 상태 복원해서 사용자가 다시 시도 가능하게
        setTitle(previous);
        setDraft(parsed.data);
        setError(result.error ?? '저장 실패');
        setState('editing');
        return;
      }
      setState('idle');
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  if (state === 'editing') {
    return (
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          maxLength={200}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-9 w-full max-w-md rounded-sm bg-brand-surface px-3 text-2xl font-bold text-fg outline-none',
            'border border-live ring-2 ring-live/30',
          )}
        />
        <span className="text-xs text-fg-muted">Enter 저장 · Esc 취소</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={enterEditing}
        disabled={!canEdit || state === 'saving'}
        className={cn(
          'inline-flex items-baseline gap-2 text-left text-2xl font-bold text-fg',
          canEdit && 'cursor-text rounded-sm px-1 -ml-1 hover:bg-brand-surface',
          state === 'saving' && 'opacity-60',
        )}
      >
        <span>{title}</span>
        {state === 'saving' && <span className="text-xs text-fg-muted">(저장 중…)</span>}
      </button>
      {error && (
        <span role="alert" className="text-xs text-rec">
          {error}
        </span>
      )}
    </div>
  );
}
