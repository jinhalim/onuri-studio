// D-019: tldraw 의 custom shape `table` — 캔버스 위에 편집 가능한 표.
//
// shape.props:
//   - w/h: 표 전체 크기 (콘너 핸들로 통째 리사이즈)
//   - rows / cols: 행/열 개수
//   - cells: rows*cols 길이의 평면 텍스트 배열. cellIndex(r, c) = r * cols + c
//   - colWidths: 각 열의 픽셀 너비 (합 ≈ w)
//   - rowHeights: 각 행의 픽셀 높이 (합 ≈ h)
//
// UX:
//   - 단일 클릭 = 표 선택 (다른 도형처럼 이동/리사이즈)
//   - 셀 더블클릭 = 인라인 텍스트 편집 (Enter 저장 / Esc 취소 / Tab 다음 셀)
//     ⚠ tldraw 의 pointer system 이 preventDefault 로 native dblclick 을 막아서
//     onPointerDown 으로 클릭 카운팅 직접 처리 (lastClickRef + 400ms 임계).
//   - 셀 우클릭 = 컨텍스트 메뉴 (행/열 추가·삭제) — D-020.
//   - 열/행 경계 호버 = ↔/↕ 커서 → 드래그로 너비/높이 조정
//   - customColor (StylePanel) = 외곽 + 셀 구분선 색 반영
//
// 동기화: cells / colWidths / rowHeights 는 평범한 직렬화 가능 데이터 → useStoryRealtime
// 의 broadcast sync 가 자동 처리 (다른 shape 과 동일).

import { useEffect, useRef, useState } from 'react';
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  resizeBox,
  useEditor,
  useValue,
  type RecordProps,
  type TLBaseShape,
  type TLShape,
} from '@/lib/editor';
import { getCustomColor } from './customShapeUtils-shared';

// ──────────────────────────────────────────────────────────────────────────────
// Shape definition
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 셀 병합 정의. (row, col) = 병합 영역의 좌상단 셀.
 * rowspan/colspan = 그 셀이 차지하는 행/열 개수 (둘 다 ≥ 1, 둘 다 1이면 사실상 미병합).
 * 병합 영역 안의 다른 셀 좌표 (row+1, col 등) 들은 render 에서 skip.
 */
export interface CellMerge {
  row: number;
  col: number;
  rowspan: number;
  colspan: number;
}

export type TableShape = TLBaseShape<
  'table',
  {
    w: number;
    h: number;
    rows: number;
    cols: number;
    cells: string[];
    colWidths: number[];
    rowHeights: number[];
    /** 셀 병합 목록. 빈 배열이면 모든 셀이 개별. */
    cellMerges: CellMerge[];
  }
>;

const DEFAULT_COLS = 3;
const DEFAULT_ROWS = 3;
const DEFAULT_COL_W = 120;
const DEFAULT_ROW_H = 40;
const MIN_COL_W = 40;
const MIN_ROW_H = 24;
const MAX_ROWS = 50;
const MAX_COLS = 20;

// 표 기본 테두리 색 (다크 모드 stroke). customColor 있으면 그 색으로 override.
const DEFAULT_BORDER_COLOR = '#2A2A38';
const DEFAULT_CELL_LINE_COLOR = '#DCDCE0';

function defaultProps(): TableShape['props'] {
  return propsForGrid(DEFAULT_ROWS, DEFAULT_COLS);
}

/** rows×cols 의 빈 표 props 만들기 — Toolbar 의 grid picker 도 호출. */
export function propsForGrid(rows: number, cols: number): TableShape['props'] {
  const r = Math.max(1, Math.min(MAX_ROWS, rows));
  const c = Math.max(1, Math.min(MAX_COLS, cols));
  const cells = Array.from({ length: r * c }, () => '');
  const colWidths = Array.from({ length: c }, () => DEFAULT_COL_W);
  const rowHeights = Array.from({ length: r }, () => DEFAULT_ROW_H);
  return {
    w: c * DEFAULT_COL_W,
    h: r * DEFAULT_ROW_H,
    rows: r,
    cols: c,
    cells,
    colWidths,
    rowHeights,
    cellMerges: [],
  };
}

// gdrive-file 과 동일 패턴: tldraw 의 closed TLShape union 에 'table' 없어서 @ts-expect-error.
// @ts-expect-error - custom type 'table' 은 TLBaseBoxShape closed union 에 없음
export class TableShapeUtil extends BaseBoxShapeUtil<TableShape> {
  static override type = 'table' as const;
  static override props: RecordProps<TableShape> = {
    w: T.number,
    h: T.number,
    rows: T.number,
    cols: T.number,
    cells: T.arrayOf(T.string),
    colWidths: T.arrayOf(T.number),
    rowHeights: T.arrayOf(T.number),
    cellMerges: T.arrayOf(
      T.object({
        row: T.number,
        col: T.number,
        rowspan: T.number,
        colspan: T.number,
      }),
    ),
  };

