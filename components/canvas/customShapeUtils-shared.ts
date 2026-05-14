// customShapeUtils.ts / customNoteShapeUtil.tsx 양쪽에서 import 하는 공통 헬퍼.
// 본 파일이 따로 있는 이유: customShapeUtils.ts 는 .ts 라 JSX 못 넣고, NoteShapeUtil
// 의 component override 는 JSX 가 필요해서 customNoteShapeUtil.tsx 를 별도 분리.
// 두 파일이 서로 import 하면 순환 의존성 → 공통 코드를 본 파일에 둠.

import type { TLShape } from '@/lib/editor';

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** shape.meta.customColor 가 유효한 hex 문자열이면 반환, 아니면 null. */
export function getCustomColor(shape: TLShape): string | null {
  const v = (shape.meta as Record<string, unknown> | undefined)?.customColor;
  return typeof v === 'string' && HEX_RE.test(v) ? v : null;
}
