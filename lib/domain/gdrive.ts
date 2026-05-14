// D-018 Phase 8b: Google Drive 연동 도메인 타입.

export interface GDriveWorkspace {
  /** Drive 안의 경로 (사람 가독성). 예: "/onuri-studio" */
  path: string;
  /** 그 경로가 가리키는 Drive 폴더 ID. 없으면 사용자가 아직 세팅 안 한 상태. */
  folderId: string | null;
}

export interface GDriveAttachment {
  id: string;
  storyId: string;
  /** 원본 Drive file ID (사용자 자기 Drive 의 원래 자리). */
  gdriveFileId: string;
  /** 우리 스토리 폴더에 만든 shortcut 의 file ID. */
  shortcutFileId: string;
  fileName: string;
  mimeType: string;
  /** 첨부한 사용자 (Google 연동 사용자 한정). */
  attachedBy: string | null;
  attachedAt: string;
}

/** 폴더명 컨벤션: "{name} [{id}]" — id 부분 정규식으로 다시 찾을 수 있게. */
export function gdriveFolderName(humanName: string, id: string): string {
  const safe = humanName.replace(/[\[\]]/g, '').trim() || '(이름 없음)';
  return `${safe} [${id}]`;
}

/** "{name} [{id}]" 에서 id 만 추출. 매칭 실패 시 null. */
export function parseGdriveFolderName(name: string): { humanName: string; id: string } | null {
  const m = name.match(/^(.*?)\s*\[([A-Za-z0-9_-]+)\]\s*$/);
  if (!m) return null;
  return { humanName: m[1]!.trim(), id: m[2]! };
}

/** 기본 workspace 경로. 사용자가 다른 값 지정 안 했을 때 사용. */
export const DEFAULT_WORKSPACE_PATH = '/onuri-studio';

/** path 가 유효한 형식인지 검사. 시작 슬래시 + 영문/숫자/공백/-_./한글 만 허용. */
export function isValidWorkspacePath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.length > 200) return false;
  // 위험 문자 거부 (XSS 측면 + Drive 경로 측면)
  if (/[<>"'\\]/.test(path)) return false;
  return true;
}