  override getDefaultProps(): TableShape['props'] {
    return defaultProps();
  }

  override getIndicatorPath() {
    return undefined;
  }

  override canEdit() {
    // true 여야 editor.setEditingShape(shape.id) 가 허용된다 — false 면 tldraw 가
    // canEditShape 체크에서 silent reject (Editor.mjs:1956). 셀 클릭 카운팅은 우리가
    // onPointerDown 으로 직접 처리해서 native dblclick 미발생 이슈와 무관.
    return true;
  }
  override canResize() {
    return true;
  }
  override hideRotateHandle() {
    return true;
  }

  // 코너 핸들로 표 통째 리사이즈 — colWidths / rowHeights 도 같이 scale.
  override onResize(shape: TableShape, info: unknown) {
    const resize = resizeBox as unknown as (s: TableShape, i: unknown) => TableShape;
    const base = resize(shape, info);
    const scaleX = base.props.w / shape.props.w;
    const scaleY = base.props.h / shape.props.h;
    const newColWidths = shape.props.colWidths.map((cw) =>
      Math.max(MIN_COL_W, cw * scaleX),
    );
    const newRowHeights = shape.props.rowHeights.map((rh) =>
      Math.max(MIN_ROW_H, rh * scaleY),
    );
    return {
      ...base,
      props: {
        ...base.props,
        w: newColWidths.reduce((a, b) => a + b, 0),
        h: newRowHeights.reduce((a, b) => a + b, 0),
        colWidths: newColWidths,
        rowHeights: newRowHeights,
      },
    };
  }

  override component(shape: TableShape) {
    return <TableShapeBody shape={shape} />;
  }

