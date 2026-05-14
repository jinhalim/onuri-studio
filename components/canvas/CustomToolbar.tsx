'use client';

import {
  DefaultToolbar,
  DefaultToolbarContent,
  TldrawUiMenuItem,
  createShapeId,
  useEditor,
} from '@/lib/editor';

// tldraw 의 DefaultToolbar 는 OverflowingToolbar 가 maxItems=8 / maxSizePx=470 으로 제한해서
// 화면이 넓어도 8개만 inline 표시 + 나머지는 "자세히" overflow. 본 wrapper 는 그 임계점을
// 늘려서 ~70vw 의 가로 공간을 채울 때까지 inline 노출.
//
//   modulate(parentWidth, [minSizePx, maxSizePx], [minItems, maxItems], clamp=true)
//
// parentWidth = .tlui-main-toolbar.offsetWidth (대략 캔버스 영역 너비)
// → maxSizePx=1200 / maxItems=20 으로 늘려서 wide screen 에서 거의 모든 도구 inline.
// → 작은 화면에서는 자연스럽게 overflow (modulate 의 클램프 동작).
//
// D-019: 표 도구를 toolbar 에 등록. tldraw 가 'table' 이라는 built-in tool 없어서
// 별도 tool state node 대신 click-to-insert 방식 사용 — 버튼 누르면 viewport 중앙에 표 생성.

// 표 아이콘 — tldraw built-in icon 에 grid/table 없어서 custom SVG.
// TLUiIconJsx 는 ReactElement<HTMLAttributes<HTMLDivElement>> 라 div 로 감싸야 함.
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

function TableToolbarButton() {
  const editor = useEditor();
  return (
    <TldrawUiMenuItem
      id="table"
      icon={TableIconJsx}
      label="표"
      onSelect={() => {
        // viewport 중앙에 새 표 생성 + 선택. createShape 의 type 'table' 은 tldraw 의
        // closed shape union 에 없어서 cast 가 필요 — 런타임은 등록된 shapeUtils 로 정상 동작.
        const id = createShapeId();
        // viewport 의 page 좌표 bounds 가져와서 중앙 계산.
        const vb = editor.getViewportPageBounds();
        const cx = vb.x + vb.w / 2;
        const cy = vb.y + vb.h / 2;
        // 기본 크기 (3행×3열, 360×120) 의 절반만큼 offset 해서 중앙 정렬.
        const x = cx - 180;
        const y = cy - 60;
        editor.createShapes([
          {
            id,
            type: 'table',
            x,
            y,
          },
        ] as unknown as Parameters<typeof editor.createShapes>[0]);
        editor.setSelectedShapes([id]);
      }}
    />
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
