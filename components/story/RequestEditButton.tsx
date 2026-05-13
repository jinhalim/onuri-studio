'use client';

import { useState, useTransition } from 'react';
import { Eye, Send, Check, Clock } from 'lucide-react';
import { requestEditPermissionAction } from '@/app/actions/request-edit-permission';
import { cn } from '@/lib/utils';

// D-015: 비-owner 사용자가 보는 "읽기 전용 (방문자 모드)" 배지를 클릭하면
// owner 에게 수정 권한 요청을 전송. owner 가 허용하면 새 알림이 도착 → 사용자가
// 클릭하면 페이지 리프레쉬되며 편집 모드 진입.
//
// 4가지 시각 상태:
//   idle:      기본 — "읽기 전용 (방문자 모드) · 수정 요청 ↗"
//   pending:   서버 액션 진행 중
//   requested: 이미 요청 보냄 (이번 세션) — "수정 권한 요청됨"
//   granted:   already_granted 응답 — 새로고침 하면 편집 가능 안내

interface RequestEditButtonProps {
  storyId: string;
  /** 현재 사용자 ID. null 이면 (드물게) 버튼 자체를 숨김 — 익명 닉네임 입력 전. */
  userId: string | null;
}

type State = 'idle' | 'pending' | 'requested' | 'granted' | 'error';

export function RequestEditButton({ storyId, userId }: RequestEditButtonProps) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onClick = () => {
    if (state === 'pending') return;
    if (!userId) return;
    setErrorMsg(null);
    startTransition(async () => {
      setState('pending');
      const res = await requestEditPermissionAction(storyId);
      if (!res.ok) {
        setState('error');
        setErrorMsg(res.error ?? '요청 실패');
        return;
      }
      if (res.status === 'already_granted') setState('granted');
      else setState('requested');
    });
  };

  // 상태별 라벨/아이콘/툴팁
  const renderInner = () => {
    if (state === 'granted') {
      return (
        <>
          <Check size={12} />
          <span>이미 편집 가능 — 새로고침</span>
        </>
      );
    }
    if (state === 'requested') {
      return (
        <>
          <Clock size={12} />
          <span>수정 권한 요청됨 — owner 응답 대기 중</span>
        </>
      );
    }
    if (state === 'pending') {
      return (
        <>
          <Send size={12} />
          <span>요청 보내는 중…</span>
        </>
      );
    }
    if (state === 'error') {
      return (
        <>
          <Eye size={12} />
          <span>요청 실패 — 다시 클릭</span>
        </>
      );
    }
    return (
      <>
        <Eye size={12} />
        <span>읽기 전용 (방문자 모드) · 수정 권한 요청</span>
      </>
    );
  };

  if (!userId) {
    // userId 없으면 그냥 기존 배지처럼만 표시 (클릭 안 됨)
    return (
      <div className="rounded-sm border border-divider bg-brand-bezel/80 px-3 py-1 text-xs text-fg-muted backdrop-blur-sm">
        읽기 전용 (방문자 모드)
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={state === 'pending'}
        title={
          state === 'requested'
            ? 'owner 가 허용하면 알림이 도착합니다'
            : state === 'granted'
              ? '편집 권한이 이미 부여되어 있어요'
              : '클릭해서 owner 에게 수정 권한 요청'
        }
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm border px-3 py-1 text-xs',
          'transition-colors backdrop-blur-sm',
          'pointer-events-auto',
          (state === 'idle' || state === 'error') &&
            'border-divider bg-brand-bezel/80 text-fg-muted hover:border-live/60 hover:text-fg',
          state === 'pending' && 'border-divider bg-brand-bezel/80 text-fg-muted opacity-70',
          state === 'requested' &&
            'border-live/40 bg-live/10 text-live cursor-default',
          state === 'granted' &&
            'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
        )}
      >
        {renderInner()}
      </button>
      {errorMsg && state === 'error' && (
        <span className="rounded-sm bg-rec/20 px-2 py-0.5 text-[10px] text-rec">
          {errorMsg}
        </span>
      )}
    </div>
  );
}