  override indicator(shape: TableShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={6} ry={6} />;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Render — 셀 grid + 편집 + 리사이즈 핸들 + 우클릭 메뉴
// ──────────────────────────────────────────────────────────────────────────────

function cellIdx(r: number, c: number, cols: number): number {
  return r * cols + c;
}

// ──────────────────────────────────────────────────────────────────────────────
// 셀 병합 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

/** (r, c) 셀이 속한 병합 영역. 없으면 null. */
function findMergeFor(
  r: number,
  c: number,
  merges: CellMerge[],
): CellMerge | null {
  for (const m of merges) {
    if (
      m.row <= r &&
      r < m.row + m.rowspan &&
      m.col <= c &&
      c < m.col + m.colspan
    ) {
      return m;
    }
  }
  return null;
}

/** (r, c) 가 병합 영역의 좌상단 (owner) 인지. */
function isMergeOwner(
  r: number,
  c: number,
  merges: CellMerge[],
): CellMerge | null {
  const m = merges.find((mm) => mm.row === r && mm.col === c);
  return m ?? null;
}

/** (r, c) 가 병합 영역 안이지만 좌상단이 아닌 경우 (render 에서 skip). */
function isCovered(r: number, c: number, merges: CellMerge[]): boolean {
  const m = findMergeFor(r, c, merges);
  return m !== null && !(m.row === r && m.col === c);
}

interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

function normalizeRange(range: CellRange): {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
} {
  return {
    minRow: Math.min(range.startRow, range.endRow),
    maxRow: Math.max(range.startRow, range.endRow),
    minCol: Math.min(range.startCol, range.endCol),
    maxCol: Math.max(range.startCol, range.endCol),
  };
}

function isInRange(r: number, c: number, range: CellRange | null): boolean {
  if (!range) return false;
  const n = normalizeRange(range);
  return r >= n.minRow && r <= n.maxRow && c >= n.minCol && c <= n.maxCol;
}

function rangeCellCount(range: CellRange): number {
  const n = normalizeRange(range);
  return (n.maxRow - n.minRow + 1) * (n.maxCol - n.minCol + 1);
}

interface EditingCell {
  row: number;
  col: number;
}

interface ContextMenuState {
  row: number;
  col: number;
  /** 카드 내부 좌표 (HTMLContainer 기준) */
  x: number;
  y: number;
}

const DOUBLE_CLICK_MS = 400;

function TableShapeBody({ shape }: { shape: TableShape }) {
  const editor = useEditor();
  const { w, h, rows, cols, cells, colWidths, rowHeights } = shape.props;
  // cellMerges 는 props 에 없을 수도 있음 (이전 버전 호환) — fallback to [].
  const cellMerges = shape.props.cellMerges ?? [];
  // 'table' 이 tldraw closed TLShape union 에 없어서 cast — getCustomColor 는
  // shape.meta 만 읽으므로 type 무관하게 동작.
  const customHex = getCustomColor(shape as unknown as TLShape);
  const borderColor = customHex ?? DEFAULT_BORDER_COLOR;
  const cellLineColor = customHex ?? DEFAULT_CELL_LINE_COLOR;

  const isEditing = useValue(
    'table-editing',
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  );

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draftText, setDraftText] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // 다중 셀 선택 범위 — shift+click 으로 확장.
  // null 이면 미선택. 단일 셀 = startRow=endRow & startCol=endCol.
  const [cellRange, setCellRange] = useState<CellRange | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastClickRef = useRef<{ time: number; cellKey: string }>({
    time: 0,
    cellKey: '',
  });

  // editing 종료 시 local state 정리.
  useEffect(() => {
    if (!isEditing) {
      setEditingCell(null);
    }
  }, [isEditing]);

  // editingCell 변하면 input 에 focus + select.
  useEffect(() => {
    if (!editingCell) return;
    const idx = cellIdx(editingCell.row, editingCell.col, cols);
    setDraftText(cells[idx] ?? '');
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCell]);

  // 외부 클릭 시 context menu 닫기.
  useEffect(() => {
    if (!contextMenu) return;
    const onAnyDown = () => setContextMenu(null);
    window.addEventListener('pointerdown', onAnyDown);
    return () => window.removeEventListener('pointerdown', onAnyDown);
  }, [contextMenu]);

  const colLefts: number[] = [];
  {
    let acc = 0;
    for (let c = 0; c < cols; c++) {
      colLefts.push(acc);
      acc += colWidths[c] ?? DEFAULT_COL_W;
    }
  }
  const rowTops: number[] = [];
  {
    let acc = 0;
    for (let r = 0; r < rows; r++) {
      rowTops.push(acc);
      acc += rowHeights[r] ?? DEFAULT_ROW_H;
    }
  }

  const startEditCell = (row: number, col: number) => {
    setEditingCell({ row, col });
    editor.setEditingShape(shape.id);
  };

  const commitEdit = () => {
    if (!editingCell) {
      editor.setEditingShape(null);
      return;
    }
    const idx = cellIdx(editingCell.row, editingCell.col, cols);
    const next = draftText;
    if (next !== (cells[idx] ?? '')) {
      const newCells = cells.slice();
      newCells[idx] = next;
      updateTableShape(editor, shape, { cells: newCells }, 'table-cell-edit');
    }
    editor.setEditingShape(null);
  };

  const cancelEdit = () => {
    editor.setEditingShape(null);
  };

  // 셀 onPointerDown — 더블클릭 직접 탐지 + Shift+click 으로 범위 선택.
  //   - 일반 클릭: 단일 셀 선택 + tldraw 가 표 자체도 선택 (stopPropagation 안 함).
  //   - Shift+click: 기존 시작점에서 클릭 셀까지 범위 확장.
  //   - 더블 클릭 (400ms 내, 같은 셀): 편집 모드 진입.
  const onCellPointerDown =
    (r: number, c: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button === 2) return; // 우클릭은 onContextMenu 가 처리.
      const cellKey = `${r}-${c}`;
      const now = Date.now();
      const last = lastClickRef.current;
      if (last.cellKey === cellKey && now - last.time < DOUBLE_CLICK_MS) {
        e.stopPropagation();
        e.preventDefault();
        lastClickRef.current = { time: 0, cellKey: '' };
        if (!isEditing || editingCell?.row !== r || editingCell?.col !== c) {
          startEditCell(r, c);
        }
        return;
      }
      lastClickRef.current = { time: now, cellKey };

      if (e.shiftKey && cellRange) {
        // Shift+click — 기존 시작점에서 현재 셀까지 확장. tldraw 의 shape 이동을 막기 위해 stop.
        e.stopPropagation();
        setCellRange({
          startRow: cellRange.startRow,
          startCol: cellRange.startCol,
          endRow: r,
          endCol: c,
        });
      } else {
        // 단일 셀 선택. tldraw 가 표 자체 select / drag 처리 가능하도록 propagate.
        setCellRange({ startRow: r, startCol: c, endRow: r, endCol: c });
      }
    };

