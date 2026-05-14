'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DefaultToolbar,
  DefaultToolbarContent,
  TldrawUiMenuItem,
  createShapeId,
  useEditor,
} from '@/lib/editor';
import { propsForGrid } from './tableShapeUtil';

// tldraw 의 DefaultToolbar 는 OverflowingToolbar 가 maxItems=8 / maxSizePx=470 으로 제한해서
// 화면이 넓어도 8개만 inline 표시 + 나머지는 "자세히" overflow. 본 wrapper 는 그 임계점을
// 늘려서 ~70vw 의 가로 공간을 채울 때까지 inline 노출.
//
// D-019: 표 도구 — Excel 스타일 grid picker.
//   ⚠ tldraw 의 OverflowingToolbar 가 boundary 도구를 main + overflow 양쪽에 렌더 (quirk).
//   그래서 picker 도 부모 영역에 종속되면 좁은 overflow popover 안에서 잘림. 이를 피하려고
//   createPortal 로 document.body 직속 렌더 + 버튼 좌표 기반 position: fixed.
//   양쪽 버튼이 hover 돼도 결과 위치/내용 동일 → 사용자가 어디서 hover 하든 같은 UX.

const TableIconJsx = (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
    }}
  >
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="14" height="12" rx="1.5" />
      <line x1="3" y1="9" x2="17" y2="9" />
      <line x1="3" y1="13" x2="17" y2="13" />
      <line x1="9.5" y1="4" x2="9.5" y2="16" />
    </svg>
  </div>
);

const PICKER_MAX_COLS = 10;
const PICKER_MAX_ROWS = 8;
const CELL_SIZE = 20;
const CELL_GAP = 2;
const PICKER_PADDING = 10;

function TableToolbarButton() {
  const editor = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const [hover, setHover] = useState<{ rows: number; cols: number } | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);

  // createPortal 는 SSR 안 됨 → client mount 이후에만 활성화.
  useEffect(() => {
    setMounted(true);
  }, []);

  const openPicker = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (buttonRef.current) {
      setAnchorRect(buttonRef.current.getBoundingClientRect());
    }
    setIsOpen(true);
  };

  const scheduleClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setHover(null);
      closeTimerRef.current = null;
    }, 180);
  };

  const createTable = (rows: number, cols: number) => {
    const id = createShapeId();
    const vb = editor.getViewportPageBounds();
    const props = propsForGrid(rows, cols);
    const x = vb.x + vb.w / 2 - props.w / 2;
    const y = vb.y + vb.h / 2 - props.h / 2;
    editor.createShapes([
      {
        id,
        type: 'table',
        x,
        y,
        props,
      },
    ] as unknown as Parameters<typeof editor.createShapes>[0]);
    editor.setSelectedShapes([id]);
    setIsOpen(false);
    setHover(null);
  };

  return (
    <div
      ref={buttonRef}
      onMouseEnter={openPicker}
      onMouseLeave={scheduleClose}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      <TldrawUiMenuItem
        id="table"
        icon={TableIconJsx}
        label="표"
        onSelect={() => {
          // 클릭 시 default 3×3 표 생성 (hover 가 불가능한 환경 대비 — 터치 등).
          createTable(3, 3);
        }}
      />
      {isOpen &&
        mounted &&
        anchorRect &&
        createPortal(
          <TableGridPicker
            anchor={anchorRect}
            hover={hover}
            onHoverCell={(r, c) => setHover({ rows: r, cols: c })}
            onClearHover={() => setHover(null)}
            onPick={(r, c) => createTable(r, c)}
            onMouseEnter={openPicker}
            onMouseLeave={scheduleClose}
          />,
          document.body,
        )}
    </div>
  );
}

interface TableGridPickerProps {
  anchor: DOMRect;
  hover: { rows: number; cols: number } | null;
  onHoverCell: (rows: number, cols: number) => void;
  onClearHover: () => void;
  onPick: (rows: number, cols: number) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function TableGridPicker({
  anchor,
  hover,
  onHoverCell,
  onClearHover,
  onPick,
  onMouseEnter,
  onMouseLeave,
}: TableGridPickerProps) {
  const label = hover
    ? `${hover.rows} × ${hover.cols} 표`
    : '크기 선택 (행 × 열)';
  const gridW = PICKER_MAX_COLS * CELL_SIZE + (PICKER_MAX_COLS - 1) * CELL_GAP;
  const gridH = PICKER_MAX_ROWS * CELL_SIZE + (PICKER_MAX_ROWS - 1) * CELL_GAP;
  // popover 자체 너비 (padding + grid).
  const popW = gridW + PICKER_PADDING * 2;

  // 버튼 위쪽으로 popover 띄움 (toolbar 가 화면 하단 기준). 6px 갭.
  // viewport 좌우 경계 안 넘게 clamp.
  const bottom = window.innerHeight - anchor.top + 6;
  let left = anchor.left + anchor.width / 2 - popW / 2;
  left = Math.max(8, Math.min(window.innerWidth - popW - 8, left));

  return (
    <div
      role="dialog"
      aria-label="표 크기 선택"
      onMouseEnter={onMouseEnter}
      onMouseLeave={() => {
        onClearHover();
        onMouseLeave();
      }}
      style={{
        position: 'fixed',
        bottom,
        left,
        width: popW,
        background: 'var(--color-panel, #fff)',
        color: 'var(--color-text-1, #1f1f2a)',
        border: '1px solid var(--color-divider, #DCDCE0)',
        borderRadius: 8,
        padding: PICKER_PADDING,
        boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        zIndex: 10_000,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${PICKER_MAX_COLS}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${PICKER_MAX_ROWS}, ${CELL_SIZE}px)`,
          gap: CELL_GAP,
          width: gridW,
          height: gridH,
        }}
      >
        {Array.from({ length: PICKER_MAX_ROWS }).map((_, r) =>
          Array.from({ length: PICKER_MAX_COLS }).map((_, c) => {
            const isHighlighted =
              hover !== null && r < hover.rows && c < hover.cols;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                onMouseEnter={() => onHoverCell(r + 1, c + 1)}
                onClick={() => onPick(r + 1, c + 1)}
                aria-label={`${r + 1} × ${c + 1}`}
                style={{
                  width: CELL_SIZE,
                  height: CELL_SIZE,
                  border: `1px solid ${isHighlighted ? '#FF3D5A' : '#DCDCE0'}`,
                  background: isHighlighted ? '#FFEEF2' : 'transparent',
                  borderRadius: 2,
                  padding: 0,
                  cursor: 'pointer',
                  transition: 'background 80ms ease, border-color 80ms ease',
                }}
              />
            );
          }),
        )}
      </div>
      <div
        style={{
          marginTop: 8,
          textAlign: 'center',
          fontSize: 11,
          color: 'var(--color-text-2, #4D4D5A)',
          fontFamily: 'inherit',
          letterSpacing: '-0.01em',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function CustomToolbar() {
  return (
    <DefaultToolbar
      minItems={4}
      minSizePx={310}
      maxItems={20}
      maxSizePx={1200}
    >
      <DefaultToolbarContent />
      <TableToolbarButton />
    </DefaultToolbar>
  );
}
