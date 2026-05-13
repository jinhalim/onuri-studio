'use client';

import Link from 'next/link';
import { Users, RotateCw, ArrowLeft } from 'lucide-react';
import { MAX_STORY_PRESENCES } from '@/lib/hooks/useStoryRealtime';

// D-017: 스토리 화이트보드의 동시 접속 정원 초과 시 표시되는 안내.
// 캔버스 대신 본 컴포넌트가 fullscreen 으로 렌더되어 입장 차단.
// "다시 시도" 클릭 시 페이지 전체 리로드 → useStoryRealtime 새 인스턴스 → 다시 정원 검사.
// 다른 사용자가 떠난 후 시도하면 정상 입장 가능.

interface OverflowNoticeProps {
  channelId: string;
  channelName: string;
  storyTitle: string;
}

export function OverflowNotice({
  channelId,
  channelName,
  storyTitle,
}: OverflowNoticeProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-brand-screen p-6">
      <div className="w-full max-w-md rounded-lg border border-divider bg-brand-bezel p-8 shadow-2xl">
        <div className="mb-5 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rec/15 text-rec">
            <Users size={24} aria-hidden />
          </div>
        </div>
        <h1 className="mb-2 text-center text-lg font-bold text-fg">
          이 화이트보드는 정원이 가득 찼어요
        </h1>
        <p className="mb-1 text-center text-sm text-fg-muted">
          스토리 &ldquo;<strong className="text-fg">{storyTitle}</strong>&rdquo; 의 동시 접속자가
          최대치 ({MAX_STORY_PRESENCES} 명) 에 도달했습니다.
        </p>
        <p className="mb-6 text-center text-xs text-fg-muted">
          다른 사용자가 나간 후 다시 시도해주세요.
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-live px-4 py-2.5 text-sm font-semibold text-brand-bezel hover:brightness-110"
          >
            <RotateCw size={14} />
            다시 시도
          </button>
          <Link
            href={`/ch/${channelId}`}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-divider px-4 py-2 text-sm text-fg-muted hover:bg-brand-surface hover:text-fg"
          >
            <ArrowLeft size={14} />
            채널 메뉴로 돌아가기 ({channelName})
          </Link>
        </div>
      </div>
    </div>
  );
}
