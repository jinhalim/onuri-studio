import type { Metadata } from 'next';
import './globals.css';
import { env } from '@/lib/config/env';

export const metadata: Metadata = {
  title: {
    default: env.NEXT_PUBLIC_APP_NAME,
    template: `%s · ${env.NEXT_PUBLIC_APP_NAME}`,
  },
  description: '모두의 방송, 우리의 스튜디오. URL 한 줄로 입장하는 실시간 협업 화이트보드.',
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  openGraph: {
    title: env.NEXT_PUBLIC_APP_NAME,
    description: 'The studio where everyone tunes in.',
    url: env.NEXT_PUBLIC_APP_URL,
    siteName: env.NEXT_PUBLIC_APP_NAME,
    locale: 'ko_KR',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
