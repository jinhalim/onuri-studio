// Editor 백엔드 통합 진입점.
//
// 본 모듈은 tldraw 의 사용 표면 (types / components / shape utils / hooks) 를
// 한곳에 모아 re-export 한다. 모든 캔버스 관련 코드는 `tldraw` 가 아닌
// `@/lib/editor` 에서 import 한다. 이렇게 하면:
//
//   1) tldraw 의존성 표면이 본 파일 하나에 모인다 → 어떤 API 를 쓰는지 한눈에 파악.
//   2) 다른 editor (Excalidraw 등) 로 교체 검토 시 본 파일에 같은 시그니처의
//      adapter 만 만들면 소비처 코드 변경 없이 swap 가능 (L1 abstraction).
//   3) 라이선스 / 사용량 제한 검사도 본 파일에서 일괄 가능.
//
// 현재 백엔드: tldraw (Hobby License, 비상업적). 상업 전환 시 SDK License 또는
// 대안 editor 로 교체. [`DESIGN.md` § 17.7](../../DESIGN.md) / § 17.8 참조.
//
// 주의: 새 tldraw API 를 도입할 때는 반드시 본 파일에 export 추가 후 소비.
// 직접 `from 'tldraw'` import 는 새 코드에서 금지 — ESLint rule 으로 막을 수 있음.

// ──────────────────────────────────────────────────────────────────────────────
// Components
// ──────────────────────────────────────────────────────────────────────────────
export {
  Tldraw,
  DefaultStylePanel,
  StylePanelArrowKindPicker,
  StylePanelArrowheadPicker,
  StylePanelColorPicker,
  StylePanelDashPicker,
  StylePanelFillPicker,
  StylePanelFontPicker,
  StylePanelGeoShapePicker,
  StylePanelLabelAlignPicker,
  StylePanelOpacityPicker,
  StylePanelSection,
  StylePanelSizePicker,
  StylePanelSplinePicker,
  StylePanelTextAlignPicker,
} from 'tldraw';

// ──────────────────────────────────────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────────────────────────────────────
export { useEditor, useValue } from 'tldraw';

// ──────────────────────────────────────────────────────────────────────────────
// Shape util classes — 커스텀 shape util 작성용 base class.
// (customShapeUtils.ts 에서 `.configure({...})` 패턴으로 확장)
// ──────────────────────────────────────────────────────────────────────────────
export {
  ArrowShapeUtil,
  DrawShapeUtil,
  GeoShapeUtil,
  HighlightShapeUtil,
  LineShapeUtil,
  NoteShapeUtil,
  TextShapeUtil,
  ScribbleOverlayUtil,
} from 'tldraw';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────
export type {
  Editor,
  TLRecord,
  TLShape,
  TLComponents,
  TLUiStylePanelProps,
} from 'tldraw';
