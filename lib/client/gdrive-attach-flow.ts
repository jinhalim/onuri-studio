'use client';

import {
  ensureFolder,
  createShortcut,
  deleteFile,
  shareAnyoneWithLink,
  renameDriveFile,
  getDriveFileName,
  debugTokenScopes,
  GDriveApiError,
} from './gdrive-api';
import { showGdrivePicker, type PickedFile } from './gdrive-picker';
import { getDriveAccessToken } from './gdrive-token';
import { gdriveFolderName, type GDriveWorkspace } from '@/lib/domain/gdrive';
import { saveGdriveAttachmentAction } from '@/app/actions/save-gdrive-attachment';
import { saveGdriveFoldersAction } from '@/app/actions/save-gdrive-folders';
import { deleteGdriveAttachmentAction } from '@/app/actions/delete-gdrive-attachment';
import { buildGdriveEmbedUrl } from '@/lib/usecases/parse-gdrive-url';

// D-018 Phase 8b: Drive 첨부 high-level flow.
// 단계:
//   1) access token 확보 (Supabase session.provider_token)
//   2) workspace 폴더 ensure (사용자 마이페이지에 등록한 path 기반)
//   3) channel 폴더 ensure (workspace 안에 {채널 [id]}/)
//   4) story 폴더 ensure (channel 안에 {스토리 [id]}/)
//   5) story 폴더에 anyone-with-link viewer share
//   6) Picker 띄움 (사용자 선택)
//   7) 선택된 각 파일에 대해 story 폴더에 shortcut 생성
//   8) server action 으로 DB 저장 + folder ID 들 캐싱
//   9) 호출 측에 결과 메타 반환 (tldraw shape 생성용)

export interface AttachContext {
  workspace: GDriveWorkspace;
  channelId: string;
  channelName: string;
  storyId: string;
  storyTitle: string;
}

export interface AttachedFileResult {
  /** 원본 file ID. */
  gdriveFileId: string;
  /** 우리 폴더 안 shortcut ID. */
  shortcutFileId: string;
  fileName: string;
  mimeType: string;
  /** iframe 임베드용 URL. */
  embedUrl: string;
  /** Drive 안 폴더 ID 들 (DB 캐싱 용 — 다음 첨부 시 빠른 경로). */
  workspaceFolderId: string;
  channelFolderId: string;
  storyFolderId: string;
}

export interface AttachFlowResult {
  ok: boolean;
  files?: AttachedFileResult[];
  error?: string;
}

// path "/onuri-studio" / "/work/onuri" 등을 segment 배열로 변환. 빈 segment 제거.
function pathSegments(path: string): string[] {
  return path.split('/').map((s) => s.trim()).filter((s) => s.length > 0);
}

// ──────────────────────────────────────────────────────────────────────────────
// Folder-only ensure — Picker 없이 폴더 구조만 만들고 ID 들 반환.
// "Drive 폴더 열기" 같은 흐름에서 사용.
// ──────────────────────────────────────────────────────────────────────────────

export interface EnsureFoldersResult {
  ok: boolean;
  error?: string;
  workspaceFolderId?: string;
  channelFolderId?: string;
  storyFolderId?: string;
}

export async function ensureGdriveFoldersOnly(
  ctx: AttachContext,
): Promise<EnsureFoldersResult> {
  const tokenRes = await getDriveAccessToken();
  if (!tokenRes.ok || !tokenRes.accessToken) {
    return { ok: false, error: tokenRes.errorMessage ?? 'Drive 권한을 얻을 수 없어요.' };
  }
  const accessToken = tokenRes.accessToken;
  void debugTokenScopes(accessToken);

  try {
    // workspace
    let parentId = 'root';
    let workspaceFolderId = ctx.workspace.folderId;
    if (workspaceFolderId) {
      parentId = workspaceFolderId;
    } else {
      const segments = pathSegments(ctx.workspace.path);
      for (const seg of segments) {
        const folder = await ensureFolder(accessToken, seg, parentId);
        parentId = folder.id;
      }
      workspaceFolderId = parentId;
    }

    // channel
    const channelFolderName = gdriveFolderName(ctx.channelName, ctx.channelId);
    const channelFolder = await ensureFolder(accessToken, channelFolderName, workspaceFolderId);

    // story
    const storyFolderName = gdriveFolderName(ctx.storyTitle, ctx.storyId);
    const storyFolder = await ensureFolder(accessToken, storyFolderName, channelFolder.id);

    // share story folder (graceful — 실패해도 흐름 계속)
    await shareAnyoneWithLink(accessToken, storyFolder.id);

    // DB 에 폴더 ID 들 캐싱 (fire-and-forget — 실패해도 사용자 흐름 막지 않음)
    void saveGdriveFoldersAction({
      storyId: ctx.storyId,
      channelId: ctx.channelId,
      workspaceFolderId,
      channelFolderId: channelFolder.id,
      storyFolderId: storyFolder.id,
    });

    return {
      ok: true,
      workspaceFolderId,
      channelFolderId: channelFolder.id,
      storyFolderId: storyFolder.id,
    };
  } catch (err) {
    if (err instanceof GDriveApiError) {
      switch (err.code) {
        case 'unauthorized':
          return { ok: false, error: 'Drive 권한이 부족해요. 다시 Google 로그인 필요.' };
        case 'not-found':
          return { ok: false, error: '폴더를 찾을 수 없어요. Drive 에서 직접 삭제됐을 가능성.' };
        default:
          return { ok: false, error: err.message };
      }
    }
    return { ok: false, error: '알 수 없는 오류가 발생했어요.' };
  }
}

