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
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setIncludeFolders(true)
        .setMode('LIST');

      if (opts.parentFolderId) {
        view.setParent(opts.parentFolderId);
      }

      const builder = new google.picker.PickerBuilder()
        .setOAuthToken(opts.accessToken)
        .setDeveloperKey(env.NEXT_PUBLIC_GOOGLE_API_KEY!)
        .setOrigin(window.location.origin)
        .addView(view)
        .setTitle(opts.title ?? 'Google Drive 파일 선택');

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
