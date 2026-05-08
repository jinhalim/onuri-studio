import { cn } from '@/lib/utils';

interface OnAirIndicatorProps {
  /** true 일 때만 펄스 표시. false 면 회색 도트 또는 숨김 (옵션). */
  active: boolean;
  /** 활성화 안 됐을 때도 자리 표시할지. */
  showWhenInactive?: boolean;
  className?: string;
}

// 빨간 펄스 (--accent-rec). Tailwind animate-pulse-rec (tailwind.config 정의)
// + ON AIR 라벨. 누군가 그리는 중일 때 노출.

export function OnAirIndicator({
  active,
  showWhenInactive = false,
  className,
}: OnAirIndicatorProps) {
  if (!active && !showWhenInactive) return null;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 rounded-full',
          active ? 'bg-rec animate-pulse-rec' : 'bg-fg-muted/40',
        )}
      />
      <span
        className={cn(
          'text-xs font-semibold tracking-wider',
          active ? 'text-rec' : 'text-fg-muted/60',
        )}
      >
        ON AIR
      </span>
    </div>
  );
}
