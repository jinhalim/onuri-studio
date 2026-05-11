'use client';

import { useEffect, useRef, useState } from 'react';
import { Zap, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LaserShareMode = 'private' | 'public';

interface LaserShareToggleProps {
  mode: LaserShareMode;
  onChange: (mode: LaserShareMode) => void;
}

// 헤더의 작은 버튼. 클릭 또는 우클릭 시 드롭다운 노출.
// 본인만 보기 (default) / 전체 공유 모드 선택.

export function LaserShareToggle({ mode, onChange }: LaserShareToggleProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onContextMenu={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        title="레이저 포인터 공유 모드"
        className={cn(
          'flex items-center gap-1.5 rounded-sm border px-2.5 py-1',
          mode === 'public'
            ? 'border-rec/40 bg-rec/10 text-rec'
            : 'border-divider bg-brand-surface text-fg-muted hover:text-fg',
        )}
      >
        <Zap size={12} />
        <span className="text-[10px] font-medium">
          레이저: {mode === 'public' ? '공유' : '본인만'}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-md',
            'border border-divider bg-brand-bezel shadow-lg',
            'animate-fade-in',
          )}
        >
          <MenuItem
            label="본인만 보기"
            description="기본값. 다른 사용자에게 안 보임"
            selected={mode === 'private'}
            onClick={() => {
              onChange('private');
              setOpen(false);
            }}
          />
          <MenuItem
            label="전체 공유 모드"
            description="다른 사용자에게 내 색상으로 표시"
            selected={mode === 'public'}
            onClick={() => {
              onChange('public');
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors',
        'hover:bg-brand-surface',
      )}
    >
      <div className="mt-0.5 w-3 shrink-0">
        {selected && <Check size={12} className="text-live" />}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-fg">{label}</span>
        <span className="text-[10px] text-fg-muted">{description}</span>
      </div>
    </button>
  );
}
