'use client';

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { updateNicknameAction } from '@/app/actions/update-nickname';
import { cn } from '@/lib/utils';

// 마이페이지의 닉네임 인라인 편집.
// 상태: idle ──click──▶ editing ──Enter/blur(valid)──▶ saving ──ok──▶ idle (router.refresh)
//                       └Esc/blur(empty)────────────▶ idle (rollback)
// 0009 unique index + updateNicknameAction 의 미리 체크로 중복 닉네임 차단.

interface NicknameEditInlineProps {
  initial: string;
}

type State = 'idle' | 'editing' | 'saving';

export function NicknameEditInline({ initial }: NicknameEditInlineProps) {
  const [value, setValue] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state === 'editing') {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [state]);

  const startEdit = () => {
    setDraft(value);
    setError(null);
    setState('editing');
  };

  const cancel = () => {
    setDraft(value);
    setError(null);
    setState('idle');
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      cancel();
      return;
    }
    if (trimmed === value) {
      setState('idle');
      return;
    }
    setState('saving');
    setError(null);
    startTransition(async () => {
      const result = await updateNicknameAction(trimmed);
      if (!result.ok) {
        setError(result.error ?? '닉네임 변경 실패');
        setState('editing');
        // input refocus
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      setValue(trimmed);
      setState('idle');
      // 다른 곳 (헤더 SignedInBanner 등) 도 갱신되도록
      router.refresh();
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  if (state === 'editing' || state === 'saving') {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            disabled={state === 'saving'}
            maxLength={24}
            className={cn(
              'h-8 w-40 rounded-sm border border-divider bg-brand-surface px-2 text-sm text-fg outline-none',
              'focus:border-live focus:ring-2 focus:ring-live/30',
              error && 'border-rec/60',
            )}
            aria-label="닉네임"
            aria-invalid={Boolean(error)}
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            disabled={state === 'saving'}
            className="rounded-sm p-1 text-fg-muted hover:bg-brand-surface hover:text-fg"
            aria-label="저장"
            title="저장"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancel}
            disabled={state === 'saving'}
            className="rounded-sm p-1 text-fg-muted hover:bg-brand-surface hover:text-fg"
            aria-label="취소"
            title="취소"
          >
            <X size={14} />
          </button>
        </div>
        {error && (
          <span role="alert" className="text-xs text-rec">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      className="group inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-fg hover:bg-brand-surface"
      title="닉네임 변경"
      aria-label="닉네임 변경"
    >
      <span>{value}</span>
      <Pencil
        size={12}
        className="text-fg-muted/60 opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
