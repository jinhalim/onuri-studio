// NoteShapeUtil 의 component() 를 override 해서 "by 작성자" 라벨을 노트 도형 내부에
// inline 렌더한다. 기존 NoteAuthorLayer 는 viewport overlay 라 항상 다른 도형 위에 떠
// 있었지만, 본 방식은 노트 shape 의 HTMLContainer 안에 자연스럽게 들어가서 다른 도형이
// 노트를 가리면 라벨도 함께 가려진다 (사용자 요청: 동일 z-index).
//
// 기존 .configure({ getCustomDisplayValues }) 의 customColor 동작도 보존하기 위해
// 먼저 configure 로 base class 를 만든 뒤, 그 위에 subclass 로 component 만 추가 override.

import { NoteShapeUtil } from '@/lib/editor';
import { getCustomColor } from './customShapeUtils-shared';

// NoteShapeUtil 의 component prop 인자 type — TLNoteShape 가 직접 export 안 돼서
// any 처럼 받고 내부에서 props.scale 만 안전하게 추출.
type NoteShape = Parameters<NoteShapeUtil['component']>[0];

// hex / 색 헬퍼는 customShapeUtils.ts 와 동일 — getCustomColor 만 share.
const ConfiguredNoteUtil = NoteShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    return {
      noteBackgroundColor: hex,
      borderColor: hexWithAlpha(hex, 0.6),
      labelColor: labelOnHex(hex),
    };
  },
});

export class CustomNoteShapeUtilWithAuthor extends ConfiguredNoteUtil {
  override component(shape: NoteShape) {
    const original = super.component(shape);
    const meta = shape.meta as Record<string, unknown> | undefined;
    const author = typeof meta?.createdBy === 'string' ? meta.createdBy : null;
    if (!author) return original;

    // 노트 자체 scale 에 라벨 폰트도 맞춤 (작은 노트 → 작은 라벨).
    const noteScale = (shape.props as { scale?: number }).scale ?? 1;
    const fontSize = Math.max(9, Math.min(14, 10 * noteScale));

    return (
      <>
        {original}
        {/* 노트의 HTMLContainer 안쪽에 absolute 로 우하단 정렬. 노트가 가려지면 라벨도
            함께 가려짐 — 사용자 요청한 z-index 동일성 만족. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'flex-end',
            padding: `0 ${8 * noteScale}px ${4 * noteScale}px 0`,
            zIndex: 1,
          }}
          aria-hidden
        >
          <span
            style={{
              fontSize,
              fontWeight: 500,
              color: 'rgba(0,0,0,0.55)',
              fontFamily:
                'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              whiteSpace: 'nowrap',
              letterSpacing: '-0.01em',
            }}
          >
            by {author}
          </span>
        </div>
      </>
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 색 헬퍼 — customShapeUtils.ts 와 동일 구현 복사 (해당 파일이 .ts 라 JSX 못 넣어
// 분리. 향후 둘 다 share 모듈로 통합 가능).
// ──────────────────────────────────────────────────────────────────────────────

function hexWithAlpha(hex: string, alpha01: number): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.length === 3 ? m[0]! + m[0]! : m.slice(0, 2), 16);
  const g = parseInt(m.length === 3 ? m[1]! + m[1]! : m.slice(2, 4), 16);
  const b = parseInt(m.length === 3 ? m[2]! + m[2]! : m.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha01));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function labelOnHex(hex: string): string {
  const m = hex.replace('#', '');
  const r = parseInt(m.length === 3 ? m[0]! + m[0]! : m.slice(0, 2), 16);
  const g = parseInt(m.length === 3 ? m[1]! + m[1]! : m.slice(2, 4), 16);
  const b = parseInt(m.length === 3 ? m[2]! + m[2]! : m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1F1F2A' : '#F5F5F7';
}