  // 우클릭 컨텍스트 메뉴 열기.
  // 클릭한 셀이 현재 cellRange 안에 없으면 단일 셀 range 로 갱신 — "내가 클릭한 셀이 선택돼야"
  // 직관적. 안에 있으면 range 그대로 유지 (병합 옵션 노출).
  const onCellContextMenu =
    (r: number, c: number) => (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isInRange(r, c, cellRange)) {
        setCellRange({ startRow: r, startCol: c, endRow: r, endCol: c });
      }
      const container = (e.currentTarget as HTMLElement).closest('.tl-html-container');
      const rect = container?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : e.clientX;
      const y = rect ? e.clientY - rect.top : e.clientY;
      setContextMenu({ row: r, col: c, x, y });
    };

  // 열 경계 드래그 — colWidths[i] 와 [i+1] 사이 너비 재분배.
  const onColDividerDown =
    (col: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startWidths = colWidths.slice();
      const isLast = col === cols - 1;
      const moveHandler = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const next = startWidths.slice();
        if (isLast) {
          next[col] = Math.max(MIN_COL_W, startWidths[col]! + delta);
        } else {
          const left = startWidths[col]! + delta;
          const right = startWidths[col + 1]! - delta;
          if (left < MIN_COL_W || right < MIN_COL_W) return;
          next[col] = left;
          next[col + 1] = right;
        }
        const newW = next.reduce((a, b) => a + b, 0);
        updateTableShape(
          editor,
          shape,
          { colWidths: next, w: newW },
          'table-col-resize',
        );
      };
      const upHandler = () => {
        window.removeEventListener('pointermove', moveHandler);
        window.removeEventListener('pointerup', upHandler);
        window.removeEventListener('pointercancel', upHandler);
      };
      window.addEventListener('pointermove', moveHandler);
      window.addEventListener('pointerup', upHandler);
      window.addEventListener('pointercancel', upHandler);
    };

  const onRowDividerDown =
    (row: number) => (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const startY = e.clientY;
      const startHeights = rowHeights.slice();
      const isLast = row === rows - 1;
      const moveHandler = (ev: PointerEvent) => {
        const delta = ev.clientY - startY;
        const next = startHeights.slice();
        if (isLast) {
          next[row] = Math.max(MIN_ROW_H, startHeights[row]! + delta);
        } else {
          const top = startHeights[row]! + delta;
          const bot = startHeights[row + 1]! - delta;
          if (top < MIN_ROW_H || bot < MIN_ROW_H) return;
          next[row] = top;
          next[row + 1] = bot;
        }
        const newH = next.reduce((a, b) => a + b, 0);
        updateTableShape(
          editor,
          shape,
          { rowHeights: next, h: newH },
          'table-row-resize',
        );
      };
      const upHandler = () => {
        window.removeEventListener('pointermove', moveHandler);
        window.removeEventListener('pointerup', upHandler);
        window.removeEventListener('pointercancel', upHandler);
      };
      window.addEventListener('pointermove', moveHandler);
      window.addEventListener('pointerup', upHandler);
      window.addEventListener('pointercancel', upHandler);
    };

  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: w,
        height: h,
        background: 'white',
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        position: 'relative',
        pointerEvents: 'all',
        userSelect: 'none',
        color: '#1f1f2a',
        fontFamily: 'inherit',
        overflow: 'visible',
      }}
    >
      {/* 셀 grid — 병합 처리:
            covered 셀 (병합 영역 안 비-owner) 은 render 안 함.
            owner 셀은 rowspan/colspan 만큼 width/height 확장 + 우/하 border 는 병합 영역의
            바깥쪽에만 그림. */}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          if (isCovered(r, c, cellMerges)) return null;
          const owner = isMergeOwner(r, c, cellMerges);
          const rowspan = owner?.rowspan ?? 1;
          const colspan = owner?.colspan ?? 1;
          const idx = cellIdx(r, c, cols);
          const left = colLefts[c] ?? 0;
          const top = rowTops[r] ?? 0;
          // 병합된 셀은 spanned cols/rows 전체 너비/높이 합산.
          let cw = 0;
          for (let i = 0; i < colspan; i++) {
            cw += colWidths[c + i] ?? DEFAULT_COL_W;
          }
          let rh = 0;
          for (let i = 0; i < rowspan; i++) {
            rh += rowHeights[r + i] ?? DEFAULT_ROW_H;
          }
          const isThisEditing =
            isEditing && editingCell?.row === r && editingCell?.col === c;
          const value = cells[idx] ?? '';
          const isInSelection = isInRange(r, c, cellRange);
          // 마지막 열/행에 닿으면 표 외곽 border 가 처리 — 셀 내부 border 안 그림.
          const reachesRightEdge = c + colspan >= cols;
          const reachesBottomEdge = r + rowspan >= rows;
          const cellBg = isThisEditing
            ? '#F7F7F8'
            : isInSelection
              ? 'rgba(79, 209, 197, 0.18)' // 선택 강조 — accent-live 의 옅은 톤
              : 'transparent';
          return (
            <div
              key={`cell-${r}-${c}`}
              onPointerDown={onCellPointerDown(r, c)}
              onContextMenu={onCellContextMenu(r, c)}
              style={{
                position: 'absolute',
                left,
                top,
                width: cw,
                height: rh,
                borderRight: !reachesRightEdge
                  ? `1px solid ${cellLineColor}`
                  : 'none',
                borderBottom: !reachesBottomEdge
                  ? `1px solid ${cellLineColor}`
                  : 'none',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                fontSize: 12,
                lineHeight: 1.3,
                background: cellBg,
                cursor: 'text',
                overflow: 'hidden',
              }}
              title={value || '더블클릭해서 편집 · 우클릭해서 메뉴'}
            >
              {isThisEditing ? (
                <textarea
                  ref={inputRef}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      commitEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    } else if (e.key === 'Tab') {
                      e.preventDefault();
                      commitEdit();
                      const nextC = c + 1 < cols ? c + 1 : 0;
                      const nextR =
                        c + 1 < cols ? r : Math.min(r + 1, rows - 1);
                      requestAnimationFrame(() => {
                        startEditCell(nextR, nextC);
                      });
                    }
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={`${r + 1}행 ${c + 1}열 셀`}
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    outline: 'none',
                    resize: 'none',
                    background: 'transparent',
                    fontSize: 12,
                    fontFamily: 'inherit',
                    color: '#1f1f2a',
                    padding: 0,
                    userSelect: 'auto',
                    pointerEvents: 'all',
                  }}
                />
              ) : (
                <span
                  style={{
                    whiteSpace: 'pre-wrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {value}
                </span>
              )}
            </div>
          );
        }),
      )}

      {/* 열 경계 드래그 핸들. */}
      {Array.from({ length: cols }).map((_, c) => {
        const left = (colLefts[c] ?? 0) + (colWidths[c] ?? DEFAULT_COL_W);
        return (
          <div
            key={`col-handle-${c}`}
            onPointerDown={onColDividerDown(c)}
            style={{
              position: 'absolute',
              left: left - 3,
              top: 0,
              width: 6,
              height: h,
              cursor: 'col-resize',
              background: 'transparent',
              zIndex: 2,
              touchAction: 'none',
            }}
            aria-label={`${c + 1}열 너비 조정`}
            role="separator"
            aria-orientation="vertical"
          />
        );
      })}
      {/* 행 경계 드래그 핸들. */}
      {Array.from({ length: rows }).map((_, r) => {
        const top = (rowTops[r] ?? 0) + (rowHeights[r] ?? DEFAULT_ROW_H);
        return (
          <div
            key={`row-handle-${r}`}
            onPointerDown={onRowDividerDown(r)}
            style={{
              position: 'absolute',
              left: 0,
              top: top - 3,
              width: w,
              height: 6,
              cursor: 'row-resize',
              background: 'transparent',
              zIndex: 2,
              touchAction: 'none',
            }}
            aria-label={`${r + 1}행 높이 조정`}
            role="separator"
            aria-orientation="horizontal"
          />
        );
      })}

      {/* 우클릭 컨텍스트 메뉴 — 행/열 추가·삭제 + 셀 병합/해제. 외부 클릭 시 자동 닫힘. */}
      {contextMenu && !isEditing && (
        <ContextMenu
          state={contextMenu}
          rows={rows}
          cols={cols}
          canMerge={
            cellRange !== null &&
            isInRange(contextMenu.row, contextMenu.col, cellRange) &&
            rangeCellCount(cellRange) > 1
          }
          mergeAt={isMergeOwner(contextMenu.row, contextMenu.col, cellMerges)}
          onAddRowAbove={() => {
            addRowAt(editor, shape, contextMenu.row);
            setContextMenu(null);
          }}
          onAddRowBelow={() => {
            addRowAt(editor, shape, contextMenu.row + 1);
            setContextMenu(null);
          }}
          onAddColLeft={() => {
            addColAt(editor, shape, contextMenu.col);
            setContextMenu(null);
          }}
          onAddColRight={() => {
            addColAt(editor, shape, contextMenu.col + 1);
            setContextMenu(null);
          }}
          onRemoveRow={() => {
            removeRowAt(editor, shape, contextMenu.row);
            setContextMenu(null);
          }}
          onRemoveCol={() => {
            removeColAt(editor, shape, contextMenu.col);
            setContextMenu(null);
          }}
          onMerge={() => {
            if (cellRange) {
              mergeCells(editor, shape, cellRange);
              setCellRange({
                startRow: normalizeRange(cellRange).minRow,
                startCol: normalizeRange(cellRange).minCol,
                endRow: normalizeRange(cellRange).minRow,
                endCol: normalizeRange(cellRange).minCol,
              });
            }
            setContextMenu(null);
          }}
          onUnmerge={() => {
            const owner = isMergeOwner(contextMenu.row, contextMenu.col, cellMerges);
            if (owner) {
              unmergeCells(editor, shape, owner);
            }
            setContextMenu(null);
          }}
        />
      )}
    </HTMLContainer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 컨텍스트 메뉴 — 표 내부에 absolute 로 띄움
