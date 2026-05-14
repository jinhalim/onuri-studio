'use client';

import {
  ensureFolder,
  createShortcut,
  shareAnyoneWithLink,
  GDriveApiError,
} from './gdrive-api';
import { showGdrivePicker, type PickedFile } from './gdrive-picker';
import { getDriveAccessToken } from './gdrive-token';
import { gdriveFolderName, type GDriveWorkspace } from '@/lib/domain/gdrive';
import { saveGdriveAttachmentAction } from '@/app/actions/save-gdrive-attachment';
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

    // 6) Picker
    const picked: PickedFile[] = await showGdrivePicker({
      accessToken,
      // 시작 위치를 workspace 로 둬도 되지만, 사용자가 본인 Drive 전체에서 찾는 경우 더 많음 → root.
      parentFolderId: null,
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
          return { ok: false, error: 'Drive 권한이 필요해요. 로그아웃 후 다시 Google 로 로그인해주세요.' };
        case 'not-found':
          return { ok: false, error: '폴더 또는 파일을 찾을 수 없어요. Drive 에서 직접 삭제되었나 확인해주세요.' };
        default:
          return { ok: false, error: err.message };
      }
    }
    console.error('[runDriveAttachFlow] 알 수 없는 에러:', err);
    return { ok: false, error: '알 수 없는 오류가 발생했어요.' };
  }
}
