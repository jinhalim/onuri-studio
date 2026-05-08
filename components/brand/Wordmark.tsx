import { cn } from '@/lib/utils';

// Onuri Studio 워드마크.
// "Onuri" 의 'i' 점을 --accent-rec 빨간 점으로 강조.
// 점은 dotless 'ı' (U+0131) 위에 절대 배치된 span.

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
  className?: string;
}

const sizeStyles = {
  sm: { wordmark: 'text-2xl', dot: 'h-1.5 w-1.5 -top-0.5', tagline: 'text-xs mt-1' },
  md: { wordmark: 'text-4xl', dot: 'h-2 w-2 -top-1', tagline: 'text-sm mt-2' },
  lg: { wordmark: 'text-6xl', dot: 'h-3 w-3 -top-1.5', tagline: 'text-base mt-3' },
} as const;

export function Wordmark({ size = 'md', withTagline = false, className }: WordmarkProps) {
  const s = sizeStyles[size];
  return (
    <div className={cn('inline-flex flex-col items-start', className)}>
      <span
        aria-label="Onuri Studio"
        className={cn('font-bold tracking-tight text-fg select-none', s.wordmark)}
      >
        <span aria-hidden>Onur</span>
        <span aria-hidden className="relative inline-block">
          <span>ı</span>
          <span
            className={cn(
              'absolute left-1/2 -translate-x-1/2 rounded-full bg-rec',
              s.dot,
            )}
          />
        </span>
        <span aria-hidden> Studio</span>
      </span>
      {withTagline && (
        <span className={cn('text-fg-muted', s.tagline)}>모두의 방송, 우리의 스튜디오.</span>
      )}
    </div>
  );
}