// ──────────────────────────────────────────────────────────────────────────────

interface ContextMenuProps {
  state: ContextMenuState;
  rows: number;
  cols: number;
  /** 선택 범위가 2 셀 이상이고 클릭한 셀이 범위 안인지. */
  canMerge: boolean;
  /** 클릭한 셀이 병합 영역의 owner 면 그 merge 객체. 아니면 null. */
  mergeAt: CellMerge | null;
  onAddRowAbove: () => void;
  onAddRowBelow: () => void;
  onAddColLeft: () => void;
  onAddColRight: () => void;
  onRemoveRow: () => void;
  onRemoveCol: () => void;
  onMerge: () => void;
  onUnmerge: () => void;
}

function ContextMenu({
  state,
  rows,
  cols,
  canMerge,
  mergeAt,
  onAddRowAbove,
  onAddRowBelow,
  onAddColLeft,
  onAddColRight,
  onRemoveRow,
  onRemoveCol,
  onMerge,
  onUnmerge,
}: ContextMenuProps) {
  // 클릭한 셀 위치를 기준으로 메뉴 표시. 표 영역을 벗어나도 OK (overflow: visible).
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        left: state.x,
        top: state.y,
        minWidth: 180,
        background: 'white',
        color: '#1f1f2a',
        border: '1px solid #DCDCE0',
        borderRadius: 6,
        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
        padding: '4px 0',
        zIndex: 10,
        fontSize: 12,
        fontFamily: 'inherit',
      }}
    >
      <MenuItem
        label={`${state.row + 1}행 위에 행 추가`}
        disabled={rows >= MAX_ROWS}
        onSelect={onAddRowAbove}
      />
      <MenuItem
        label={`${state.row + 1}행 아래에 행 추가`}
        disabled={rows >= MAX_ROWS}
        onSelect={onAddRowBelow}
      />
      <MenuItem
        label={`${state.col + 1}열 왼쪽에 열 추가`}
        disabled={cols >= MAX_COLS}
        onSelect={onAddColLeft}
      />
      <MenuItem
        label={`${state.col + 1}열 오른쪽에 열 추가`}
        disabled={cols >= MAX_COLS}
        onSelect={onAddColRight}
      />
      {(canMerge || mergeAt) && (
        <>
          <div style={{ borderTop: '1px solid #ECECEF', margin: '4px 0' }} />
          {canMerge && !mergeAt && (
            <MenuItem label="선택한 셀들 병합" onSelect={onMerge} />
          )}
          {mergeAt && (
            <MenuItem
              label={`병합 해제 (${mergeAt.rowspan} × ${mergeAt.colspan})`}
              onSelect={onUnmerge}
            />
          )}
        </>
      )}
      <div style={{ borderTop: '1px solid #ECECEF', margin: '4px 0' }} />
      <MenuItem
        label={`${state.row + 1}행 삭제`}
        disabled={rows <= 1}
        onSelect={onRemoveRow}
        danger
      />
      <MenuItem
        label={`${state.col + 1}열 삭제`}
        disabled={cols <= 1}
        onSelect={onRemoveCol}
        danger
      />
    </div>
  );
}

