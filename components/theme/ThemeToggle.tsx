'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Theme = 'dark' | 'light';

// 헤더의 작은 sun/moon 토글. 첫 mount 까지는 hydration mismatch 방지를 위해
// 아이콘 빈 자리만 점유 (suppressHydrationWarning 으로 빈 상태 noise 차단).
//
// 영속화: localStorage('theme') + cookie('theme', 365일).
// cookie 까지 저장하는 이유: SSR 시 미리 알 수 있게 (theme-script.ts 와 호응).

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  // mount 후 현재 theme 읽어옴 (theme-script.ts 가 이미 적용해 둠)
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      // private mode 등 — 무시
    }
    // 365일 cookie. SameSite=Lax (대부분 동작), production 에서는 Secure
    const oneYear = 60 * 60 * 24 * 365;
    document.cookie = `theme=${next}; path=/; max-age=${oneYear}; SameSite=Lax`;
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
      title={theme === 'light' ? '다크 모드' : '라이트 모드'}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-sm',
        'border border-divider bg-brand-surface text-fg-muted',
        'transition-colors hover:text-fg',
      )}
      suppressHydrationWarning
    >
      {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  );
}
