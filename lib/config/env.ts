import { z } from 'zod';

// 환경변수 스키마.
// MVP 정책: Phase 1~6 동안 이메일/SSO/Workspace 변수는 모두 optional.
// 부재 시 emailProvider/googleProvider의 isEnabled()가 false 반환.

const schema = z.object({
  // ─── 도메인 (Phase 1 필수) ───
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Onuri Studio'),

  // ─── Supabase (Phase 1 필수, 단 dev에서 미설정도 허용) ───
  // dev 모드에서 미설정이면 setup banner 표시. prod에서는 강제 검증 (next.config).
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // ─── Yjs Realtime (Phase 4) ───
  NEXT_PUBLIC_YJS_WS_URL: z.string().optional(),

  // ─── 보안 (Phase 6) ───
  RATE_LIMIT_REDIS_URL: z.string().optional(),

  // ─── SSO (Phase 7+) ───
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  // ─── Google Workspace (Phase 8+) ───
  GOOGLE_WORKSPACE_SCOPES: z.string().optional(),
  INTEGRATION_TOKEN_ENCRYPTION_KEY: z.string().optional(),

  // ─── 이메일 매직 링크 (Phase 9) ───
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
});

// .env 의 빈 값(EMAIL_FROM= 처럼 = 뒤 빈 문자열)은
// process.env에서 ""로 들어오는데, zod 의 .optional() 은 undefined만 허용한다.
// 따라서 ""를 undefined로 정규화한 뒤 스키마에 통과시킨다.
function emptyToUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === '' ? undefined : v;
  }
  return out as T;
}

export const env = schema.parse(
  emptyToUndefined({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_YJS_WS_URL: process.env.NEXT_PUBLIC_YJS_WS_URL,
    RATE_LIMIT_REDIS_URL: process.env.RATE_LIMIT_REDIS_URL,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_WORKSPACE_SCOPES: process.env.GOOGLE_WORKSPACE_SCOPES,
    INTEGRATION_TOKEN_ENCRYPTION_KEY: process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
  }),
);

// Supabase가 설정되었는지 빠른 체크. 미설정 시 UI에 setup banner 노출.
export function isSupabaseConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
