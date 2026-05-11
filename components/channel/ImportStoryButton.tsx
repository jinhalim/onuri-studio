'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { importStoryAction } from '@/app/actions/import-story';
import { cn } from '@/lib/utils';

interface ImportStoryButtonProps {
  channelId: string;
}

type Status = 'idle' | 'reading' | 'importing' | 'error';

// .onuri.json 파일을 새 스토리로 가져오기.
// 클릭 시 파일 선택 + 카드 영역에 drag-and-drop. CreateStoryButton 과 같은 카드 패턴.

export function ImportStoryButton({ channelId }: ImportStoryButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.onuri.json') && file.type !== 'application/json') {
      setStatus('error');
      setErrorMsg('.onuri.json 파일만 지원해요');
      return;
    }
    setStatus('reading');
    setErrorMsg(null);
    try {
      const text = await file.text();
      setStatus('importing');
      const result = await importStoryAction(channelId, text);
      if (!result.ok) {
        setStatus('error');
        setErrorMsg(result.error ?? '가져오기 실패');
        return;
      }
      setStatus('idle');
      // 가져온 스토리로 즉시 이동
      if (result.storyId) {
        router.push(`/ch/${channelId}/story/${result.storyId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error('[ImportStoryButton] 파일 읽기 실패:', err);
      setStatus('error');
      setErrorMsg('파일 읽기 실패');
    }
  };

  const onDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const pending = status === 'reading' || status === 'importing';
  const label =
    status === 'reading' ? '파일 읽는 중…'
    : status === 'importing' ? '가져오는 중…'
    : status === 'error' ? '실패 — 다시 시도'
    : '.onuri.json 가져오기';

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          // 같은 파일 다시 선택할 수 있게 reset
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        disabled={pending}
        className={cn(
          'flex aspect-video flex-col items-center justify-center gap-2 rounded-md',
          'border-2 border-dashed text-fg-muted',
          'transition-colors',
          isDragging
            ? 'border-live bg-live/10 text-live'
            : 'border-divider bg-brand-surface/50 hover:border-live hover:text-live',
          status === 'error' && 'border-rec/60 text-rec',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <Upload size={28} />
        <span className="text-sm font-medium">{label}</span>
        {!pending && status !== 'error' && (
          <span className="text-[11px] text-fg-muted/70">파일을 끌어다 놓거나 클릭</span>
        )}
      </button>
      {errorMsg && (
        <span role="alert" className="text-xs text-rec">
          {errorMsg}
        </span>
      )}
    </div>
  );
}
