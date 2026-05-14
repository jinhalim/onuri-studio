// D-018 Phase 8a — Drive 공유 URL 에서 file id + mime type 추출.
// Google Drive / Sheets / Docs / Slides 공유 링크 형식 다양함:
//
//   https://docs.google.com/spreadsheets/d/{id}/edit?usp=sharing
//   https://docs.google.com/document/d/{id}/edit
//   https://docs.google.com/presentation/d/{id}/edit
//   https://drive.google.com/file/d/{id}/view?usp=sharing
//   https://drive.google.com/open?id={id}
//
// mime type 매핑 — iframe 임베드 URL 선택용:
//   spreadsheets → application/vnd.google-apps.spreadsheet → /edit (편집 가능)
//   document     → application/vnd.google-apps.document    → /edit
//   presentation → application/vnd.google-apps.presentation → /edit
//   drive/file/d → 알 수 없음 (mime 추정만)               → /preview (읽기)

export interface ParsedGdriveUrl {
  fileId: string;
  /** 'spreadsheet' | 'document' | 'presentation' | 'file' (preview 만 가능) */
  kind: 'spreadsheet' | 'document' | 'presentation' | 'file';
  /** Google MIME type 추정. drive/file 형식이면 unknown (사용자 별도 입력 또는 추정). */
  mimeType: string;
  /** iframe src — kind 별로 다름. */
  embedUrl: string;
}

const PATTERNS: Array<{
  re: RegExp;
  kind: ParsedGdriveUrl['kind'];
  mimeType: string;
  embed: (id: string) => string;
}> = [
  {
    re: /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    kind: 'spreadsheet',
    mimeType: 'application/vnd.google-apps.spreadsheet',
    embed: (id) => `https://docs.google.com/spreadsheets/d/${id}/edit?usp=sharing&rm=embedded`,
  },
  {
    re: /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
    kind: 'document',
    mimeType: 'application/vnd.google-apps.document',
    embed: (id) => `https://docs.google.com/document/d/${id}/edit?usp=sharing&rm=embedded`,
  },
  {
    re: /docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    kind: 'presentation',
    mimeType: 'application/vnd.google-apps.presentation',
    embed: (id) => `https://docs.google.com/presentation/d/${id}/edit?usp=sharing&rm=embedded`,
  },
  {
    re: /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    kind: 'file',
    mimeType: 'application/octet-stream',
    embed: (id) => `https://drive.google.com/file/d/${id}/preview`,
  },
  {
    re: /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    kind: 'file',
    mimeType: 'application/octet-stream',
    embed: (id) => `https://drive.google.com/file/d/${id}/preview`,
  },
];

export function parseGdriveUrl(url: string): ParsedGdriveUrl | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  for (const p of PATTERNS) {
    const m = trimmed.match(p.re);
    if (m && m[1]) {
      return {
        fileId: m[1],
        kind: p.kind,
        mimeType: p.mimeType,
        embedUrl: p.embed(m[1]),
      };
    }
  }
  return null;
}

/**
 * mime type 으로부터 embed URL 재계산.
 * viewOnly=true 면 항상 /preview (편집 UI 자체가 안 보임 — 읽기 모드 사용자용).
 *
 * 보안 측면:
 *   - Drive-level 권한 (anyone-with-link reader) 이 1차 방어선
 *   - viewOnly=true 인 UI 가 2차 방어선 (편집 UI 자체 차단)
 *   - 두 layer 모두 적용해서 깊이 방어 (defense in depth)
 */
export function buildGdriveEmbedUrl(
  fileId: string,
  mimeType: string,
  viewOnly = false,
): string {
  if (viewOnly) {
    // Sheets / Docs / Slides 의 /preview URL — read-only viewer.
    // Drive 의 일반 파일은 본래도 /preview.
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      return `https://docs.google.com/spreadsheets/d/${fileId}/preview`;
    }
    if (mimeType === 'application/vnd.google-apps.document') {
      return `https://docs.google.com/document/d/${fileId}/preview`;
    }
    if (mimeType === 'application/vnd.google-apps.presentation') {
      return `https://docs.google.com/presentation/d/${fileId}/preview`;
    }
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  // edit mode — owner / 권한자 한정. Drive 가 자체 권한 검증해서 실제 편집 가능 여부 결정.
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return `https://docs.google.com/spreadsheets/d/${fileId}/edit?usp=sharing&rm=embedded`;
  }
  if (mimeType === 'application/vnd.google-apps.document') {
    return `https://docs.google.com/document/d/${fileId}/edit?usp=sharing&rm=embedded`;
  }
  if (mimeType === 'application/vnd.google-apps.presentation') {
    return `https://docs.google.com/presentation/d/${fileId}/edit?usp=sharing&rm=embedded`;
  }
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

/** mime type 기반 표시용 라벨 (한글). */
export function labelForGdriveMime(mimeType: string): string {
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Sheets';
  if (mimeType === 'application/vnd.google-apps.document') return 'Docs';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Slides';
  if (mimeType.startsWith('image/')) return '이미지';
  if (mimeType === 'application/pdf') return 'PDF';
  return '파일';
}
