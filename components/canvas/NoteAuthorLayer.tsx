'use client';

import { useValue, type Editor, type TLShape } from '@/lib/editor';

// 노트(메모지) 도형 하단 우측에 작성자(by 사용자) 라벨을 표시하는 오버레이.
// 작성자 정보는 shape.meta.createdBy 에서 읽어옴 (StudioCanvas 가 생성 시 자동 stamp).
//
// 좌표 변환: shape page bounds.maxX/maxY → editor.pageToViewport → 캔버스 기준 좌표.
// PresenceLayer 와 동일한 z-index 정책 (캔버스 위, tldraw UI 아래).

interface NoteAuthorLayerProps {
  editor: Editor | null;
}

interface NoteAuthorEntry {
  id: string;
  x: number;
  y: number;
  author: string;
  /** 줌에 비례한 폰트 크기 (너무 작거나 크지 않게 clamp). */
  fontSize: number;
}

export function NoteAuthorLayer({ editor }: NoteAuthorLayerProps) {
  const entries = useValue<NoteAuthorEntry[]>(
    'note author entries',
    () => {
      if (!editor) return [];
      // camera 변화 추적 (zoom/pan 시 라벨 위치 갱신)
      const camera = editor.getCamera();
      const zoom = camera.z;

      const items: NoteAuthorEntry[] = [];
      for (const s of editor.getCurrentPageShapes()) {
        if (s.type !== 'note') continue;
        const author = readAuthor(s);
        if (!author) continue;
        const bounds = editor.getShapePageBounds(s);
        if (!bounds) continue;

        // 노트 우하단 페이지 좌표 → 캔버스(viewport) 좌표
        const corner = editor.pageToViewport({ x: bounds.maxX, y: bounds.maxY });

        // 너무 작은 줌에서는 라벨 숨김 (가독성 X)
        if (zoom < 0.35) continue;

        items.push({
          id: s.id,
          x: corner.x,
          y: corner.y,
          author,
          fontSize: clamp(10 * zoom, 9, 14),
        });
      }
      return items;
    },
    [editor],
  );

  if (!editor || entries.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {entries.map((e) => (
        <span
          key={e.id}
          style={{
            position: 'absolute',
            // 우하단 코너를 라벨 우하단에 정렬: translate(-100%, -100%)
            transform: `translate(${e.x}px, ${e.y}px) translate(-100%, -100%)`,
            transformOrigin: 'bottom right',
            fontSize: e.fontSize,
            fontWeight: 500,
            color: 'rgba(0,0,0,0.55)',
            padding: '0 6px 2px 0',
            whiteSpace: 'nowrap',
            fontFamily:
              'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            letterSpacing: '-0.01em',
          }}
        >
          by {e.author}
        </span>
      ))}
    </div>
  );
}

function readAuthor(s: TLShape): string | null {
  const v = (s.meta as Record<string, unknown> | undefined)?.createdBy;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