function MenuItem({
  label,
  disabled,
  onSelect,
  danger,
}: {
  label: string;
  disabled?: boolean;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onSelect();
      }}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '6px 12px',
        border: 'none',
        background: 'transparent',
        color: disabled ? '#9A9AA8' : danger ? '#FF3D5A' : '#1f1f2a',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = '#F7F7F8';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 구조 편집 헬퍼 — 행/열 임의 위치에 삽입·삭제 + 셀 병합/해제
// ──────────────────────────────────────────────────────────────────────────────

/** 행 삽입 시 cellMerges 조정.
 *   - merge 가 insertAt 위쪽에 완전히 있으면 변화 없음.
 *   - merge.row >= insertAt 면 row += 1 (아래로 밀림).
 *   - merge 가 insertAt 을 가로지르면 (merge.row < insertAt < merge.row+rowspan) rowspan += 1.
 */
function shiftMergesForAddRow(merges: CellMerge[], insertAt: number): CellMerge[] {
  return merges.map((m) => {
    if (m.row >= insertAt) return { ...m, row: m.row + 1 };
    if (m.row + m.rowspan > insertAt) return { ...m, rowspan: m.rowspan + 1 };
    return m;
  });
}

function shiftMergesForAddCol(merges: CellMerge[], insertAt: number): CellMerge[] {
  return merges.map((m) => {
    if (m.col >= insertAt) return { ...m, col: m.col + 1 };
    if (m.col + m.colspan > insertAt) return { ...m, colspan: m.colspan + 1 };
    return m;
  });
}

