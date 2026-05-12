import type { Metadata, Viewport } from 'next';
import './globals.css';
import { env } from '@/lib/config/env';
import { themeBootstrapScript } from '@/components/theme/theme-script';

// 모바일/태블릿 (iPad 포함) 최적화 — Phase 6.
// - viewport-fit: cover → iPhone notch / iPad home indicator 안전영역 활용
// - initial-scale=1, maximum-scale=1 → input focus 시 iOS Safari 자동 zoom 방지
//   (대신 globals.css 의 font-size: 16px+ 로 가독성 보장)
// - user-scalable=no 는 접근성 가이드라인 위반이라 제외 (수동 핀치줌 허용)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#0B0B0F',
};

export const metadata: Metadata = {
  title: {
    default: env.NEXT_PUBLIC_APP_NAME,
    template: `%s · ${env.NEXT_PUBLIC_APP_NAME}`,
  },
  description: '모두의 스토리, 우리의 스튜디오. URL 한 줄로 입장하는 실시간 협업 화이트보드.',
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* 첫 paint 전 html[data-theme] 설정 → 다크/라이트 flash 방지.
            D-012: 라이트 모드 도입 (다크 default, system preference 자동 감지). */}
        <script
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