export async function runDriveAttachFlow(
  ctx: AttachContext,
): Promise<AttachFlowResult> {
  // 1) access token
  const tokenRes = await getDriveAccessToken();
  if (!tokenRes.ok || !tokenRes.accessToken) {
    return {
      ok: false,
      error:
        tokenRes.errorMessage ??
        'Drive 권한을 얻을 수 없어요. 로그아웃 후 다시 Google 로 로그인해주세요.',
    };
  }
  const accessToken = tokenRes.accessToken;

  // 1a) [디버깅] 현재 토큰의 scope 확인 — drive.file 없으면 403/404 의 주범.
  // fire-and-forget — 검증 결과는 console 에만, 사용자 흐름은 막지 않음.
  void debugTokenScopes(accessToken);

  try {
    // 2) workspace 폴더 ensure (path segment 순회).
    //    예: "/onuri-studio" → root 에 "onuri-studio" 폴더 ensure.
    //    "/work/onuri" → root → "work" → "onuri" 단계별 ensure.
    let parentId = 'root';
    let workspaceFolderId = ctx.workspace.folderId;
    if (workspaceFolderId) {
      // 이미 DB 에 캐싱된 ID 있으면 검증 없이 사용 (Phase 8b PoC — 정확성보다 속도)
      parentId = workspaceFolderId;
    } else {
      const segments = pathSegments(ctx.workspace.path);
      for (const seg of segments) {
        const folder = await ensureFolder(accessToken, seg, parentId);
        parentId = folder.id;
      }
      workspaceFolderId = parentId;
    }

    // 3) channel 폴더
    const channelFolderName = gdriveFolderName(ctx.channelName, ctx.channelId);
    const channelFolder = await ensureFolder(accessToken, channelFolderName, workspaceFolderId);

    // 4) story 폴더
    const storyFolderName = gdriveFolderName(ctx.storyTitle, ctx.storyId);
    const storyFolder = await ensureFolder(accessToken, storyFolderName, channelFolder.id);

    // 5) story 폴더에 anyone-with-link viewer share (idempotent)
    await shareAnyoneWithLink(accessToken, storyFolder.id);

    // 6) Picker — 시작 위치를 스토리 폴더로. 사용자가 다른 위치 파일도 첨부할 수 있게
    // "All Drive" 탭이 함께 추가됨 (showGdrivePicker 내부에서).
    const picked: PickedFile[] = await showGdrivePicker({
      accessToken,
      parentFolderId: storyFolder.id,
      multiselect: true,
      title: `${ctx.storyTitle} — Drive 파일 첨부`,
    });
    if (picked.length === 0) {
      return { ok: true, files: [] }; // 사용자가 cancel
    }

    // 7) 각 파일에 shortcut + 8) DB 저장
    const results: AttachedFileResult[] = [];
    for (const file of picked) {
      const shortcut = await createShortcut(accessToken, file.id, file.name, storyFolder.id);

      const saveRes = await saveGdriveAttachmentAction({
        storyId: ctx.storyId,
        channelId: ctx.channelId,
        storyFolderId: storyFolder.id,
        channelFolderId: channelFolder.id,
        workspaceFolderId,
        gdriveFileId: file.id,
        shortcutFileId: shortcut.id,
        fileName: file.name,
        mimeType: file.mimeType,
      });
      if (!saveRes.ok) {
        return { ok: false, error: saveRes.error };
      }

      results.push({
        gdriveFileId: file.id,
        shortcutFileId: shortcut.id,
        fileName: file.name,
        mimeType: file.mimeType,
        embedUrl: buildGdriveEmbedUrl(file.id, file.mimeType),
        workspaceFolderId,
        channelFolderId: channelFolder.id,
        storyFolderId: storyFolder.id,
      });
    }

    return { ok: true, files: results };
  } catch (err) {
    if (err instanceof GDriveApiError) {
      switch (err.code) {
        case 'storage-quota':
          return { ok: false, error: 'Google Drive 용량이 부족해요. Drive 정리 후 다시 시도해주세요.' };
        case 'rate-limit':
          return { ok: false, error: 'Drive 요청이 너무 잦아요. 잠시 후 다시 시도해주세요.' };
        case 'unauthorized':
          return {
            ok: false,
            error:
              'Drive 권한이 부족해요 (403). 다음 중 하나를 시도해주세요:\n' +
              '1) "나가기" 후 다시 Google 로 로그인 (drive.file 권한 동의 화면 확인)\n' +
              '2) https://myaccount.google.com/permissions 에서 본 앱 권한 확인',
          };
        case 'not-found':
          return {
            ok: false,
            error:
              '폴더 또는 파일을 찾을 수 없어요 (404). 가능 원인:\n' +
              '1) Drive 에서 직접 폴더 삭제됨\n' +
              '2) drive.file scope 미부여 (선택한 파일에 접근 권한 없음)\n' +
              '브라우저 console 의 [Drive ...] 로그로 정확한 호출 확인 가능.',
          };
        default:
          return { ok: false, error: err.message };
      }
    }
    console.error('[runDriveAttachFlow] 알 수 없는 에러:', err);
    return { ok: false, error: '알 수 없는 오류가 발생했어요.' };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Cleanup — shape 삭제 시 호출
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Drive 첨부 삭제 — DB row + Drive shortcut.
 * 1) server action 이 DB 삭제하고 shortcut_file_id 반환.
 * 2) client 가 그 shortcut 을 Drive 에서 삭제 (휴지통).
 *
 * Drive API 호출 실패는 best-effort — DB 는 이미 삭제됨.
 * (사용자 Drive 의 shortcut 이 orphan 으로 남아도 사용자가 직접 정리 가능)
 */
