'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from '@/lib/editor';

// 기본 tldraw StylePanel 을 유지하면서, "사용자 지정 색상" 버튼을 색상 swatch 와
// opacity slider 사이에 끼워 넣는다. DefaultStylePanelContent 를 직접 호출하지 않고
// 각 picker 를 개별 import 해서 동일 layout 을 재구성 → 중간 삽입 가능.
//
// 동작 모드:
//   1) 선택된 도형 있음 → 그 도형들의 shape.meta.customColor 를 직접 갱신/해제.
//   2) 선택 없음 (도구 모드) → 모듈 signal `pendingCustomColor` 만 갱신.
//      StudioCanvas 의 registerBeforeCreateHandler 가 새로 만들어지는 도형에
//      이 값을 meta.customColor 로 stamp → 도구마다 동일 UX 제공.

const FALLBACK_COLOR = '#FF3D5A';

// ──────────────────────────────────────────────────────────────────────────────
// Pending custom color signal (도구 모드 — 다음에 만들 도형에 적용될 hex)
// 모듈 레벨 mutable state + 간단 subscription. tldraw atom 도 가능하지만 의존성
// 최소화를 위해 직접 구현. StudioCanvas 에서 getPendingCustomColor() 로 읽고
// registerBeforeCreateHandler 에서 stamp.

let pendingCustomColorValue: string | null = null;
const pendingCustomColorSubs = new Set<() => void>();

export function getPendingCustomColor(): string | null {
  return pendingCustomColorValue;
}

function setPendingCustomColor(value: string | null) {
  if (pendingCustomColorValue === value) return;
  pendingCustomColorValue = value;
  for (const cb of pendingCustomColorSubs) cb();
}

function usePendingCustomColor(): string | null {
  const [v, setV] = useState<string | null>(pendingCustomColorValue);
  useEffect(() => {
    const cb = () => setV(pendingCustomColorValue);
    pendingCustomColorSubs.add(cb);
    // mount 시점에 module value 가 바뀌어있을 수 있으니 한 번 sync.
    cb();
    return () => {
      pendingCustomColorSubs.delete(cb);
    };
  }, []);
  return v;
}

export const CustomStylePanel = memo(function CustomStylePanel(props: TLUiStylePanelProps) {
  const editor = useEditor();
  // 선택이 전부 gdrive-file 이면 StylePanel 자체를 숨김. 색상/크기/투명도 모두 의미 없음.
  // (rotate handle 도 hideRotateHandle()=true 라 안 보이고, resize 도 canResize()=false.)
  const onlyGDriveSelected = useValue<boolean>(
    'only-gdrive-selected',
    () => {
      const shapes = editor.getSelectedShapes();
      if (shapes.length === 0) return false;
      return shapes.every((s) => (s.type as string) === 'gdrive-file');
    },
    [editor],
  );

  // 위치 오프셋 (px). tldraw 기본 위치(top-right) 를 0,0 origin 으로 삼고 translate.
  // 사용자 요청: 세션마다 기본 위치로 리셋 → useState 만 사용, persist 없음.
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [collapsed, setCollapsed] = useState(false);
  const [dragging, setDragging] = useState(false);

  // 드래그 시작 시점의 pointer/offset snapshot. 리렌더로 인한 closure stale 방지 위해 ref.
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  // offset 의 최신값을 onPointerDown 이 deps 없이 읽을 수 있게 ref 미러.
  const offsetRef = useRef(offset);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // 접기 버튼 같은 [data-no-drag] 요소 클릭은 드래그로 인식하지 않음.
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: offsetRef.current.x,
      offsetY: offsetRef.current.y,
    };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    if (!s) return;
    e.preventDefault();
    setOffset({
      x: s.offsetX + (e.clientX - s.pointerX),
      y: s.offsetY + (e.clientY - s.pointerY),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragStartRef.current = null;
    setDragging(false);
  }, []);

  // gdrive-file 만 선택된 상태면 panel 통째로 숨김.
  if (onlyGDriveSelected) return null;

  return (
    <div
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        // 드래그 중엔 transition 없이 즉시 반응
      }}
    >
      <DefaultStylePanel {...props}>
        {/* 드래그 + 접기/펴기 헤더 바. DefaultStylePanel 안쪽에 두어 panel chrome
            (배경/테두리/그림자) 안에 통합돼 보이게 함. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 4px 4px 8px',
            cursor: dragging ? 'grabbing' : 'grab',
            touchAction: 'none', // 모바일 드래그 활성
            userSelect: 'none',
            fontSize: 11,
            color: 'var(--color-text-2)',
            borderBottom: collapsed ? 'none' : '1px solid var(--color-divider)',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              opacity: 0.7,
              letterSpacing: 0,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>⠿</span>
            <span>스타일</span>
          </span>
          <button
            data-no-drag
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? '스타일 패널 펼치기' : '스타일 패널 접기'}
            title={collapsed ? '펼치기' : '접기'}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--color-text-2)',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            {collapsed ? '▾' : '▴'}
          </button>
        </div>
        {!collapsed && <CustomStylePanelContent />}
      </DefaultStylePanel>
    </div>
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
// 선택 도형이 있으면 그 도형들의 meta.customColor 를, 없으면 pendingCustomColor 를 다룸.
function CustomColorPickerInline() {
  const editor = useEditor();

  const selectedShapes = useValue<TLShape[]>(
    'custom-color-selected-shapes',
    () => editor.getSelectedShapes(),
    [editor],
  );
  const pendingColor = usePendingCustomColor();
  const hasSelection = selectedShapes.length > 0;

  const currentColor = useMemo(() => {
    if (!hasSelection) {
      // 도구 모드: 다음 도형용 pending color.
      return pendingColor;
    }
    const colors = new Set<string | undefined>();
    for (const s of selectedShapes) {
      colors.add((s.meta as Record<string, unknown> | undefined)?.customColor as string | undefined);
    }
    if (colors.size > 1) return 'mixed' as const;
    const only = [...colors][0];
    return only ?? null;
  }, [selectedShapes, hasSelection, pendingColor]);

  const applyColor = useCallback(
    (hex: string) => {
      if (!hasSelection) {
        // 도구 모드: 다음에 만들어질 도형이 stamp 받도록 signal 만 갱신.
        setPendingCustomColor(hex);
        return;
      }
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
    [editor, hasSelection],
  );

  const clearColor = useCallback(() => {
    if (!hasSelection) {
      setPendingCustomColor(null);
      return;
    }
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
  }, [editor, hasSelection]);

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
