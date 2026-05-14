'use client';

// D-018 Phase 8b: Google APIs JS Client (gapi) + Picker SDK loader.
// 한 번 로드 후 캐시. 여러 컴포넌트에서 동시 호출해도 단일 promise 반환.

// gapi / google.picker 의 타입은 @types/gapi / @types/google.picker 가 있긴 하지만
// PoC 단계엔 사용 표면 좁아서 직접 minimal 선언.

declare global {
  interface Window {
    gapi: GapiGlobal;
    google: GoogleGlobal;
  }
}

export interface GapiGlobal {
  load: (api: string, callback: () => void) => void;
  client: GapiClient;
}

export interface GapiClient {
  init: (params: {
    apiKey?: string;
    discoveryDocs?: string[];
  }) => Promise<void>;
  setToken: (token: { access_token: string } | null) => void;
  drive: GapiDriveApi;
  request: (params: {
    path: string;
    method?: string;
    params?: Record<string, unknown>;
    body?: unknown;
  }) => Promise<GapiResponse<unknown>>;
}

export interface GapiResponse<T> {
  result: T;
  status: number;
}

export interface GapiDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  parents?: string[];
}

export interface GapiDriveApi {
  files: {
    create: (params: {
      resource: Partial<GapiDriveFile> & { shortcutDetails?: { targetId: string } };
      fields?: string;
    }) => Promise<GapiResponse<GapiDriveFile>>;
    list: (params: {
      q?: string;
      fields?: string;
      pageSize?: number;
      spaces?: string;
    }) => Promise<GapiResponse<{ files: GapiDriveFile[] }>>;
    update: (params: {
      fileId: string;
      resource: Partial<GapiDriveFile>;
      addParents?: string;
      removeParents?: string;
      fields?: string;
    }) => Promise<GapiResponse<GapiDriveFile>>;
    get: (params: {
      fileId: string;
      fields?: string;
    }) => Promise<GapiResponse<GapiDriveFile>>;
    delete: (params: { fileId: string }) => Promise<GapiResponse<unknown>>;
  };
  permissions: {
    create: (params: {
      fileId: string;
      resource: {
        role: 'reader' | 'writer' | 'commenter';
        type: 'user' | 'group' | 'domain' | 'anyone';
        allowFileDiscovery?: boolean;
      };
      fields?: string;
    }) => Promise<GapiResponse<unknown>>;
  };
}

export interface GoogleGlobal {
  picker: {
    PickerBuilder: new () => GooglePickerBuilder;
    DocsView: new (viewId?: string) => GoogleDocsView;
    DocsUploadView: new () => GoogleDocsUploadView;
    ViewId: Record<string, string>;
    Action: Record<string, string>;
    Response: Record<string, string>;
    Document: Record<string, string>;
    Feature: Record<string, string>;
  };
}

// 업로드 view — 별도 탭으로 추가. 옵션 chain 메서드는 우리 use case 에선 필요 없음.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GoogleDocsUploadView {}

export interface GoogleDocsView {
  setIncludeFolders: (b: boolean) => GoogleDocsView;
  setMimeTypes: (mimes: string) => GoogleDocsView;
  setParent: (folderId: string) => GoogleDocsView;
  setMode: (mode: string) => GoogleDocsView;
  setSelectFolderEnabled: (b: boolean) => GoogleDocsView;
}

export interface GooglePickerBuilder {
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setAppId: (id: string) => GooglePickerBuilder;
  addView: (view: GoogleDocsView | GoogleDocsUploadView) => GooglePickerBuilder;
  setCallback: (cb: (data: GooglePickerResponse) => void) => GooglePickerBuilder;
  setOrigin: (origin: string) => GooglePickerBuilder;
  enableFeature: (feature: string) => GooglePickerBuilder;
  setTitle: (title: string) => GooglePickerBuilder;
  build: () => GooglePicker;
}

export interface GooglePicker {
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export interface GooglePickerResponse {
  action: string;
  docs?: Array<{
    id: string;
    name: string;
    mimeType: string;
    url?: string;
    sizeBytes?: number;
    parentId?: string;
  }>;
}

// ──────────────────────────────────────────────────────────────────────────────

let gapiLoadPromise: Promise<GapiGlobal> | null = null;
let pickerLoadPromise: Promise<void> | null = null;
let gapiClientInitPromise: Promise<void> | null = null;

const GAPI_SCRIPT_URL = 'https://apis.google.com/js/api.js';
const DRIVE_DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

/** gapi 글로벌 스크립트 로드 (singleton). */
export function loadGapi(): Promise<GapiGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('GAPI_SSR_UNSUPPORTED'));
  }
  if (window.gapi) return Promise.resolve(window.gapi);
  if (gapiLoadPromise) return gapiLoadPromise;

  gapiLoadPromise = new Promise<GapiGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GAPI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.gapi) resolve(window.gapi);
      else reject(new Error('GAPI_LOAD_OK_BUT_UNDEFINED'));
    };
    script.onerror = () => reject(new Error('GAPI_SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  });
  return gapiLoadPromise;
}

/** Picker module 로드 (gapi.load('picker', ...)). */
export function loadPicker(): Promise<void> {
  if (pickerLoadPromise) return pickerLoadPromise;
  pickerLoadPromise = loadGapi().then(
    (gapi) =>
      new Promise<void>((resolve) => {
        gapi.load('picker', () => resolve());
      }),
  );
  return pickerLoadPromise;
}

/** gapi.client (REST API client) 초기화. apiKey + Drive discovery doc. */
export function initGapiClient(apiKey: string): Promise<void> {
  if (gapiClientInitPromise) return gapiClientInitPromise;
  gapiClientInitPromise = loadGapi().then(
    (gapi) =>
      new Promise<void>((resolve, reject) => {
        gapi.load('client', async () => {
          try {
            await gapi.client.init({
              apiKey,
              discoveryDocs: [DRIVE_DISCOVERY],
            });
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      }),
  );
  return gapiClientInitPromise;
}

/** Drive 호출 직전 OAuth 토큰 세팅. 매 호출마다 갱신 가능. */
export function setGapiToken(accessToken: string): void {
  if (!window.gapi?.client) return;
  window.gapi.client.setToken({ access_token: accessToken });
}