// ──────────────────────────────────────────────────────────────────────────────
// Rename / refresh — 캔버스 ↔ Drive 양방향 이름 동기화
// ──────────────────────────────────────────────────────────────────────────────

export type GdriveSyncResult =
  | { ok: true; name: string }
  | { ok: false; reason: 'no-token' | 'unauthorized' | 'not-found' | 'unknown'; message: string };

/**
 * 캔버스에서 사용자가 이름 바꾸면 Drive 원본도 같이 rename.
 * 권한 없을 시 (다른 사용자, viewer 만 받음) graceful — 캔버스 라벨만 변경되고 호출자는 결과로
 * 안내 메시지 표시 가능.
 */
export async function renameGdriveAttachment(
  fileId: string,
  newName: string,
): Promise<GdriveSyncResult> {
  const tokenRes = await getDriveAccessToken();
  if (!tokenRes.ok || !tokenRes.accessToken) {
    return { ok: false, reason: 'no-token', message: tokenRes.errorMessage ?? 'Drive 권한 없음' };
  }
  try {
    const updated = await renameDriveFile(tokenRes.accessToken, fileId, newName);
    return { ok: true, name: updated.name };
  } catch (err) {
    if (err instanceof GDriveApiError) {
      if (err.code === 'unauthorized') {
        return {
          ok: false,
          reason: 'unauthorized',
          message: 'Drive 파일 편집 권한이 없어요 — 캔버스 라벨만 변경됐어요.',
        };
      }
      if (err.code === 'not-found') {
        return {
          ok: false,
          reason: 'not-found',
          message: 'Drive 에서 파일을 찾을 수 없어요 (삭제됐을 가능성).',
        };
      }
      return { ok: false, reason: 'unknown', message: err.message };
    }
    return { ok: false, reason: 'unknown', message: '알 수 없는 오류' };
  }
}

/** iframe 안에서 사용자가 바꾼 Drive 파일 이름을 가져와 캔버스에 반영하려는 호출자용. */
export async function refreshGdriveFileName(
  fileId: string,
): Promise<GdriveSyncResult> {
  const tokenRes = await getDriveAccessToken();
  if (!tokenRes.ok || !tokenRes.accessToken) {
    return { ok: false, reason: 'no-token', message: tokenRes.errorMessage ?? 'Drive 권한 없음' };
  }
  try {
    const name = await getDriveFileName(tokenRes.accessToken, fileId);
    return { ok: true, name };
  } catch (err) {
    if (err instanceof GDriveApiError) {
      if (err.code === 'unauthorized') {
        return { ok: false, reason: 'unauthorized', message: 'Drive 파일 조회 권한 없음.' };
      }
      if (err.code === 'not-found') {
        return { ok: false, reason: 'not-found', message: '파일을 찾을 수 없어요.' };
      }
      return { ok: false, reason: 'unknown', message: err.message };
    }
    return { ok: false, reason: 'unknown', message: '알 수 없는 오류' };
  }
}

export async function cleanupGdriveAttachment(input: {
  storyId: string;
  gdriveFileId: string;
}): Promise<void> {
  try {
    const res = await deleteGdriveAttachmentAction(input);
    if (!res.ok) {
      console.warn('[cleanupGdriveAttachment] DB 삭제 실패:', res.error);
      return;
    }
    if (!res.shortcutFileId) return;

    const tokenRes = await getDriveAccessToken();
    if (!tokenRes.ok || !tokenRes.accessToken) {
      console.warn(
        '[cleanupGdriveAttachment] access token 없음 — shortcut orphan 남음',
      );
      return;
    }
    await deleteFile(tokenRes.accessToken, res.shortcutFileId);
  } catch (err) {
    console.error('[cleanupGdriveAttachment] 에러:', err);
  }
}
