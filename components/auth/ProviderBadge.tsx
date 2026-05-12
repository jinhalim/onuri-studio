import { User as UserIcon } from 'lucide-react';
import type { AuthProvider } from '@/lib/domain/user';
import { cn } from '@/lib/utils';

// 인증 제공자 표시용 작은 칩. 마이페이지 "인증 방식" / "연결된 제공자" 옆에 사용.
// 각 provider 마다 자체 로고 (Google 은 multicolor SVG) + 한글 라벨.

interface ProviderBadgeProps {
  provider: AuthProvider;
  className?: string;
}

const LABELS: Record<AuthProvider, string> = {
  anonymous: '익명',
  email: '이메일',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
  apple: 'Apple',
};

export function ProviderBadge({ provider, className }: ProviderBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-divider bg-brand-surface px-2 py-0.5 text-xs text-fg',
        className,
      )}
    >
      <ProviderIcon provider={provider} />
      <span>{LABELS[provider]}</span>
    </span>
  );
}

function ProviderIcon({ provider }: { provider: AuthProvider }) {
  if (provider === 'google') return <GoogleLogo />;
  // 다른 provider 는 후속 작업에서 자체 아이콘 추가. 지금은 generic.
  return <UserIcon size={12} className="text-fg-muted" />;
}

// Google 공식 G 로고 (multicolor) — GoogleSignInButton 과 동일 SVG.
function GoogleLogo() {
  return (
    <svg width="12" height="12" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.08-1.8 2.72v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.63z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.27c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A8.998 8.998 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71c-.18-.54-.28-1.12-.28-1.71s.1-1.17.28-1.71V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.34z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 8.998 8.998 0 0 0 .96 4.95l3.01 2.34C4.68 5.17 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