/** 행 삭제 시 cellMerges 조정. rowspan/colspan 이 1 이하가 되면 merge 제거. */
function shiftMergesForRemoveRow(merges: CellMerge[], idx: number): CellMerge[] {
  const next: CellMerge[] = [];
  for (const m of merges) {
    if (m.row > idx) {
      next.push({ ...m, row: m.row - 1 });
    } else if (m.row + m.rowspan <= idx) {
      next.push(m);
    } else {
      // 삭제되는 행이 merge 안에 포함 → rowspan 감소.
      const newRowspan = m.rowspan - 1;
      if (newRowspan >= 1 && (newRowspan > 1 || m.colspan > 1)) {
        next.push({ ...m, rowspan: newRowspan });
      }
      // newRowspan === 0 (단일 행 merge) 또는 1×1 으로 축소 시 제거.
    }
  }
  return next;
}

function shiftMergesForRemoveCol(merges: CellMerge[], idx: number): CellMerge[] {
  const next: CellMerge[] = [];
  for (const m of merges) {
    if (m.col > idx) {
      next.push({ ...m, col: m.col - 1 });
    } else if (m.col + m.colspan <= idx) {
      next.push(m);
    } else {
      const newColspan = m.colspan - 1;
      if (newColspan >= 1 && (m.rowspan > 1 || newColspan > 1)) {
        next.push({ ...m, colspan: newColspan });
      }
    }
  }
  return next;
}

/** rowIndex 위치에 빈 행 삽입 (rowIndex=0 이면 맨 위, rowIndex=rows 면 맨 아래). */
function addRowAt(
  editor: ReturnType<typeof useEditor>,
  shape: TableShape,
  rowIndex: number,
) {
  const { rows, cols, cells, rowHeights, h } = shape.props;
  const cellMerges = shape.props.cellMerges ?? [];
  if (rows >= MAX_ROWS) return;
  const insertAt = Math.max(0, Math.min(rows, rowIndex));
  const newRowCells = Array.from({ length: cols }, () => '');
  const newCells = [
    ...cells.slice(0, insertAt * cols),
    ...newRowCells,
    ...cells.slice(insertAt * cols),
  ];
  const newRowHeights = [
    ...rowHeights.slice(0, insertAt),
    DEFAULT_ROW_H,
    ...rowHeights.slice(insertAt),
  ];
  updateTableShape(
    editor,
    shape,
    {
      rows: rows + 1,
      cells: newCells,
      rowHeights: newRowHeights,
      h: h + DEFAULT_ROW_H,
      cellMerges: shiftMergesForAddRow(cellMerges, insertAt),
    },
    'table-add-row',
  );
}

/** colIndex 위치에 빈 열 삽입. */
function addColAt(
  editor: ReturnType<typeof useEditor>,
  shape: TableShape,
  colIndex: number,
) {
  const { rows, cols, cells, colWidths, w } = shape.props;
  const cellMerges = shape.props.cellMerges ?? [];
  if (cols >= MAX_COLS) return;
  const insertAt = Math.max(0, Math.min(cols, colIndex));
  const newCols = cols + 1;
  const newCells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < newCols; c++) {
      if (c === insertAt) {
        newCells.push('');
      } else {
        const oldC = c < insertAt ? c : c - 1;
        newCells.push(cells[r * cols + oldC] ?? '');
      }
    }
  }
  const newColWidths = [
    ...colWidths.slice(0, insertAt),
    DEFAULT_COL_W,
    ...colWidths.slice(insertAt),
  ];
  updateTableShape(
    editor,
    shape,
    {
      cols: newCols,
      cells: newCells,
      colWidths: newColWidths,
      w: w + DEFAULT_COL_W,
      cellMerges: shiftMergesForAddCol(cellMerges, insertAt),
    },
    'table-add-col',
  );
}

