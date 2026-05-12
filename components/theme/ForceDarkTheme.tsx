'use client';

import { useEffect } from 'react';

// 화이트보드 페이지(스토리)는 다크 고정 (사용자 명시 요청).
// mount 시 html[data-theme] 을 'dark' 로 잠금, unmount 시 복원.
// localStorage/cookie 값은 건들지 않음 — 사용자의 선택은 유지.

export function ForceDarkTheme() {
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) html.setAttribute('data-theme', prev);
    };
  }, []);
  return null;
}
