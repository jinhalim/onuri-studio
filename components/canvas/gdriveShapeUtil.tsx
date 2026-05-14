// D-018 Phase 8a — tldraw 의 새 shape 타입 `gdrive-file`.
// 캔버스에 Drive 파일을 아이콘 + 파일명 카드로 표시. 클릭 시 StoryWorkspace 의
// split-screen iframe 패널 트리거 (실제 트리거는 selection 변화로 부모가 감지).
//
// shape.props:
//   - w/h: 카드 크기 (사용자가 리사이즈 가능, 80~400 범위 권장)
//   - fileId: Drive file ID (Phase 8b 에선 Picker 결과, PoC 에선 URL 추출)
//   - fileName: 표시용 파일명 (사용자가 더블클릭으로 직접 수정 가능 — Drive 원본 파일명과는 별개)
//   - mimeType: iframe URL 결정 + 아이콘 분기용
//   - imported: true 면 .onuri.json import 로 들어온 shape — 클릭 비활성
//   - embedUrl: PoC 단계에서 직접 저장. Phase 8b 이후엔 mimeType 으로 build.

import { useEffect, useRef, useState } from 'react';
import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useValue,
  type RecordProps,
  type TLBaseShape,
} from '@/lib/editor';
import { renameGdriveAttachment } from '@/lib/client/gdrive-attach-flow';

export type GDriveFileShape = TLBaseShape<
  'gdrive-file',
  {
    w: number;
    h: number;
    fileId: string;
    fileName: string;
    mimeType: string;
    imported: boolean;
    embedUrl: string;
  }
>;

const SHAPE_W = 140;
const SHAPE_H = 140;

// tldraw v5 의 `BaseBoxShapeUtil` 사용 — w/h 기반 box shape 의 geometry 가 자동 처리.
// constraint 가 built-in TLBaseBoxShape union 으로 strict 라 custom 'gdrive-file' 은
// 타입 체크에서 거부됨 → @ts-expect-error 로 우회 (런타임은 box 만 만족하면 동작).
// @ts-expect-error - custom type 'gdrive-file' 은 TLBaseBoxShape closed union 에 없음
export class GDriveFileShapeUtil extends BaseBoxShapeUtil<GDriveFileShape> {
  static override type = 'gdrive-file' as const;
  static override props: RecordProps<GDriveFileShape> = {
    w: T.number,
    h: T.number,
    fileId: T.string,
    fileName: T.string,
    mimeType: T.string,
    imported: T.boolean,
    embedUrl: T.string,
  };

  override getDefaultProps(): GDriveFileShape['props'] {
    return {
      w: SHAPE_W,
      h: SHAPE_H,
      fileId: '',
      fileName: 'Untitled',
      mimeType: 'application/octet-stream',
      imported: false,
      embedUrl: '',
    };
  }

  // tldraw v5 ShapeUtil 의 abstract method — undefined 반환 시 indicator() 가 fallback.
  // (정확한 path 가 필요하면 TLIndicatorPath branded type 으로 반환해야 하지만 PoC 엔 불필요.)
  override getIndicatorPath() {
    return undefined;
  }

  // 더블클릭으로 fileName 인라인 편집 활성. tldraw 가 editingShapeId 를 관리하고
  // component() 안에서 isEditing 분기로 input 렌더.
  override canEdit() {
    return true;
  }
  override canResize() {
    return true;
  }
  override hideRotateHandle() {
    return true;
  }

  override component(shape: GDriveFileShape) {
    return <GDriveCardBody shape={shape} />;
  }

  override indicator(shape: GDriveFileShape) {
    return (
      <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />
    );
  }
}

