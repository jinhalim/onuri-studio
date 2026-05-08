import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Wordmark } from '@/components/brand/Wordmark';
import { SignedInBanner } from '@/components/auth/SignedInBanner';
import { ChannelList } from '@/components/channel/ChannelList';
import { getCurrentUser } from '@/lib/usecases/get-current-user';
import { listMyChannels } from '@/lib/usecases/list-my-channels';

// 마이페이지.
// MVP 정책: 익명도 자기 채널 목록 확인 가능 (D-007 색이 정체성 역할).
// Phase 9에서 회원 전환 영역 (이메일로 저장 / 계정 연결 등) 추가.

export default async function MyPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/');

  const myChannels = await listMyChannels(user.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <Link href="/" className="hover:opacity-80">
          <Wordmark size="sm" />
        </Link>
        <SignedInBanner user={user} compact />
      </header>

      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-fg">마이페이지</h1>
        <p className="text-sm text-fg-muted">
          {user.isAnonymous
            ? '익명 트랙입니다. 활동 이력은 브라우저 쿠키에 묶여 있어 다른 기기에서는 보이지 않아요.'
            : '회원 트랙입니다. 활동 이력이 계정에 영구 저장됩니다.'}
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">계정 정보</h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 rounded-md border border-divider bg-brand-surface/50 px-4 py-3 text-sm">
          <dt className="text-fg-muted">닉네임</dt>
          <dd className="text-fg">{user.nickname}</dd>
          <dt className="text-fg-muted">색상</dt>
          <dd className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 rounded-full ring-1 ring-divider"
              style={{ backgroundColor: user.color }}
            />
            <code className="text-fg">{user.color}</code>
          </dd>
          <dt className="text-fg-muted">인증 방식</dt>
          <dd className="text-fg">{user.primaryAuthProvider}</dd>
          <dt className="text-fg-muted">연결된 제공자</dt>
          <dd className="text-fg">
            {user.linkedProviders.length === 0 ? '없음' : user.linkedProviders.join(', ')}
          </dd>
        </dl>
        {/* TODO[Phase9-Email]: 익명일 때 "이메일로 저장" 버튼 노출 */}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">내가 만든 채널</h2>
        <ChannelList channels={myChannels} />
      </section>

      {/* TODO[Phase5]: 최근 방문 채널 + 즐겨찾기 (participations 기반) */}

      <footer className="mt-auto pt-12 text-xs text-fg-muted/70">
        Phase 2 — 마이페이지 골격 / 즐겨찾기·최근 방문은 Phase 5부터
      </footer>
    </main>
  );
}
