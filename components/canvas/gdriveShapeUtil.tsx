// D-018 Phase 8a — tldraw 의 새 shape 타입 `gdrive-file`.
// 캔버스에 Drive 파일을 아이콘 + 파일명 카드로 표시. 클릭 시 StoryWorkspace 의
// split-screen iframe 패널 트리거 (실제 트리거는 selection 변화로 부모가 감지).
//
// shape.props:
//   - w/h: 카드 크기 (고정 권장)
//   - fileId: Drive file ID (Phase 8b 에선 Picker 결과, PoC 에선 URL 추출)
//   - fileName: 표시용 파일명
//   - mimeType: iframe URL 결정 + 아이콘 분기용
//   - imported: true 면 .onuri.json import 로 들어온 shape — 클릭 비활성
//   - embedUrl: PoC 단계에서 직접 저장. Phase 8b 이후엔 mimeType 으로 build.

import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  type RecordProps,
  type TLBaseShape,
} from '@/lib/editor';

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

  override canEdit() {
    return false;
  }
  override canResize() {
    return false;
  }
  override hideRotateHandle() {
    return true;
  }

  override component(shape: GDriveFileShape) {
    const { fileName, mimeType, imported } = shape.props;
    const icon = iconForMime(mimeType);
    const accent = accentForMime(mimeType);

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: shape.props.w,
          height: shape.props.h,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: 8,
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
            width: 40,
            height: 40,
            borderRadius: 8,
            background: accent,
            color: 'white',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: -0.5,
          }}
        >
          {icon}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.2,
            maxWidth: '100%',
          }}
          title={fileName}
        >
          {fileName}
        </div>
        {imported && (
          <span
            style={{
              fontSize: 9,
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

  override indicator(shape: GDriveFileShape) {
    return (
      <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />
    );
  }
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
