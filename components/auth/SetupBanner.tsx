// Supabase 미설정 시 랜딩에 노출되는 배너.
// 실수로 익명 입장 시도 → 알 수 없는 에러 메시지 보는 사고 방지.

import { cn } from '@/lib/utils';

export function SetupBanner() {
  return (
    <div
      className={cn(
        'w-full max-w-2xl rounded-md p-5 text-sm',
        'border border-rec/30 bg-rec/10 text-fg',
      )}
    >
      <h2 className="mb-2 font-semibold text-rec">⚠ Supabase 설정이 필요해요</h2>
      <ol className="list-inside list-decimal space-y-1 text-fg-muted">
        <li>
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-fg"
          >
            supabase.com
          </a>
          에서 무료 프로젝트를 생성하세요.
        </li>
        <li>Settings → API 에서 URL / anon key / service_role key 복사.</li>
        <li>
          <code className="rounded bg-brand-screen px-1.5 py-0.5">.env.local</code> 파일에
          붙여넣고 dev 서버를 재시작.
        </li>
        <li>
          SQL Editor 에서{' '}
          <code className="rounded bg-brand-screen px-1.5 py-0.5">supabase/migrations/</code>{' '}
          의 4개 파일을 차례로 실행.
        </li>
      </ol>
    </div>
  );
}
