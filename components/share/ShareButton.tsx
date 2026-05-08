'use client';

import { useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  url: string;
  label?: string;
}

export function ShareButton({ url, label = 'URL 공유' }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('[ShareButton] clipboard 쓰기 실패:', err);
      alert('클립보드 복사에 실패했어요. 주소창의 URL을 직접 복사해주세요.');
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex items-center gap-2 rounded-sm border border-divider px-3 py-1.5 text-sm',
        'text-fg-muted transition-colors',
        'hover:bg-brand-surface hover:text-fg',
      )}
    >
      {copied ? (
        <>
          <Check size={14} className="text-live" />
          <span className="text-live">복사됨</span>
        </>
      ) : (
        <>
          <Link2 size={14} />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
