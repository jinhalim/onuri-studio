import { Wordmark } from '@/components/brand/Wordmark';

export default function ChannelLoading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center justify-center gap-6 px-6 py-12">
      <Wordmark size="sm" />
      <div className="flex items-center gap-3">
        <span className="h-2 w-2 animate-pulse-rec rounded-full bg-rec" />
        <span className="text-sm text-fg-muted">채널 불러오는 중…</span>
      </div>
    </main>
  );
}
