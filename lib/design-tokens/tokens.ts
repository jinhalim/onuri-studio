// Onuri Studio 디자인 토큰 (단일 진실 공급원)
// CSS 변수 / Tailwind preset / Storybook이 모두 본 객체를 참조한다.

export const tokens = {
  color: {
    bgBezel: '#0B0B0F',
    bgScreen: '#16161D',
    bgSurface: '#1F1F2A',
    textPrimary: '#F5F5F7',
    textMuted: '#9A9AA8',
    accentRec: '#FF3D5A',  // On Air, 라이브
    accentLive: '#4FD1C5', // 다른 사용자 커서
    divider: '#2A2A38',
  },
  radius: {
    sm: '8px',
    md: '14px',
    lg: '20px',
  },
  transition: {
    default: '200ms cubic-bezier(0.16, 1, 0.3, 1)',
  },
} as const;

// D-007 익명 닉네임 색상 팔레트 (20색 = 동시 접속 정원과 동일)
// 정원 초과 시 HSL fallback 활성 (lib/usecases/assign-anonymous-color.ts 참조)
export const ANONYMOUS_COLOR_PALETTE: readonly string[] = [
  '#FF3D5A', '#4FD1C5', '#F6AD55', '#9F7AEA',
  '#48BB78', '#ED64A6', '#4299E1', '#ECC94B',
  '#38B2AC', '#FC8181', '#A0AEC0', '#D69E2E',
  '#667EEA', '#F687B3', '#68D391', '#B794F4',
  '#F56565', '#81E6D9', '#FBD38D', '#7F9CF5',
] as const;
