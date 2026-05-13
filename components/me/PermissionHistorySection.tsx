'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, ExternalLink, Check, X } from 'lucide-react';
import type {
  MyStoryPermissions,
  ReceivedPermission,
  GrantedPermission,
} from '@/lib/usecases/get-my-story-permissions';
import { revokeStoryPermissionAction } from '@/app/actions/revoke-story-permission';
import { RelativeTime } from '@/components/shared/RelativeTime';
import { urls } from '@/lib/config/urls';
import { cn } from '@/lib/utils';

// D-015 권한 이력 — 마이페이지 섹션.
// 두 카드: "내가 받은 권한" + "내가 부여한 권한 (해제 가능)".
// 둘 다 비어있으면 섹션 자체를 안 그림 (마이페이지 공간 절약).

interface PermissionHistorySectionProps {
  permissions: MyStoryPermissions;
}

export function PermissionHistorySection({
  permissions,
}: PermissionHistorySectionProps) {
  const hasReceived = permissions.received.length > 0;
  const hasGranted = permissions.granted.length > 0;

  if (!hasReceived && !hasGranted) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-fg-muted">권한 이력</h2>

      {hasReceived && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs text-fg-muted">
            내가 받은 권한 ({permissions.received.length})
          </h3>
          <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-md border border-divider bg-brand-surface/50">
            {permissions.received.map((p) => (
              <ReceivedRow key={p.id} item={p} />
            ))}
          </ul>
        </div>
      )}

      {hasGranted && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs text-fg-muted">
            내가 부여한 권한 ({permissions.granted.length})
          </h3>
          <ul className="flex flex-col divide-y divide-divider overflow-hidden rounded-md border border-divider bg-brand-surface/50">
            {permissions.granted.map((p) => (
              <GrantedRow key={p.id} item={p} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ReceivedRow({ item }: { item: ReceivedPermission }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      <span
        className="inline-flex items-center gap-1 rounded-sm bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500"
        aria-hidden
      >
        <Check size={10} />
        편집 가능
      </span>
      <Link
        href={urls.story(item.channelId, item.storyId)}
        className="flex-1 truncate font-medium text-fg hover:underline"
      >
        {item.storyTitle}
      </Link>
      <span className="text-xs text-fg-muted">
        {item.channelName} · by {item.ownerNickname}
      </span>
      <span className="text-[11px] text-fg-muted/80">
        <RelativeTime date={item.grantedAt} />
      </span>
      <Link
        href={urls.story(item.channelId, item.storyId)}
        className="inline-flex items-center gap-1 text-xs text-live hover:underline"
        title="스토리로 이동"
      >
        <ExternalLink size={11} />
      </Link>
    </li>
  );
}

function GrantedRow({ item }: { item: GrantedPermission }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRevoke = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await revokeStoryPermissionAction(item.id);
      if (!res.ok) {
        setErrorMsg(res.error ?? '해제 실패');
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
      <span
        aria-hidden
        className="h-3 w-3 flex-shrink-0 rounded-full ring-1 ring-divider"
        style={{ backgroundColor: item.granteeColor }}
      />
      <span className="font-medium text-fg">{item.granteeNickname}</span>
      <span className="text-xs text-fg-muted">→</span>
      <Link
        href={urls.story(item.channelId, item.storyId)}
        className="flex-1 truncate text-fg hover:underline"
      >
        {item.storyTitle}
      </Link>
      <span className="text-[11px] text-fg-muted/80">
        <RelativeTime date={item.grantedAt} />
      </span>

      {confirming ? (
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRevoke}
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-1 rounded-sm bg-rec px-2 py-0.5 text-[11px] font-semibold text-white',
              'hover:brightness-110 disabled:opacity-50',
            )}
          >
            {pending ? '해제 중…' : '해제 확정'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-sm px-2 py-0.5 text-[11px] text-fg-muted hover:bg-brand-bezel"
          >
            취소
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          title="이 사용자의 편집 권한 해제"
          className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] text-rec hover:bg-rec/10"
        >
          <Trash2 size={11} />
          해제
        </button>
      )}

      {errorMsg && (
        <span className="basis-full text-[11px] text-rec">
          <X size={10} className="inline" /> {errorMsg}
        </span>
      )}
    </li>
  );
}