function removeRowAt(
  editor: ReturnType<typeof useEditor>,
  shape: TableShape,
  rowIndex: number,
) {
  const { rows, cols, cells, rowHeights, h } = shape.props;
  const cellMerges = shape.props.cellMerges ?? [];
  if (rows <= 1) return;
  const idx = Math.max(0, Math.min(rows - 1, rowIndex));
  const newCells = [
    ...cells.slice(0, idx * cols),
    ...cells.slice((idx + 1) * cols),
  ];
  const removed = rowHeights[idx] ?? DEFAULT_ROW_H;
  const newRowHeights = [
    ...rowHeights.slice(0, idx),
    ...rowHeights.slice(idx + 1),
  ];
  updateTableShape(
    editor,
    shape,
    {
      rows: rows - 1,
      cells: newCells,
      rowHeights: newRowHeights,
      h: h - removed,
      cellMerges: shiftMergesForRemoveRow(cellMerges, idx),
    },
    'table-remove-row',
  );
}

function removeColAt(
  editor: ReturnType<typeof useEditor>,
  shape: TableShape,
  colIndex: number,
) {
  const { rows, cols, cells, colWidths, w } = shape.props;
  const cellMerges = shape.props.cellMerges ?? [];
  if (cols <= 1) return;
  const idx = Math.max(0, Math.min(cols - 1, colIndex));
  const newCells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c === idx) continue;
      newCells.push(cells[r * cols + c] ?? '');
    }
  }
  const removed = colWidths[idx] ?? DEFAULT_COL_W;
  const newColWidths = [
    ...colWidths.slice(0, idx),
    ...colWidths.slice(idx + 1),
  ];
  updateTableShape(
    editor,
    shape,
    {
      cols: cols - 1,
      cells: newCells,
      colWidths: newColWidths,
      w: w - removed,
      cellMerges: shiftMergesForRemoveCol(cellMerges, idx),
    },
    'table-remove-col',
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 셀 병합 / 해제
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 선택 범위를 하나의 병합 셀로 합침.
 *   - 좌상단 셀의 텍스트는 보존, 나머지 셀들의 텍스트는 비움 (Excel 와 동일 동작).
 *   - 기존에 범위와 겹치는 merge 들은 제거 (새 병합으로 대체).
 */
function mergeCells(
  editor: ReturnType<typeof useEditor>,
  shape: TableShape,
  range: CellRange,
) {
  const { cols, cells } = shape.props;
  const cellMerges = shape.props.cellMerges ?? [];
  const n = normalizeRange(range);
  const rowspan = n.maxRow - n.minRow + 1;
  const colspan = n.maxCol - n.minCol + 1;
  if (rowspan <= 1 && colspan <= 1) return;

  // 범위 안 셀 텍스트 비우기 (좌상단 제외).
  const newCells = cells.slice();
  for (let r = n.minRow; r <= n.maxRow; r++) {
    for (let c = n.minCol; c <= n.maxCol; c++) {
      if (r === n.minRow && c === n.minCol) continue;
      newCells[r * cols + c] = '';
    }
  }
  // 새 범위와 겹치는 기존 merge 제거.
  const filtered = cellMerges.filter((m) => {
    const overlap =
      m.row <= n.maxRow &&
      m.row + m.rowspan - 1 >= n.minRow &&
      m.col <= n.maxCol &&
      m.col + m.colspan - 1 >= n.minCol;
    return !overlap;
  });
  const newMerge: CellMerge = {
    row: n.minRow,
    col: n.minCol,
    rowspan,
    colspan,
  };
  updateTableShape(
    editor,
    shape,
    {
      cells: newCells,
      cellMerges: [...filtered, newMerge],
    },
    'table-merge-cells',
  );
}

function unmergeCells(
  editor: ReturnType<typeof useEditor>,
  shape: TableShape,
  merge: CellMerge,
) {
  const cellMerges = shape.props.cellMerges ?? [];
  const next = cellMerges.filter(
    (m) =>
      !(
        m.row === merge.row &&
        m.col === merge.col &&
        m.rowspan === merge.rowspan &&
        m.colspan === merge.colspan
      ),
  );
  updateTableShape(editor, shape, { cellMerges: next }, 'table-unmerge-cells');
}

// ──────────────────────────────────────────────────────────────────────────────
// updateShapes wrapper — 'table' 이 tldraw 의 closed TLShape union 에 없어서
// cast 가 필요. customColor / gdrive rename 과 동일한 패턴.
// ──────────────────────────────────────────────────────────────────────────────

function updateTableShape(
  editor: ReturnType<typeof useEditor>,
  shape: TableShape,
  partialProps: Partial<TableShape['props']>,
  historyMark?: string,
) {
  if (historyMark) editor.markHistoryStoppingPoint(historyMark);
  editor.updateShapes([
    {
      id: shape.id,
      type: shape.type,
      props: { ...shape.props, ...partialProps },
    },
  ] as unknown as Parameters<typeof editor.updateShapes>[0]);
}
