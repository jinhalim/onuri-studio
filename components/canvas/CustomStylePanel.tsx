'use client';

import { memo, useCallback, useMemo } from 'react';
import {
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
  useEditor,
  useValue,
  type TLShape,
  type TLUiStylePanelProps,
} from 'tldraw';

// 기본 tldraw StylePanel 을 유지하면서, "사용자 지정 색상" 버튼을 색상 swatch 와
// opacity slider 사이에 끼워 넣는다. DefaultStylePanelContent 를 직접 호출하지 않고
// 각 picker 를 개별 import 해서 동일 layout 을 재구성 → 중간 삽입 가능.
//
// 선택된 도형들의 shape.meta.customColor 에 hex 를 저장하면 customShapeUtils 의
// getCustomDisplayValues override 가 그 색으로 렌더링한다.

const FALLBACK_COLOR = '#FF3D5A';

export const CustomStylePanel = memo(function CustomStylePanel(props: TLUiStylePanelProps) {
  return (
    <DefaultStylePanel {...props}>
      <CustomStylePanelContent />
    </DefaultStylePanel>
  );
});

// tldraw 의 DefaultStylePanelContent 와 거의 동일한 layout. 첫 section 에 우리 picker 끼워넣음.
function CustomStylePanelContent() {
  return (
    <>
      <StylePanelSection>
        <StylePanelColorPicker />
        <CustomColorPickerInline />
        <StylePanelOpacityPicker />
      </StylePanelSection>
      <StylePanelSection>
        <StylePanelFillPicker />
        <StylePanelDashPicker />
        <StylePanelSizePicker />
      </StylePanelSection>
      <StylePanelSection>
        <StylePanelFontPicker />
        <StylePanelTextAlignPicker />
        <StylePanelLabelAlignPicker />
      </StylePanelSection>
      <StylePanelSection>
        <StylePanelGeoShapePicker />
        <StylePanelArrowKindPicker />
        <StylePanelArrowheadPicker />
        <StylePanelSplinePicker />
      </StylePanelSection>
    </>
  );
}

// 컴팩트 인라인 버전: 작은 색 swatch + × 만. 색상 grid 와 opacity slider 사이에 끼움.
function CustomColorPickerInline() {
  const editor = useEditor();

  const selectedShapes = useValue<TLShape[]>(
    'custom-color-selected-shapes',
    () => editor.getSelectedShapes(),
    [editor],
  );

  const currentColor = useMemo(() => {
    if (selectedShapes.length === 0) return null;
    const colors = new Set<string | undefined>();
    for (const s of selectedShapes) {
      colors.add((s.meta as Record<string, unknown> | undefined)?.customColor as string | undefined);
    }
    if (colors.size > 1) return 'mixed' as const;
    const only = [...colors][0];
    return only ?? null;
  }, [selectedShapes]);

  const applyColor = useCallback(
    (hex: string) => {
      const shapes = editor.getSelectedShapes();
      if (shapes.length === 0) return;
      editor.markHistoryStoppingPoint('custom-color');
      editor.updateShapes(
        shapes.map((s) => ({
          id: s.id,
          type: s.type,
          meta: { ...s.meta, customColor: hex },
        })) as Parameters<typeof editor.updateShapes>[0],
      );
    },
    [editor],
  );

  const clearColor = useCallback(() => {
    const shapes = editor.getSelectedShapes();
    if (shapes.length === 0) return;
    editor.markHistoryStoppingPoint('custom-color-clear');
    // ⚠ tldraw 의 updateShapes 는 meta 를 머지하므로 key 를 'delete' 해도
    // 기존 값이 남는다. 명시적으로 null 을 설정 → getCustomColor 가 string 검사로
    // 자연스럽게 "비활성"으로 처리.
    editor.updateShapes(
      shapes.map((s) => ({
        id: s.id,
        type: s.type,
        meta: { ...s.meta, customColor: null },
      })) as Parameters<typeof editor.updateShapes>[0],
    );
  }, [editor]);

  // 선택된 도형이 없으면 픽커 자체를 안 그림 (헷갈리지 않게)
  if (selectedShapes.length === 0) return null;

  const inputValue =
    currentColor === 'mixed' || currentColor === null ? FALLBACK_COLOR : currentColor;
  const hasCustom = currentColor !== null && currentColor !== 'mixed';

  const swatchColor =
    currentColor === 'mixed' || currentColor === null
      ? null
      : (currentColor as string);
  const resetEnabled = hasCustom || currentColor === 'mixed';

  // 색이 적용 안 된 상태(또는 mixed)는 무지개 색상환으로 표시 → "여기 눌러서 색 고르세요" 시각 큐.
  const RAINBOW_BG =
    'conic-gradient(from 0deg, #ff3d5a, #ffb84d, #ffe04d, #4fd17f, #4fcfd1, #4f7fd1, #9a4fd1, #d14f9a, #ff3d5a)';

  return (
    <div
      data-testid="onuri.custom-color-inline"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '8px 0',
        boxSizing: 'border-box',
      }}
    >
      {/* 사용자 지정 색상 swatch.
          - 미지정/mixed: 무지개 색상환 (HTML color picker 가 있음을 시각적으로 암시)
          - 지정됨: 그 hex 색으로 단색 채움 + 흰색 ring
          label 트릭으로 클릭 시 native color picker open. */}
      <label
        title={hasCustom ? `현재 색: ${swatchColor}` : '사용자 지정 색상 선택'}
        aria-label="사용자 지정 색상 선택"
        style={{
          position: 'relative',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: hasCustom ? swatchColor! : RAINBOW_BG,
          // 무지개 상태에는 테두리 없음 (사용자 요청). 색이 적용된 상태에만 ring 으로 강조.
          border: hasCustom ? `2px solid ${swatchColor!}` : 'none',
          cursor: 'pointer',
          flexShrink: 0,
          boxShadow: hasCustom ? '0 0 0 2px rgba(255,255,255,0.7)' : 'none',
        }}
      >
        <input
          id="onuri-custom-color"
          type="color"
          value={inputValue}
          onChange={(e) => applyColor(e.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
            border: 'none',
            padding: 0,
            background: 'transparent',
          }}
        />
      </label>

      {/* 해제(reset) 버튼 — 텍스트 × 유지 (가독성). disabled 시 흐림. */}
      <button
        type="button"
        onClick={clearColor}
        disabled={!resetEnabled}
        aria-label="사용자 지정 색상 해제 (기본 팔레트로 되돌리기)"
        title="기본 팔레트 색상으로 되돌리기"
        style={{
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          background: 'transparent',
          color: 'var(--tl-color-text-1)',
          cursor: resetEnabled ? 'pointer' : 'not-allowed',
          opacity: resetEnabled ? 1 : 0.35,
          borderRadius: 4,
          fontSize: 16,
          fontWeight: 500,
          lineHeight: 1,
          flexShrink: 0,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