// Hook 사용을 위해 별도 함수형 컴포넌트로 분리.
// 더블클릭 → editingShapeId === shape.id 가 되면 input 렌더 + 자동 focus / select.
// Enter / blur 로 commit, Esc 로 cancel. fileName 은 표시 라벨만 변경 — Drive 원본 파일명은 그대로.
function GDriveCardBody({ shape }: { shape: GDriveFileShape }) {
  const editor = useEditor();
  const { fileName, mimeType, imported, w, h } = shape.props;

  const isEditing = useValue(
    'gdrive-shape-editing',
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  );

  const [draftName, setDraftName] = useState(fileName);
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 모드 진입 시 현재 fileName 로 draft 동기화 + 자동 focus / 전체 선택.
  useEffect(() => {
    if (!isEditing) return;
    setDraftName(fileName);
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [isEditing, fileName]);

  const commit = () => {
    const next = draftName.trim();
    if (next && next !== fileName) {
      editor.markHistoryStoppingPoint('gdrive-rename');
      // gdrive-file 은 tldraw 의 closed TLShape union 에 없어서 updateShapes 인자 타입에
      // 직접 안 맞음 — CustomStylePanel 의 customColor 갱신과 동일한 cast 패턴 사용.
      editor.updateShapes([
        {
          id: shape.id,
          type: shape.type,
          props: { ...shape.props, fileName: next },
        },
      ] as unknown as Parameters<typeof editor.updateShapes>[0]);

      // 캔버스 라벨 변경은 즉시 반영, Drive 원본 rename 은 background.
      // 권한 없으면 (다른 사용자가 viewer 만 가짐) graceful — 사용자는 로컬 라벨 변경은 그대로 봄.
      // imported shape 은 Drive 연동 안 됨 → skip.
      if (!shape.props.imported && shape.props.fileId) {
        void renameGdriveAttachment(shape.props.fileId, next).then((res) => {
          if (!res.ok) {
            console.warn('[gdrive-rename] Drive 원본 rename 스킵:', res.reason, res.message);
          }
        });
      }
    }
    editor.setEditingShape(null);
  };

  const cancel = () => {
    setDraftName(fileName);
    editor.setEditingShape(null);
  };

  // 카드 크기에 비례한 아이콘 / 폰트 스케일. 너무 작으면 안 보이고 너무 크면 우스워서 클램프.
  const minSide = Math.min(w, h);
  const iconSize = Math.max(20, Math.min(96, minSide * 0.3));
  const fontSize = Math.max(10, Math.min(18, minSide * 0.085));
  const gap = Math.max(4, minSide * 0.05);
  const padding = Math.max(6, minSide * 0.06);

  const icon = iconForMime(mimeType);
  const accent = accentForMime(mimeType);

  return (
    <HTMLContainer
      id={shape.id}
      style={{
        width: w,
        height: h,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap,
        padding,
        background: 'white',
        border: `2px solid ${accent}`,
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        pointerEvents: 'all',
        userSelect: 'none',
        color: '#1f1f2a',
        fontFamily: 'inherit',
      }}
    >
      <div
        aria-hidden
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: Math.max(4, iconSize * 0.2),
          background: accent,
          color: 'white',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: iconSize * 0.45,
          fontWeight: 700,
          letterSpacing: -0.5,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      {isEditing ? (
        <input
          ref={inputRef}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            // tldraw 가 Delete / arrow / cmd+Z 등을 가로채지 않게 stop.
            e.stopPropagation();
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          // 클릭이 캔버스로 전파돼서 드래그/deselect 되지 않게.
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="표시 이름"
          style={{
            width: '100%',
            border: '1px solid #DCDCE0',
            borderRadius: 4,
            padding: '2px 4px',
            fontSize,
            fontWeight: 600,
            textAlign: 'center',
            lineHeight: 1.2,
            color: '#1f1f2a',
            background: 'white',
            outline: 'none',
            userSelect: 'auto',
            pointerEvents: 'all',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          style={{
            fontSize,
            fontWeight: 600,
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.2,
            maxWidth: '100%',
            wordBreak: 'break-all',
          }}
          title={fileName + ' — 더블클릭해서 표시 이름 수정'}
        >
          {fileName}
        </div>
      )}
      {imported && (
        <span
          style={{
            fontSize: Math.max(8, fontSize * 0.8),
            color: '#9A9AA8',
            padding: '1px 4px',
            borderRadius: 3,
            border: '1px solid #DCDCE0',
          }}
          title="외부 import — Drive 연동 안 됨"
        >
          imported
        </span>
      )}
    </HTMLContainer>
  );
}

function iconForMime(mime: string): string {
  if (mime === 'application/vnd.google-apps.spreadsheet') return 'S';
  if (mime === 'application/vnd.google-apps.document') return 'D';
  if (mime === 'application/vnd.google-apps.presentation') return 'P';
  if (mime.startsWith('image/')) return '🖼';
  if (mime === 'application/pdf') return 'P';
  return 'F';
}

function accentForMime(mime: string): string {
  if (mime === 'application/vnd.google-apps.spreadsheet') return '#0F9D58'; // Sheets green
  if (mime === 'application/vnd.google-apps.document') return '#4285F4'; // Docs blue
  if (mime === 'application/vnd.google-apps.presentation') return '#F4B400'; // Slides yellow
  if (mime === 'application/pdf') return '#DB4437'; // PDF red
  if (mime.startsWith('image/')) return '#9A4FD1';
  return '#9A9AA8';
}
