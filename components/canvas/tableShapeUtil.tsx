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
//   - 셀 더블클릭 = 인라인 텍스트 편집 (Enter 저장 / Esc 취소)
//   - 열/행 경계 호버 = ↔/↕ 커서 → 드래그로 너비/높이 조정
//   - 표 선택 시 외곽에 +/- 버튼 노출 → 행/열 추가·삭제
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
} from '@/lib/editor';

// ──────────────────────────────────────────────────────────────────────────────
// Shape definition
// ──────────────────────────────────────────────────────────────────────────────

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

function defaultProps(): TableShape['props'] {
  const cells = Array.from({ length: DEFAULT_ROWS * DEFAULT_COLS }, () => '');
  const colWidths = Array.from({ length: DEFAULT_COLS }, () => DEFAULT_COL_W);
  const rowHeights = Array.from({ length: DEFAULT_ROWS }, () => DEFAULT_ROW_H);
  return {
    w: DEFAULT_COLS * DEFAULT_COL_W,
    h: DEFAULT_ROWS * DEFAULT_ROW_H,
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    cells,
    colWidths,
    rowHeights,
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
  };

  override getDefaultProps(): TableShape['props'] {
    return defaultProps();
  }

  override getIndicatorPath() {
    return undefined;
  }

  override canEdit() {
    return true;
  }
  override canResize() {
    return true;
  }
  override hideRotateHandle() {
    return true;
  }

  // 코너 핸들로 표 통째 리사이즈 — colWidths / rowHeights 도 같이 scale.
  // resizeBox 의 generic 이 tldraw built-in shape union 으로 strict 라 cast 로 우회.
  // info 의 정확한 type 도 같은 이유로 unknown — 런타임은 BaseBoxShapeUtil 의 box geom 만족하면 동작.
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
// Render — 셀 grid + 편집 + 리사이즈 핸들 + 추가/삭제 버튼
// ──────────────────────────────────────────────────────────────────────────────

function cellIdx(r: number, c: number, cols: number): number {
  return r * cols + c;
}

interface EditingCell {
  row: number;
  col: number;
}

function TableShapeBody({ shape }: { shape: TableShape }) {
  const editor = useEditor();
  const { w, h, rows, cols, cells, colWidths, rowHeights } = shape.props;

  // 본 shape 이 현재 tldraw 의 editing 상태인지 (rules: editingShapeId === shape.id).
  // 편집 모드 진입 시점에 어느 셀을 편집할지 골라야 함 — 더블클릭 좌표를 잡아두고
  // editingShapeId 가 set 되면 그 좌표 기반으로 셀 결정.
  const isEditing = useValue(
    'table-editing',
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  );

  // 어느 셀을 편집 중인지 — 더블클릭한 위치로 결정. shape.meta 가 아닌 local state 라
  // 다른 사용자에게 broadcast 되지 않음 (의도: 각자 다른 셀 동시 편집 가능, single-user
  // 동시성 한계는 LWW).
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [draftText, setDraftText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // editing 종료 (외부에서 editingShapeId=null 됨) 시 local state 정리.
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

  const isSelected = useValue(
    'table-selected',
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  );

  // 셀의 x/y 위치 누적 계산 (left/top 분만).
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

  // 열 경계 드래그 — colWidths[i] 와 [i+1] 사이 너비 재분배 (전체 w 는 유지).
  // 마지막 열은 i = cols-1 에서 오른쪽 끝 = 표 전체 확장.
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
          // 마지막 열은 표 전체 확장 — colWidths[last] += delta.
          next[col] = Math.max(MIN_COL_W, startWidths[col]! + delta);
        } else {
          // 가운데 경계 — 좌측 열 확장, 우측 열 축소 (또는 그 반대).
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
        border: '1px solid #2A2A38',
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
      {/* 셀 grid */}
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const idx = cellIdx(r, c, cols);
          const left = colLefts[c] ?? 0;
          const top = rowTops[r] ?? 0;
          const cw = colWidths[c] ?? DEFAULT_COL_W;
          const rh = rowHeights[r] ?? DEFAULT_ROW_H;
          const isThisEditing =
            isEditing && editingCell?.row === r && editingCell?.col === c;
          const value = cells[idx] ?? '';
          return (
            <div
              key={`cell-${r}-${c}`}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEditCell(r, c);
              }}
              style={{
                position: 'absolute',
                left,
                top,
                width: cw,
                height: rh,
                borderRight:
                  c < cols - 1 ? '1px solid #DCDCE0' : 'none',
                borderBottom:
                  r < rows - 1 ? '1px solid #DCDCE0' : 'none',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'flex-start',
                fontSize: 12,
                lineHeight: 1.3,
                background: isThisEditing ? '#F7F7F8' : 'transparent',
                cursor: isSelected ? 'text' : 'default',
                overflow: 'hidden',
              }}
              title={value || '더블클릭해서 편집'}
            >
              {isThisEditing ? (
                <textarea
                  ref={inputRef}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    // tldraw 가 Del/arrow/cmd+Z 등 가로채지 않게 stop.
                    e.stopPropagation();
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      commitEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEdit();
                    } else if (e.key === 'Tab') {
                      // Tab → 다음 셀로 이동 + commit
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

      {/* 열 경계 드래그 핸들 — col index 0..cols-1 의 우측 경계.
          마지막 열은 표 오른쪽 끝 → 표 전체 확장. */}
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

      {/* 표 선택 시 외곽에 행/열 추가·삭제 컨트롤 노출.
          - 오른쪽 가장자리: 열 +/- (마지막 열 기준)
          - 아래쪽 가장자리: 행 +/- (마지막 행 기준) */}
      {isSelected && !isEditing && (
        <>
          <StructureButton
            label="열 추가"
            sign="+"
            disabled={cols >= MAX_COLS}
            style={{ right: -34, top: h / 2 - 12 }}
            onClick={(e) => {
              e.stopPropagation();
              addCol(editor, shape);
            }}
          />
          <StructureButton
            label="마지막 열 삭제"
            sign="−"
            disabled={cols <= 1}
            style={{ right: -34, top: h / 2 + 18 }}
            onClick={(e) => {
              e.stopPropagation();
              removeCol(editor, shape);
            }}
          />
          <StructureButton
            label="행 추가"
            sign="+"
            disabled={rows >= MAX_ROWS}
            style={{ bottom: -34, left: w / 2 - 30 }}
            onClick={(e) => {
              e.stopPropagation();
              addRow(editor, shape);
            }}
          />
          <StructureButton
            label="마지막 행 삭제"
            sign="−"
            disabled={rows <= 1}
            style={{ bottom: -34, left: w / 2 + 6 }}
            onClick={(e) => {
              e.stopPropagation();
              removeRow(editor, shape);
            }}
          />
        </>
      )}
    </HTMLContainer>
  );
}

function StructureButton({
  label,
  sign,
  disabled,
  style,
  onClick,
}: {
  label: string;
  sign: string;
  disabled: boolean;
  style: React.CSSProperties;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      style={{
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: disabled ? '#DCDCE0' : '#1F1F2A',
        color: disabled ? '#9A9AA8' : '#F5F5F7',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        fontWeight: 600,
        lineHeight: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        pointerEvents: 'all',
        zIndex: 3,
        ...style,
      }}
    >
      {sign}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 구조 편집 헬퍼 — 행/열 추가·삭제
// ──────────────────────────────────────────────────────────────────────────────

function addCol(editor: ReturnType<typeof useEditor>, shape: TableShape) {
  const { rows, cols, cells, colWidths, w } = shape.props;
  if (cols >= MAX_COLS) return;
  const newCols = cols + 1;
  const newCells = Array.from({ length: rows * newCols }, () => '');
  // 기존 셀들을 새 행/열 구조로 복사 (오른쪽에 빈 열 추가).
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      newCells[r * newCols + c] = cells[r * cols + c] ?? '';
    }
  }
  const newColWidths = [...colWidths, DEFAULT_COL_W];
  updateTableShape(
    editor,
    shape,
    {
      cols: newCols,
      cells: newCells,
      colWidths: newColWidths,
      w: w + DEFAULT_COL_W,
    },
    'table-add-col',
  );
}

function removeCol(editor: ReturnType<typeof useEditor>, shape: TableShape) {
  const { rows, cols, cells, colWidths, w } = shape.props;
  if (cols <= 1) return;
  const newCols = cols - 1;
  const removed = cols - 1;
  const newCells: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c === removed) continue;
      newCells.push(cells[r * cols + c] ?? '');
    }
  }
  const newColWidths = colWidths.slice(0, removed);
  const removedW = colWidths[removed] ?? DEFAULT_COL_W;
  updateTableShape(
    editor,
    shape,
    {
      cols: newCols,
      cells: newCells,
      colWidths: newColWidths,
      w: w - removedW,
    },
    'table-remove-col',
  );
}

function addRow(editor: ReturnType<typeof useEditor>, shape: TableShape) {
  const { rows, cols, cells, rowHeights, h } = shape.props;
  if (rows >= MAX_ROWS) return;
  const newCells = [...cells, ...Array.from({ length: cols }, () => '')];
  const newRowHeights = [...rowHeights, DEFAULT_ROW_H];
  updateTableShape(
    editor,
    shape,
    {
      rows: rows + 1,
      cells: newCells,
      rowHeights: newRowHeights,
      h: h + DEFAULT_ROW_H,
    },
    'table-add-row',
  );
}

function removeRow(editor: ReturnType<typeof useEditor>, shape: TableShape) {
  const { rows, cols, cells, rowHeights, h } = shape.props;
  if (rows <= 1) return;
  const removed = rows - 1;
  const newCells = cells.slice(0, removed * cols);
  const newRowHeights = rowHeights.slice(0, removed);
  const removedH = rowHeights[removed] ?? DEFAULT_ROW_H;
  updateTableShape(
    editor,
    shape,
    {
      rows: rows - 1,
      cells: newCells,
      rowHeights: newRowHeights,
      h: h - removedH,
    },
    'table-remove-row',
  );
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
