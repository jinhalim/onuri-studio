import { Wordmark } from '@/components/brand/Wordmark';

// 스토리 페이지 진입 시 로딩 인디케이터.
// dev 모드 첫 컴파일(약 10초) 동안에도 사용자가 진행 상황을 알 수 있게.

export default function StoryLoading() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-6 bg-brand-bezel">
      <Wordmark size="sm" />
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse-rec rounded-full bg-rec" />
        <span className="text-sm text-fg-muted">화이트보드 불러오는 중…</span>
      </div>
      <p className="text-xs text-fg-muted/60">
        첫 진입 시 화이트보드 엔진을 초기화합니다 (약 5~10초)
      </p>
    </main>
  );
}
