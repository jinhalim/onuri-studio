import type { Editor } from 'tldraw';
import type { OnuriFile } from '@/lib/domain/onuri-file';

// 현재 페이지의 도형을 PNG/SVG/.onuri.json 파일로 내보내기.
// tldraw v5 의 editor.toImage / getSvgString 활용.
//
// 빈 캔버스(도형 0개)면 'empty' 반환 — 호출 측이 안내 메시지 표시.

export interface ExportResult {
  ok: boolean;
  reason?: 'empty' | 'failed';
  error?: unknown;
}

export async function exportAsPng(
  editor: Editor,
  fileName: string,
): Promise<ExportResult> {
  const shapeIds = editor.getCurrentPageShapeIds();
  if (shapeIds.size === 0) return { ok: false, reason: 'empty' };

  try {
    const result = await editor.toImage([...shapeIds], {
      format: 'png',
      background: true, // 흰 배경 포함 (투명 PNG 가 아닌 실용적인 이미지)
      padding: 32,
      scale: 2, // 고해상도
    });
    triggerDownload(result.blob, sanitizeFileName(fileName) + '.png');
    return { ok: true };
  } catch (err) {
    console.error('[exportAsPng] 실패:', err);
    return { ok: false, reason: 'failed', error: err };
  }
}

export async function exportAsSvg(
  editor: Editor,
  fileName: string,
): Promise<ExportResult> {
  const shapeIds = editor.getCurrentPageShapeIds();
  if (shapeIds.size === 0) return { ok: false, reason: 'empty' };

  try {
    const result = await editor.getSvgString([...shapeIds], {
      background: true,
      padding: 32,
    });
    if (!result) return { ok: false, reason: 'failed' };
    const blob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' });
    triggerDownload(blob, sanitizeFileName(fileName) + '.svg');
    return { ok: true };
  } catch (err) {
    console.error('[exportAsSvg] 실패:', err);
    return { ok: false, reason: 'failed', error: err };
  }
}

// .onuri.json 네이티브 포맷 내보내기.
// 도형이 비어 있어도 export 가능 (빈 보드 + 메타데이터). PNG/SVG 와 정책 차이.
//
// yDocBase64: tldraw editor snapshot JSON 을 UTF-8 → base64 인코딩.
// (schema v1 의 yDocBase64 의 의미를 "스토리 상태 binary/text 의 base64" 로 일반화 —
// 향후 Yjs Y.Doc binary 가 들어가도 동일 필드 사용 가능, schema 유지)
export function exportAsOnuriJson(
  editor: Editor,
  storyTitle: string,
  storyId: string | undefined,
  exporterNickname: string,
  appVersion: string,
): ExportResult {
  try {
    const snapshot = editor.getSnapshot();
    const json = JSON.stringify(snapshot);
    const yDocBase64 = utf8ToBase64(json);
    const file: OnuriFile = {
      $schema: 'https://onuri.studio/schema/onuri-file/v1',
      version: 1,
      meta: {
        exportedAt: new Date().toISOString(),
        exportedBy: { nickname: exporterNickname },
        appVersion,
      },
      story: {
        id: storyId,
        title: storyTitle,
        yDocBase64,
      },
    };
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    triggerDownload(blob, sanitizeFileName(storyTitle) + '.onuri.json');
    return { ok: true };
  } catch (err) {
    console.error('[exportAsOnuriJson] 실패:', err);
    return { ok: false, reason: 'failed', error: err };
  }
}

// UTF-8 문자열을 base64 로 (btoa 는 Latin1 만 받으므로 인코딩 단계 필요)
function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // revoke 는 다음 microtask 에서 (a.click 후 브라우저가 url 을 fetch 할 시간 확보)
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// 파일명에 사용 불가한 문자 제거 + 길이 제한.
function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : 'untitled';
}
