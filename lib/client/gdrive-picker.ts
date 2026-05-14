'use client';

import { env } from '@/lib/config/env';
import { loadPicker, type GooglePickerResponse } from './gapi-loader';

// D-018 Phase 8b: Google Picker SDK 띄우는 high-level wrapper.
// 호출 측: await showGdrivePicker({ accessToken, parentFolderId? }) → 선택된 파일들 받음.

export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
}

export interface ShowPickerOptions {
  accessToken: string;
  /** 시작 위치 폴더 ID. 없으면 root 부터. */
  parentFolderId?: string | null;
  /** 다중 선택 허용 여부. */
  multiselect?: boolean;
  /** 패널 제목. */
  title?: string;
}

export async function showGdrivePicker(
  opts: ShowPickerOptions,
): Promise<PickedFile[]> {
  if (!env.NEXT_PUBLIC_GOOGLE_API_KEY) {
    throw new Error('PICKER_NO_API_KEY: NEXT_PUBLIC_GOOGLE_API_KEY 미설정');
  }

  await loadPicker();
  const { google } = window;

  return new Promise<PickedFile[]>((resolve, reject) => {
    try {
      // 메인 view: 스토리 폴더 (parentFolderId) 시작 — 사용자가 우리가 만든 폴더 안의
      // 파일을 바로 보게 함. 폴더 navigation 도 가능 (위쪽 경로 클릭으로 상위 이동).
      const mainView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setMode('LIST');
      if (opts.parentFolderId) {
        mainView.setParent(opts.parentFolderId);
      }

      // 보조 view 1: 사용자 본인 Drive 전체 (root) — 다른 위치 파일도 첨부할 수 있게.
      const allDriveView = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setMode('LIST');

      // 보조 view 2: 업로드 — 파일 탐색기 안에서 새 파일 업로드.
      // Picker 자체엔 폴더 생성 기능이 없음 (Google SDK 제약). 폴더는 Drive 웹 사이트에서.
      // DocsUploadView 가 separate tab 으로 추가됨.
      const uploadView = new google.picker.DocsUploadView();

      const builder = new google.picker.PickerBuilder()
        .setOAuthToken(opts.accessToken)
        .setDeveloperKey(env.NEXT_PUBLIC_GOOGLE_API_KEY!)
        .setOrigin(window.location.origin)
        .addView(mainView)
        .addView(allDriveView)
        .addView(uploadView)
        .setTitle(opts.title ?? 'Google Drive 파일 선택');

      // drive.file scope 사용 시 필수: Cloud Project Number 를 Picker 에 전달해야
      // 선택한 파일에 우리 앱의 drive.file 권한이 부여됨. 없으면 후속 Drive API 호출이
      // 404 "File not found" 로 실패.
      if (env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER) {
        builder.setAppId(env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER);
      } else {
        console.warn(
          '[gdrive-picker] NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER 미설정 — ' +
            'drive.file scope 로 선택한 파일이 후속 API 호출에서 404 날 수 있어요.',
        );
      }

      if (opts.multiselect) {
        builder.enableFeature(google.picker.Feature.MULTISELECT_ENABLED ?? 'MULTISELECT_ENABLED');
      }

      const picker = builder
        .setCallback((data: GooglePickerResponse) => {
          const action = data.action;
          // Action enum: PICKED / CANCEL / LOADED
          if (action === google.picker.Action.PICKED || action === 'picked') {
            const docs = data.docs ?? [];
            const picked: PickedFile[] = docs.map((d) => ({
              id: d.id,
              name: d.name,
              mimeType: d.mimeType,
            }));
            picker.dispose();
            resolve(picked);
          } else if (action === google.picker.Action.CANCEL || action === 'cancel') {
            picker.dispose();
            resolve([]);
          }
        })
        .build();

      picker.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}
