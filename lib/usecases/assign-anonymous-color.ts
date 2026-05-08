import { ANONYMOUS_COLOR_PALETTE } from '@/lib/design-tokens/tokens';

// D-007 익명 닉네임 색상 충돌 회피 알고리즘.
//
// 1. takenColors에 없는 PALETTE 색을 무작위로 1개 선택.
// 2. PALETTE이 모두 사용 중이면 HSL 색상환에서 takenColors와 가장 멀리 떨어진 색 fallback.
//
// 입력:
//   takenColors: 같은 채널/스토리 내 활성 사용자가 이미 사용 중인 색상 hex 배열.
//                Phase 1에선 빈 배열을 받아 PALETTE 무작위 배정만 수행.
//                Phase 4에서 Yjs awareness state로부터 채워서 호출.
//
// 출력: hex 문자열 (#RRGGBB)

export function assignAnonymousColor(takenColors: readonly string[] = []): string {
  const taken = new Set(takenColors.map((c) => c.toUpperCase()));
  const available = ANONYMOUS_COLOR_PALETTE.filter((c) => !taken.has(c.toUpperCase()));

  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]!;
  }

  // 정원 초과 fallback: HSL 색상환에서 takenColors와 거리 최대인 색 생성
  return generateMaxDistanceHsl(takenColors);
}

// HSL fallback: takenColors의 평균 hue에서 180° 떨어진 색 생성.
// 채도/명도는 PALETTE와 유사한 톤으로 고정.
function generateMaxDistanceHsl(takenColors: readonly string[]): string {
  const hues = takenColors.map(hexToHue).filter((h): h is number => h !== null);
  if (hues.length === 0) return '#FFFFFF';

  const avgHue = hues.reduce((s, h) => s + h, 0) / hues.length;
  const newHue = (avgHue + 180) % 360;
  return hslToHex(newHue, 65, 60);
}

function hexToHue(hex: string): number | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
