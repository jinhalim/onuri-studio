import type { Config } from 'tailwindcss';

// 디자인 토큰을 직접 import 하는 대신 CSS 변수를 참조한다.
// 이유: Tailwind config은 빌드 타임 평가, CSS 변수는 런타임 변경 가능.
// 토큰 값 자체는 lib/design-tokens/tokens.ts와 app/globals.css :root가 동기화되어야 한다.

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bezel: 'var(--bg-bezel)',
          screen: 'var(--bg-screen)',
          surface: 'var(--bg-surface)',
        },
        fg: {
          DEFAULT: 'var(--text-primary)',
          muted: 'var(--text-muted)',
        },
        rec: 'var(--accent-rec)',
        live: 'var(--accent-live)',
        divider: 'var(--divider)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      fontFamily: {
        sans: ['var(--font-pretendard)', 'Pretendard', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      transitionTimingFunction: {
        onuri: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'pulse-rec': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.15)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'pulse-rec': 'pulse-rec 2s ease-in-out infinite',
        'fade-in': 'fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
