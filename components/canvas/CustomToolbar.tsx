'use client';

import { useRef, useState } from 'react';
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
// D-019 + D-020: 표 도구 — Excel 스타일 grid picker. 버튼 hover 시 popover 열림,
// 셀 hover 로 행/열 미리보기, 셀 클릭 시 그 크기의 표 생성.

// 표 아이콘 — tldraw built-in icon 에 grid/table 없어서 custom SVG.
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

// Grid picker 의 차원 (사용자가 한 번에 선택 가능한 최대 표).
const PICKER_MAX_COLS = 10;
const PICKER_MAX_ROWS = 8;
const CELL_SIZE = 20; // px
const CELL_GAP = 2;

function TableToolbarButton() {
  const editor = useEditor();
  const [isOpen, setIsOpen] = useState(false);
  const [hover, setHover] = useState<{ rows: number; cols: number } | null>(null);
  // hover 가 button → picker 사이 이동 시 깜빡임 방지 (close 약간 지연).
  const closeTimerRef = useRef<number | null>(null);

  const openPicker = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
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
    // 외곽 div — TldrawUiMenuItem 이 안에 들어있고, hover 로 picker 띄움.
    // OverflowingToolbar 는 이 div 를 1개 item 으로 인식.
    <div
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
      {isOpen && (
        <TableGridPicker
          hover={hover}
          onHoverCell={(r, c) => setHover({ rows: r, cols: c })}
          onClearHover={() => setHover(null)}
          onPick={(r, c) => createTable(r, c)}
        />
      )}
    </div>
  );
}

interface TableGridPickerProps {
  hover: { rows: number; cols: number } | null;
  onHoverCell: (rows: number, cols: number) => void;
  onClearHover: () => void;
  onPick: (rows: number, cols: number) => void;
}

function TableGridPicker({
  hover,
  onHoverCell,
  onClearHover,
  onPick,
}: TableGridPickerProps) {
  const label = hover
    ? `${hover.rows} × ${hover.cols} 표`
    : '크기 선택 (행 × 열)';

  // popover 너비/높이 — 셀 + gap + padding.
  const gridW = PICKER_MAX_COLS * CELL_SIZE + (PICKER_MAX_COLS - 1) * CELL_GAP;
  const gridH = PICKER_MAX_ROWS * CELL_SIZE + (PICKER_MAX_ROWS - 1) * CELL_GAP;

  return (
    <div
      role="dialog"
      aria-label="표 크기 선택"
      style={{
        position: 'absolute',
        // 메인 toolbar 가 화면 하단에 있다고 가정 → 버튼 위쪽으로 popover.
        bottom: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--color-panel, #fff)',
        color: 'var(--color-text-1, #1f1f2a)',
        border: '1px solid var(--color-divider, #DCDCE0)',
        borderRadius: 8,
        padding: 10,
        boxShadow: '0 6px 18px rgba(0,0,0,0.18)',
        zIndex: 100,
        userSelect: 'none',
      }}
      onMouseLeave={onClearHover}
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
