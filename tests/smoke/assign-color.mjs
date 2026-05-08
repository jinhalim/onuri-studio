// 색상 충돌 회피 알고리즘 스모크 테스트.
// node 로 직접 실행: node tests/smoke/assign-color.mjs
// .ts 파일에서 알고리즘만 복제해서 실행 (단순 검증 목적, 형식 테스트는 Phase 6 Vitest로 이동).

const PALETTE = [
  '#FF3D5A', '#4FD1C5', '#F6AD55', '#9F7AEA',
  '#48BB78', '#ED64A6', '#4299E1', '#ECC94B',
  '#38B2AC', '#FC8181', '#A0AEC0', '#D69E2E',
  '#667EEA', '#F687B3', '#68D391', '#B794F4',
  '#F56565', '#81E6D9', '#FBD38D', '#7F9CF5',
];

function assignAnonymousColor(takenColors = []) {
  const taken = new Set(takenColors.map((c) => c.toUpperCase()));
  const available = PALETTE.filter((c) => !taken.has(c.toUpperCase()));
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  return generateMaxDistanceHsl(takenColors);
}

function generateMaxDistanceHsl(takenColors) {
  const hues = takenColors.map(hexToHue).filter((h) => h !== null);
  if (hues.length === 0) return '#FFFFFF';
  const avgHue = hues.reduce((s, h) => s + h, 0) / hues.length;
  const newHue = (avgHue + 180) % 360;
  return hslToHex(newHue, 65, 60);
}

function hexToHue(hex) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
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

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ===== TESTS =====
let pass = 0, fail = 0;
const expect = (name, ok, info = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}${info ? ' ' + info : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${info ? ' ' + info : ''}`); }
};

console.log('\n[D-007] assignAnonymousColor 스모크 테스트\n');

// 1. 빈 takenColors → PALETTE 멤버 반환
{
  const c = assignAnonymousColor([]);
  expect('빈 입력 → PALETTE 색 반환', PALETTE.includes(c), `(got ${c})`);
}

// 2. 일부 사용 중 → 사용 중 아닌 색만 반환
{
  const taken = PALETTE.slice(0, 19);
  const c = assignAnonymousColor(taken);
  expect('19개 사용 중 → 마지막 1개 반환', c === PALETTE[19], `(got ${c}, expected ${PALETTE[19]})`);
}

// 3. 대소문자 구분 없이 충돌 감지
{
  const taken = PALETTE.slice(0, 19).map(c => c.toLowerCase());
  const c = assignAnonymousColor(taken);
  expect('소문자 입력도 동일하게 인식', c === PALETTE[19], `(got ${c})`);
}

// 4. 모두 사용 중 → HSL fallback
{
  const c = assignAnonymousColor(PALETTE);
  const isHex = /^#[0-9A-F]{6}$/i.test(c);
  const notInPalette = !PALETTE.map(p => p.toUpperCase()).includes(c.toUpperCase());
  expect('20개 모두 사용 중 → HSL fallback (hex 형식)', isHex, `(got ${c})`);
  expect('  └ fallback 결과는 PALETTE 외부', notInPalette, `(got ${c})`);
}

// 5. 분포: 1000번 호출 시 PALETTE 모든 색 1번 이상 등장
{
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(assignAnonymousColor([]));
  expect('1000회 분산 → 20색 모두 한 번 이상 등장', seen.size === 20, `(got ${seen.size}/20)`);
}

// 6. 결정성: 같은 takenColors[19] 입력 → 항상 PALETTE[19] 반환
{
  const taken = PALETTE.slice(0, 19);
  let allSame = true;
  for (let i = 0; i < 50; i++) {
    if (assignAnonymousColor(taken) !== PALETTE[19]) { allSame = false; break; }
  }
  expect('가용 색이 1개일 때 항상 그 색 선택', allSame);
}

console.log(`\n결과: ${pass} pass, ${fail} fail\n`);
process.exit(fail > 0 ? 1 : 0);
