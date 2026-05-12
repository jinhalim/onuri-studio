'use client';

import { useEffect, useState } from 'react';

// Hydration-safe 상대시간 표시.
// 문제: server render 와 client render 시점이 다르면 Date.now() 결과 다름 →
// "방금 전" vs "1분 전" 같은 텍스트 mismatch → React error #425.
//
// 해결: 초기 SSR 결과를 suppressHydrationWarning 으로 mismatch 무시.
// client mount 직후 useEffect 로 정확한 값 재계산 + 60초마다 갱신.

interface RelativeTimeProps {
  /** ISO 8601 문자열 또는 ms 숫자. */
  date: string | number;
  /** 빈 값 fallback (e.g. "저장 없음"). */
  fallback?: string;
  className?: string;
}

export function RelativeTime({ date, fallback, className }: RelativeTimeProps) {
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = window.setInterval(() => tick((t) => t + 1), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  if (!date) {
    return fallback ? <span className={className}>{fallback}</span> : null;
  }
  return (
    <span className={className} suppressHydrationWarning>
      {formatRelative(typeof date === 'string' ? new Date(date).getTime() : date)}
    </span>
  );
}

export function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 10) return '방금 전';
  if (s < 60) return `${s}초 전`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}일 전`;
  return new Date(ms).toLocaleDateString('ko-KR');
}
