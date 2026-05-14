'use client';

import { env } from '@/lib/config/env';
import {
  initGapiClient,
  setGapiToken,
  type GapiDriveFile,
} from './gapi-loader';

// D-018 Phase 8b: Drive API client-side wrappers.
// 모든 호출은 사용자 access token (provider_token) 으로 인증.
// 에러 처리: 사용자한테 의미 있는 메시지 줄 수 있게 분류.

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

export type GDriveError =
  | 'storage-quota'
  | 'rate-limit'
  | 'unauthorized'
  | 'not-found'
  | 'unknown';

export class GDriveApiError extends Error {
  constructor(
    public code: GDriveError,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'GDriveApiError';
  }
}

function classifyError(err: unknown): GDriveError {
  const e = err as { status?: number; result?: { error?: { message?: string; errors?: Array<{ reason?: string }> } } };
  const status = e?.status;
  const reason = e?.result?.error?.errors?.[0]?.reason;
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not-found';
  if (reason === 'storageQuotaExceeded') return 'storage-quota';
  if (reason === 'userRateLimitExceeded' || reason === 'rateLimitExceeded' || status === 429) {
    return 'rate-limit';
  }
  return 'unknown';
}

async function ensureGapi(accessToken: string): Promise<void> {
  if (!env.NEXT_PUBLIC_GOOGLE_API_KEY) {
    throw new GDriveApiError('unauthorized', 'Google API Key 미설정 (NEXT_PUBLIC_GOOGLE_API_KEY)');
  }
  await initGapiClient(env.NEXT_PUBLIC_GOOGLE_API_KEY);
  setGapiToken(accessToken);
}

// ──────────────────────────────────────────────────────────────────────────────
// 폴더 관리
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 부모 폴더(parentId, root 면 'root') 안에서 name 으로 폴더 찾기.
 * 같은 이름이 여러 개면 첫 번째.
 */
export async function findFolderByName(
  accessToken: string,
  name: string,
  parentId: string = 'root',
): Promise<GapiDriveFile | null> {
  await ensureGapi(accessToken);
  try {
    const escaped = name.replace(/'/g, "\\'");
    const q = `'${parentId}' in parents and name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const res = await window.gapi.client.drive.files.list({
      q,
      fields: 'files(id, name, mimeType, parents)',
      pageSize: 10,
      spaces: 'drive',
    });
    return res.result.files?.[0] ?? null;
  } catch (err) {
    throw new GDriveApiError(classifyError(err), `폴더 검색 실패: ${name}`);
  }
}

/** 부모(parentId) 안에 새 폴더 생성. */
export async function createFolder(
  accessToken: string,
  name: string,
  parentId: string = 'root',
): Promise<GapiDriveFile> {
  await ensureGapi(accessToken);
  try {
    const res = await window.gapi.client.drive.files.create({
      resource: {
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId] as unknown as string[],
      },
      fields: 'id, name, mimeType, parents',
    });
    return res.result;
  } catch (err) {
    throw new GDriveApiError(classifyError(err), `폴더 생성 실패: ${name}`);
  }
}

/**
 * 폴더가 없으면 생성, 있으면 기존 것 반환 (idempotent).
 * Workspace / 채널 / 스토리 폴더 모두 본 함수로 처리.
 */
export async function ensureFolder(
  accessToken: string,
  name: string,
  parentId: string = 'root',
): Promise<GapiDriveFile> {
  const existing = await findFolderByName(accessToken, name, parentId);
  if (existing) return existing;
  return createFolder(accessToken, name, parentId);
}

/** 폴더 이름 변경 (folderId 로 찾아서 새 이름으로 업데이트). */
export async function renameFolder(
  accessToken: string,
  folderId: string,
  newName: string,
): Promise<GapiDriveFile> {
  await ensureGapi(accessToken);
  try {
    const res = await window.gapi.client.drive.files.update({
      fileId: folderId,
      resource: { name: newName },
      fields: 'id, name',
    });
    return res.result;
  } catch (err) {
    throw new GDriveApiError(classifyError(err), `폴더 이름 변경 실패: ${newName}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Shortcut + 권한
// ──────────────────────────────────────────────────────────────────────────────

/** parent 폴더 안에 target file 의 shortcut 생성. */
export async function createShortcut(
  accessToken: string,
  targetFileId: string,
  shortcutName: string,
  parentFolderId: string,
): Promise<GapiDriveFile> {
  await ensureGapi(accessToken);
  try {
    const res = await window.gapi.client.drive.files.create({
      resource: {
        name: shortcutName,
        mimeType: SHORTCUT_MIME,
        parents: [parentFolderId] as unknown as string[],
        shortcutDetails: { targetId: targetFileId },
      },
      fields: 'id, name, mimeType, parents',
    });
    return res.result;
  } catch (err) {
    throw new GDriveApiError(classifyError(err), 'Shortcut 생성 실패');
  }
}

/** 파일/폴더 삭제 (휴지통). */
export async function deleteFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  await ensureGapi(accessToken);
  try {
    await window.gapi.client.drive.files.delete({ fileId });
  } catch (err) {
    const code = classifyError(err);
    if (code === 'not-found') return; // 이미 삭제됨 — graceful
    throw new GDriveApiError(code, '파일 삭제 실패');
  }
}

/** 폴더에 "anyone with link" reader 권한 부여 (스토리 폴더용). */
export async function shareAnyoneWithLink(
  accessToken: string,
  fileId: string,
): Promise<void> {
  await ensureGapi(accessToken);
  try {
    await window.gapi.client.drive.permissions.create({
      fileId,
      resource: {
        role: 'reader',
        type: 'anyone',
        allowFileDiscovery: false,
      },
      fields: 'id',
    });
  } catch (err) {
    // 권한 이미 있으면 무시
    const code = classifyError(err);
    if (code === 'rate-limit') throw new GDriveApiError(code, '권한 부여 rate limit');
    // 그 외 (이미 share 됨 등) 는 graceful
    console.warn('[shareAnyoneWithLink] graceful:', err);
  }
}
