'use client';

import { useEffect, useState } from 'react';
import { X, Pencil, Square, StickyNote, Zap, Palette, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingOverlayProps {
  /** 빈 스토리에서만 표시. 도형이 1개라도 있으면 false. */
  isEmpty: boolean;
  /** 같은 storyId 에 대한 닫음 상태 localStorage 키. */
  storyId: string;
}

const STORAGE_KEY_PREFIX = 'onuri:onboarding-dismissed:';

// 화이트보드 사용법 안내 카드.
// 표시 조건:
// - 보드가 비어 있음 (도형 0개)
// - 사용자가 아직 이 스토리에서 안내를 닫지 않음 (localStorage)
//
// 닫기 트리거:
// - 우상단 × 클릭
// - 또는 사용자가 도형을 하나 그리면 자연 사라짐 (isEmpty=false)
//
// 영구 닫음은 storyId 별로 분리해서 — 다른 스토리에선 다시 보일 수 있음.

export function OnboardingOverlay({ isEmpty, storyId }: OnboardingOverlayProps) {
  const [dismissed, setDismissed] = useState(true); // 초기 SSR 은 숨김 (hydration 안전)

  useEffect(() => {
    try {
      const flag = localStorage.getItem(STORAGE_KEY_PREFIX + storyId);
      setDismissed(flag === '1');
    } catch {
      setDismissed(false);
    }
  }, [storyId]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + storyId, '1');
    } catch {
      // private mode 등 — 무시
    }
  };

  if (!isEmpty || dismissed) return null;

  return (
    <div
      role="dialog"
      aria-label="화이트보드 사용법 안내"
      className={cn(
        'pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4',
      )}
    >
      {/* 가독성 강화: 본문은 text-sm + text-fg (라이트/다크 둘 다 강한 대비).
          배경/텍스트는 디자인 토큰 사용 → 라이트 모드도 자연스럽게 검정 텍스트 표시. */}
      <div
        className={cn(
          'pointer-events-auto relative w-full max-w-md rounded-lg border border-divider',
          'bg-brand-bezel p-7 shadow-2xl',
        )}
      >
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="안내 닫기"
          className="absolute right-3 top-3 rounded-sm p-1.5 text-fg-muted hover:bg-brand-surface hover:text-fg"
        >
          <X size={18} />
        </button>

        <div className="mb-5 flex items-baseline gap-2">
          <h2 className="text-xl font-bold text-fg">👋 환영합니다!</h2>
          <span className="text-sm text-fg-muted">사용법</span>
        </div>

        <ul className="flex flex-col gap-4">
          <Tip icon={<Pencil size={16} />} label="펜">
            자유 곡선. 길게 그리면 자동으로 보정돼요.
          </Tip>
          <Tip icon={<Square size={16} />} label="도형">
            사각형 · 원 · 화살표 · 텍스트.
          </Tip>
          <Tip icon={<StickyNote size={16} />} label="메모지">
            클릭 후 글자를 입력하세요. 우하단에 작성자 닉네임이 표시돼요.
          </Tip>
          <Tip icon={<Palette size={16} />} label="색상">
            기본 12색 팔레트 + 무지개 ● 클릭으로 임의 색 선택.
          </Tip>
          <Tip icon={<Zap size={16} />} label="레이저">
            헤더의 ⚡ 토글로 전체 공유 모드 — 함께 가리킬 수 있어요.
          </Tip>
          <Tip icon={<Share2 size={16} />} label="공유">
            &ldquo;스토리 URL 공유&rdquo; 버튼으로 URL 복사 → 친구에게 보내면 실시간 협업.
          </Tip>
        </ul>

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="text-xs text-fg-muted">
            도형 하나 그리면 자동으로 사라져요.
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            className={cn(
              'rounded-md bg-rec px-4 py-2 text-sm font-semibold text-white',
              'hover:brightness-110 active:scale-[0.98]',
            )}
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}

function Tip({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-surface text-fg">
        {icon}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-semibold text-fg">{label}</span>
        <span className="text-sm text-fg">{children}</span>
      </div>
    </li>
  );
}
