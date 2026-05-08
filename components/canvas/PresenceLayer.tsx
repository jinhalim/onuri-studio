'use client';

import type { Editor } from 'tldraw';
import type { PresenceState } from '@/lib/hooks/useStoryRealtime';

interface PresenceLayerProps {
  presences: PresenceState[];
  editor: Editor | null;
  currentUserId: string;
}

// 다른 사용자의 커서를 캔버스 위에 절대 배치.
// 페이지 좌표 → 화면 좌표 변환은 editor.pageToScreen 사용.
// 화면 좌표가 변하더라도 매번 리렌더 되도록 editor.store.listen(scope: 'session') 으로
// 캠퍼스 카메라 변화에 따라가야 하지만, MVP 에서는 transition 으로 부드럽게 처리.

export function PresenceLayer({ presences, editor, currentUserId }: PresenceLayerProps) {
  if (!editor) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {presences
        .filter((p) => p.userId !== currentUserId && p.cursor)
        .map((p) => (
          <RemoteCursor key={p.userId} presence={p} editor={editor} />
        ))}
    </div>
  );
}

function RemoteCursor({ presence, editor }: { presence: PresenceState; editor: Editor }) {
  if (!presence.cursor) return null;
  const screen = editor.pageToScreen(presence.cursor);

  return (
    <div
      className="absolute left-0 top-0 transition-transform duration-75 ease-out"
      style={{
        transform: `translate(${screen.x}px, ${screen.y}px)`,
      }}
    >
      <CursorIcon color={presence.color} />
      <span
        className="ml-3 -mt-1 inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-semibold text-white"
        style={{ backgroundColor: presence.color }}
      >
        {presence.nickname}
        {presence.isDrawing && ' ●'}
      </span>
    </div>
  );
}

function CursorIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3 3 L3 17 L7.5 13 L10 18 L12 17 L9.5 12 L15 12 Z"
        fill={color}
        stroke="white"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
