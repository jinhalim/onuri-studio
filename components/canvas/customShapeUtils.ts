// 기본 tldraw shape util 들을 .configure({ getCustomDisplayValues }) 로 확장해서
// shape.meta.customColor (hex 문자열) 가 설정되어 있으면 표준 팔레트 색 대신 그 hex 로 렌더링.
//
// 원리: tldraw v5 의 getDisplayValues 는 default + custom 을 spread 로 머지하므로
// custom 에서 반환하는 키만 부분 override 가능 (shared/getDisplayValues.js 참조).
// 이렇게 하면 ShapeUtil 을 subclass 하지 않고도 기본 도형 모두에 임의 색을 적용할 수 있다.
//
// shape.meta 에 저장하는 이유: tldraw 의 color style 은 'black' | 'grey' | ... enum 이라
// schema 를 건드리지 않으면 임의 hex 를 props.color 에 직접 넣을 수 없음. meta 는 자유로운 JSON.

import {
  ArrowShapeUtil,
  DrawShapeUtil,
  FrameShapeUtil,
  GeoShapeUtil,
  HighlightShapeUtil,
  LineShapeUtil,
  NoteShapeUtil,
  TextShapeUtil,
  type TLShape,
} from '@/lib/editor';
import { GDriveFileShapeUtil } from './gdriveShapeUtil';
import { TableShapeUtil } from './tableShapeUtil';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** shape.meta.customColor 가 유효한 hex 문자열이면 반환, 아니면 null. */
export function getCustomColor(shape: TLShape): string | null {
  const v = (shape.meta as Record<string, unknown> | undefined)?.customColor;
  return typeof v === 'string' && HEX_RE.test(v) ? v : null;
}

// 노트 셀상관(WCAG) 단순화: 휘도 기준 검정/흰색 라벨.
function labelOnHex(hex: string): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.length === 3 ? m[0]! + m[0]! : m.slice(0, 2), 16);
  const g = parseInt(m.length === 3 ? m[1]! + m[1]! : m.slice(2, 4), 16);
  const b = parseInt(m.length === 3 ? m[2]! + m[2]! : m.slice(4, 6), 16);
  // sRGB 휘도 근사
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1F1F2A' : '#F5F5F7';
}

// fill='solid' 등에서 쓰는 반투명 fill 변형 (hex + 알파).
function hexWithAlpha(hex: string, alpha01: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.length === 3 ? m[0]! + m[0]! : m.slice(0, 2), 16);
  const g = parseInt(m.length === 3 ? m[1]! + m[1]! : m.slice(2, 4), 16);
  const b = parseInt(m.length === 3 ? m[2]! + m[2]! : m.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha01));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// 색을 흰색과 mix 해서 연하게. amount=0 → 원본, 1 → 흰색.
// Frame 안쪽 fill 처럼 "은은한 tint" 효과 낼 때 사용.
function lightenHex(hex: string, amount01: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.length === 3 ? m[0]! + m[0]! : m.slice(0, 2), 16);
  const g = parseInt(m.length === 3 ? m[1]! + m[1]! : m.slice(2, 4), 16);
  const b = parseInt(m.length === 3 ? m[2]! + m[2]! : m.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, amount01));
  const lr = Math.round(r + (255 - r) * a);
  const lg = Math.round(g + (255 - g) * a);
  const lb = Math.round(b + (255 - b) * a);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

// 각 shape util 별 override.
// 키 이름은 해당 shape 의 *DisplayValues 인터페이스에 정의된 것 사용 (예: GeoShape → strokeColor/fillColor).
//
// 주의: returning {} = 기본 동작 유지. 그래서 customColor 없으면 빈 객체.

const CustomDrawShapeUtil = DrawShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    const fillProp = (shape.props as { fill?: string }).fill;
    return {
      strokeColor: hex,
      fillColor:
        fillProp === 'none'
          ? 'transparent'
          : fillProp === 'semi'
            ? hexWithAlpha(hex, 0.15)
            : fillProp === 'pattern'
              ? hex
              : hex,
      patternFillFallbackColor: hexWithAlpha(hex, 0.35),
    };
  },
});

const CustomGeoShapeUtil = GeoShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    const fillProp = (shape.props as { fill?: string }).fill;
    return {
      strokeColor: hex,
      fillColor:
        fillProp === 'none'
          ? 'transparent'
          : fillProp === 'semi'
            ? hexWithAlpha(hex, 0.15)
            : hex,
      patternFillFallbackColor: hexWithAlpha(hex, 0.35),
      labelColor: hex,
    };
  },
});

const CustomNoteShapeUtil = NoteShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    return {
      noteBackgroundColor: hex,
      // border 는 약간 어둡게/투명하게
      borderColor: hexWithAlpha(hex, 0.6),
      // 라벨 색은 배경 휘도에 따라 자동 결정 (가독성)
      labelColor: labelOnHex(hex),
    };
  },
});

const CustomArrowShapeUtil = ArrowShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    const fillProp = (shape.props as { fill?: string }).fill;
    return {
      strokeColor: hex,
      fillColor: fillProp === 'none' ? 'transparent' : hex,
      patternFillFallbackColor: hexWithAlpha(hex, 0.35),
      labelColor: hex,
    };
  },
});

const CustomLineShapeUtil = LineShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    return { strokeColor: hex };
  },
});

const CustomTextShapeUtil = TextShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    return { color: hex };
  },
});

const CustomHighlightShapeUtil = HighlightShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    return { strokeColor: hex };
  },
});

// Frame: tldraw v5 기본은 색상 prop 없음 → 표준 팔레트 안 보임.
// customColor 만 적용 가능. 색은 frame 의 외곽선 + 안쪽 fill (50% 연하게) + 헤딩 글자에 반영.
// FrameShapeUtilDisplayValues key (tldraw 5.0.0 소스 기준):
//   - fillColor: 안쪽 배경
//   - strokeColor: 테두리
//   - headingTextColor: 상단 라벨 텍스트
//   - headingFillColor / headingStrokeColor: 헤딩 바 배경/테두리 (negativeSpace default 유지)
const CustomFrameShapeUtil = FrameShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    return {
      strokeColor: hex,
      // 안쪽 fill 은 50% 연한 tint — 사용자가 명시적으로 picker 로 정한 색의 약한 채움.
      fillColor: lightenHex(hex, 0.5),
      headingTextColor: hex,
    };
  },
});

// <Tldraw shapeUtils={...} /> 에 그대로 넘긴다.
// mergeArraysAndReplaceDefaults('type', ...) 가 type 기준으로 기본 util 을 덮어쓴다.
export const customShapeUtils = [
  CustomDrawShapeUtil,
  CustomGeoShapeUtil,
  CustomNoteShapeUtil,
  CustomArrowShapeUtil,
  CustomLineShapeUtil,
  CustomTextShapeUtil,
  CustomHighlightShapeUtil,
  CustomFrameShapeUtil,
  // D-018: 새 shape 타입 — Drive 파일 카드.
  GDriveFileShapeUtil,
  // D-019: 새 shape 타입 — 표 (편집 가능한 grid).
  TableShapeUtil,
];
