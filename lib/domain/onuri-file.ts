import { z } from 'zod';
import type { ExternalLinks } from './story';

// .onuri.json 네이티브 익스포트 포맷 v1.
// Phase 5에서 export/import 본격 구현. 본 파일은 Phase 1부터 인터페이스만 확정.
// 향후 외부 임베드 메타도 담을 수 있게 확장 가능하게 설계 (Claude.md §12-8).

export interface OnuriFile {
  $schema: 'https://onuri.studio/schema/onuri-file/v1';
  version: 1;
  meta: {
    exportedAt: string;
    exportedBy: { nickname: string };
    appVersion: string;
  };
  story: {
    id?: string; // 가져오기 시 무시
    title: string;
    yDocBase64: string;
    thumbnailDataUri?: string;
  };
  external?: ExternalLinks;
}

// 파일 임포트 시 입력 검증용 zod 스키마
export const onuriFileSchema = z.object({
  $schema: z.literal('https://onuri.studio/schema/onuri-file/v1'),
  version: z.literal(1),
  meta: z.object({
    exportedAt: z.string(),
    exportedBy: z.object({ nickname: z.string() }),
    appVersion: z.string(),
  }),
  story: z.object({
    id: z.string().optional(),
    title: z.string().min(1).max(200),
    yDocBase64: z.string(),
    thumbnailDataUri: z.string().optional(),
  }),
  external: z
    .object({
      googleSheets: z
        .array(z.object({ url: z.string().url(), embedded: z.boolean() }))
        .optional(),
      googleSlides: z
        .array(z.object({ url: z.string().url(), embedded: z.boolean() }))
        .optional(),
    })
    .optional(),
});
