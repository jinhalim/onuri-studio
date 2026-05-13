# Onuri Studio — 설계서 (Design Document)

> 본 문서는 [`Claude.md`](Claude.md)의 프로덕트 프롬프트를 구현 가능한 형태로 풀어낸 기술 설계서입니다.
> Phase 1 ~ Phase 9 전 구간을 커버하지만, **활성 개발 범위는 Phase 1 ~ Phase 6 (MVP)** 입니다.
> Phase 7 이후 항목은 "확장 포인트"로만 표시하고 코드 레벨 hook 위치를 명시합니다.

---

## 0. 문서 메타

| 항목 | 값 |
| --- | --- |
| 제품명 | Onuri Studio (온누리 스튜디오) |
| 패키지명 | `onuri-studio` |
| 버전 | 0.1.0 (MVP 기준) |
| 작성일 | 2026-05-08 |
| 기준 브랜치 | `main` |
| 원본 프롬프트 | [`Claude.md`](Claude.md) |
| 라이선스 | MIT |

---

## 1. 시스템 개요

### 1.1 한 줄 정의

> **URL 한 줄로 입장하는 실시간 협업 화이트보드.**
> 채널(Channel) → 스토리(Story) 구조에서 다중 사용자가 Yjs CRDT 기반으로 동시 편집한다.

### 1.2 사용자 페르소나

| 페르소나 | 트랙 | 주요 시나리오 |
| --- | --- | --- |
| **즉시 참여형 게스트** | Anonymous | 닉네임만 입력 → URL 받은 채널 입장 → 의견 메모 (**MVP 유일 트랙**) |
| **운영형 회원** | Email Magic Link | 채널 생성/관리, 마이페이지에서 히스토리 추적 (**Phase 9에서 활성화**) |
| **관리자** | Email + role=admin | 사용자 통계, 채널/스토리 검색, 시스템 헬스체크 (**Phase 9 이후**) |
| **(Phase 7+) SSO 사용자** | Google/GitHub/Microsoft/Apple | 회원 트랙과 동일 기능, 가입 마찰 감소 |

### 1.3 핵심 가치 제안

- **0초 온보딩**: 닉네임만으로 입장 가능한 익명 트랙. (MVP의 **유일** 인증 트랙)
- **무손실 영속화**: 회원 전환 시 익명 세션 자산이 유실 없이 이전. *(Phase 9 이메일 인증 활성화 후)*
- **이식 가능한 도메인**: `.env` 한 줄 변경으로 `localhost` → `*.vercel.app` → 커스텀 도메인 전환.
- **공급자 추상화**: 인증/외부 통합을 Provider 레이어로 격리, MVP 이후 Email/SSO/Google Workspace 확장 시 코어 변경 최소화.

> **⚠ MVP 인증 정책**: 이메일 매직 링크는 도메인 구매와 묶어 **Phase 9에서 일괄 활성화**한다. 이유는 ①발신 도메인 인증(DKIM/SPF)이 커스텀 도메인을 전제로 하고, ②MVP 검증 단계에서 이메일 발송 한도/도메인 평판 리스크를 회피하기 위함. Phase 1~6 동안은 모든 사용자가 **익명 트랙**으로만 진입한다.

---

## 2. 아키텍처 다이어그램

### 2.1 전체 시스템 토폴로지

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client (Browser)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Next.js App  │  │ tldraw       │  │ Yjs Doc (in-memory)      │   │
│  │ (App Router) │──│ Canvas       │──│  ↕ y-websocket provider  │   │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘   │
│         │                  │                       │                │
└─────────┼──────────────────┼───────────────────────┼────────────────┘
          │ HTTPS            │                       │ WSS
          ▼                  ▼                       ▼
┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐
│ Vercel Edge      │  │ Supabase Auth    │  │ y-websocket Server     │
│ (Next.js SSR/    │  │ (Magic Link/     │  │ (Phase 4: 자체 호스팅   │
│  Server Actions) │  │  OAuth Phase 7)  │  │  또는 Supabase         │
│                  │  │                  │  │  Realtime channel)     │
└────────┬─────────┘  └────────┬─────────┘  └───────────┬────────────┘
         │                     │                        │
         │                     ▼                        │
         │            ┌──────────────────┐              │
         └───────────▶│ Supabase Postgres│◀─────────────┘
                      │ (RLS 적용)        │  (Yjs snapshot 영속화)
                      └────────┬─────────┘
                               │
                               ▼
                      ┌──────────────────┐
                      │ Resend (Email)   │  매직 링크 발송
                      └──────────────────┘
```

### 2.2 레이어 책임 분리

| 레이어 | 책임 | 위치 |
| --- | --- | --- |
| **Presentation** | UI, 라우팅, 디자인 토큰 적용 | `app/`, `components/` |
| **Application** | 유즈케이스, 훅, 서비스 오케스트레이션 | `lib/usecases/`, `lib/hooks/` |
| **Domain** | 엔티티, 타입, 비즈니스 규칙 | `lib/domain/` |
| **Infrastructure** | Supabase, Resend, Yjs 어댑터 | `lib/infra/` |

> 도메인 레이어는 외부 SDK를 직접 import 하지 않는다. 항상 인프라 어댑터 인터페이스를 거친다.

---

## 3. 폴더 구조

```
onuri-studio/
├─ app/                              # Next.js App Router
│  ├─ (marketing)/                   # 비인증 페이지
│  │  ├─ page.tsx                    # 랜딩 (워드마크 + CTA)
│  │  └─ login/page.tsx              # 매직 링크 진입
│  ├─ (app)/                         # 인증 후 진입
│  │  ├─ ch/
│  │  │  ├─ [channelId]/
│  │  │  │  ├─ page.tsx              # Channel Guide
│  │  │  │  └─ story/[storyId]/page.tsx  # 화이트보드
│  │  │  └─ new/route.ts             # POST 채널 생성
│  │  ├─ me/page.tsx                 # 마이페이지
│  │  └─ admin/page.tsx              # 관리자 (role=admin guard)
│  ├─ auth/
│  │  ├─ callback/route.ts           # 매직 링크 / OAuth 콜백
│  │  └─ logout/route.ts
│  ├─ api/
│  │  ├─ channels/route.ts
│  │  ├─ stories/route.ts
│  │  ├─ stories/[id]/title/route.ts # 인라인 제목 PATCH
│  │  ├─ export/[storyId]/route.ts   # .onuri.json
│  │  └─ import/route.ts
│  ├─ layout.tsx
│  └─ globals.css                    # CSS 변수 정의
├─ components/
│  ├─ brand/
│  │  ├─ Wordmark.tsx                # "Onuri Studio" 워드마크
│  │  └─ OnAirIndicator.tsx          # 빨간 펄스
│  ├─ canvas/
│  │  ├─ StudioCanvas.tsx            # tldraw 래퍼
│  │  ├─ Remote.tsx                  # 도구 바
│  │  └─ PresenceLayer.tsx           # 다른 사용자 커서
│  ├─ channel/
│  │  ├─ ChannelGuide.tsx
│  │  ├─ StoryCard.tsx
│  │  └─ StoryTitleInline.tsx        # 제목 인라인 편집
│  ├─ auth/
│  │  ├─ AuthGate.tsx                # 닉네임/이메일 분기
│  │  ├─ NicknameForm.tsx
│  │  └─ MagicLinkForm.tsx
│  └─ ui/                            # shadcn 스타일 원자 컴포넌트
├─ lib/
│  ├─ domain/
│  │  ├─ user.ts                     # User, AuthProvider 타입
│  │  ├─ channel.ts
│  │  ├─ story.ts
│  │  └─ onuri-file.ts               # .onuri.json 스키마
│  ├─ usecases/
│  │  ├─ create-channel.ts
│  │  ├─ rename-story.ts
│  │  ├─ assign-anonymous-color.ts       # D-007: 채널 내 색상 충돌 회피
│  │  ├─ convert-anonymous-to-member.ts  # TODO[Phase9-Email]: Phase 9에서 호출 활성화
│  │  ├─ export-story.ts
│  │  └─ import-story.ts
│  ├─ hooks/
│  │  ├─ useOnuriAuth.ts             # Provider 추상화 훅
│  │  ├─ useYDoc.ts                  # Yjs 도큐먼트 + provider 라이프사이클
│  │  ├─ usePresence.ts
│  │  └─ useStoryTitle.ts            # 인라인 편집 상태기계
│  ├─ infra/
│  │  ├─ supabase/
│  │  │  ├─ client.ts                # 브라우저 클라이언트
│  │  │  ├─ server.ts                # Server Component / Action
│  │  │  └─ admin.ts                 # Service Role (서버 전용)
│  │  ├─ auth/
│  │  │  ├─ provider-registry.ts     # AuthProvider → 어댑터 매핑
│  │  │  ├─ anonymous-provider.ts    # MVP 활성
│  │  │  ├─ email-provider.ts        # TODO[Phase9-Email]: 인터페이스만, isEnabled()=false
│  │  │  ├─ google-provider.ts       # TODO[Phase7]: 구현 stub
│  │  │  └─ types.ts
│  │  ├─ realtime/
│  │  │  ├─ y-websocket-adapter.ts
│  │  │  └─ supabase-channel-adapter.ts  # 대안
│  │  ├─ email/
│  │  │  └─ resend-adapter.ts
│  │  └─ external/                   # TODO[Phase8]: Google Workspace
│  │     └─ google-drive.stub.ts
│  ├─ config/
│  │  ├─ env.ts                      # 환경변수 검증 (zod)
│  │  └─ urls.ts                     # NEXT_PUBLIC_APP_URL 기반 URL 헬퍼
│  ├─ security/
│  │  ├─ rate-limit.ts               # Upstash 또는 메모리
│  │  ├─ sanitize.ts                 # DOMPurify 래퍼
│  │  └─ validators/                 # zod 스키마
│  └─ design-tokens/
│     ├─ tokens.ts                   # JS export
│     └─ tailwind-preset.ts
├─ supabase/
│  ├─ migrations/
│  │  ├─ 0001_init.sql
│  │  ├─ 0002_anonymous_session.sql
│  │  ├─ 0003_external_integration.sql  # Phase 8 대비, 미사용 OK
│  │  └─ 0004_rls_policies.sql
│  └─ seed.sql
├─ public/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/                           # Playwright
├─ .env.example
├─ Claude.md                         # 원본 프롬프트
├─ DESIGN.md                         # 본 문서
├─ README.md
└─ package.json
```

---

## 4. 도메인 모델 (TypeScript)

### 4.1 핵심 타입

```ts
// lib/domain/user.ts
export type AuthProvider =
  | 'anonymous'
  | 'email'
  | 'google'    // TODO[Phase7]
  | 'github'    // TODO[Phase7]
  | 'microsoft' // TODO[Phase7]
  | 'apple';    // TODO[Phase7]

export interface User {
  id: string;
  email: string | null;
  nickname: string;
  color: string;                       // hex, 자동 배정
  primaryAuthProvider: AuthProvider;
  linkedProviders: AuthProvider[];
  isAnonymous: boolean;
  role: 'user' | 'admin';
  createdAt: string;
  lastSeenAt: string;
}

export interface AnonymousSession {
  id: string;
  sessionToken: string;
  convertedUserId: string | null;
  createdAt: string;
}
```

```ts
// lib/domain/channel.ts
export interface Channel {
  id: string;          // nanoid(12)
  name: string;
  ownerId: string;
  createdAt: string;
}

// lib/domain/story.ts
export interface Story {
  id: string;          // nanoid(12)
  channelId: string;
  title: string;       // 기본 "이름 N"
  titleUpdatedAt: string;
  createdAt: string;
  thumbnailUrl: string | null;
  externalLinks: ExternalLinks;  // Phase 8 대비, MVP에선 빈 객체
}

export interface ExternalLinks {
  googleSheets?: { url: string; embedded: boolean }[];
  googleSlides?: { url: string; embedded: boolean }[];
  // TODO[Phase8]: 추가 통합 시 여기에 확장
}
```

### 4.2 `.onuri.json` 파일 스키마 (확장 가능)

```ts
// lib/domain/onuri-file.ts
export interface OnuriFile {
  $schema: 'https://onuri.studio/schema/onuri-file/v1';
  version: 1;
  meta: {
    exportedAt: string;       // ISO
    exportedBy: { nickname: string };
    appVersion: string;
  };
  story: {
    id?: string;              // 가져오기 시 무시
    title: string;
    yDocBase64: string;       // Yjs binary → base64
    thumbnailDataUri?: string;
  };
  external?: ExternalLinks;   // TODO[Phase8]
}
```

> **버저닝 규칙**: 스키마 breaking change 시 `version: 2` 발급 + `version: 1` 마이그레이터를 `lib/usecases/import-story.ts`에 등록한다.

---

## 5. 데이터베이스 스키마 (Supabase Postgres)

### 5.1 ERD (텍스트)

```
auth.users (Supabase 내장)
   │ 1:1
   ▼
public.users ──┐
   │ 1:N       │ 1:N
   ▼           ▼
public.channels   public.participations
   │ 1:N
   ▼
public.stories

public.anonymous_sessions ──(converted_user_id)──▶ public.users
public.external_integrations ──(user_id)──▶ public.users   -- Phase 8
```

### 5.2 마이그레이션 (요약)

```sql
-- supabase/migrations/0001_init.sql
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  nickname text not null,
  color text not null,
  primary_auth_provider text not null check (primary_auth_provider in
    ('anonymous','email','google','github','microsoft','apple')),
  linked_providers text[] not null default '{}',
  is_anonymous boolean not null default false,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.channels (
  id text primary key,                       -- nanoid(12)
  name text not null,
  owner_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.stories (
  id text primary key,                       -- nanoid(12)
  channel_id text not null references public.channels(id) on delete cascade,
  title text not null,
  title_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  y_doc_snapshot bytea,
  thumbnail_url text,
  external_links jsonb not null default '{}'::jsonb
);

create table public.participations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel_id text not null references public.channels(id) on delete cascade,
  story_id text references public.stories(id) on delete cascade,
  role text not null check (role in ('owner','visitor')),
  first_visited_at timestamptz not null default now(),
  last_visited_at timestamptz not null default now(),
  is_favorite boolean not null default false,
  unique (user_id, channel_id, story_id)
);
```

```sql
-- supabase/migrations/0002_anonymous_session.sql
create table public.anonymous_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  converted_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
```

```sql
-- supabase/migrations/0003_external_integration.sql -- Phase 8 대비
create table public.external_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null check (provider in
    ('google_drive','google_sheets','google_slides')),
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz not null
);
-- 인덱스/RLS는 Phase 8 활성화 시 별도 마이그레이션
```

### 5.3 RLS 정책 (요약)

```sql
-- supabase/migrations/0004_rls_policies.sql
alter table public.users enable row level security;
alter table public.channels enable row level security;
alter table public.stories enable row level security;
alter table public.participations enable row level security;
alter table public.anonymous_sessions enable row level security;

-- users: 본인 read/update, admin 전체 read
create policy "users_self_select" on public.users
  for select using (auth.uid() = id);
create policy "users_self_update" on public.users
  for update using (auth.uid() = id);
create policy "users_admin_select" on public.users
  for select using (exists (
    select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'
  ));

-- channels: owner 수정/삭제, 누구나 read (URL 알면)
create policy "channels_public_read" on public.channels for select using (true);
create policy "channels_owner_write" on public.channels
  for all using (auth.uid() = owner_id);

-- stories: 채널 소유자만 write, 누구나 read
create policy "stories_public_read" on public.stories for select using (true);
create policy "stories_owner_write" on public.stories
  for all using (exists (
    select 1 from public.channels c
    where c.id = stories.channel_id and c.owner_id = auth.uid()
  ));

-- participations: 본인 것만
create policy "participations_self" on public.participations
  for all using (auth.uid() = user_id);
```

---

## 6. 인증 시스템 설계 (Provider 추상화)

> **MVP 활성 범위**: `anonymous` 만. `email`/`google`/`github`/`microsoft`/`apple` 은 모두 **null 등록**으로 비활성. UI(`AuthGate`)는 `enabledProviders()` 결과를 보고 동적으로 버튼을 그리므로, Phase 9에서 `email-provider.ts` 구현체를 등록하는 순간 자동으로 "이메일로 시작" 버튼이 나타난다.

### 6.1 인터페이스

```ts
// lib/infra/auth/types.ts
export interface AuthProviderAdapter {
  id: AuthProvider;
  /** UI에서 활성/비활성 토글 */
  isEnabled(): boolean;
  /** 로그인 시작 (리다이렉트 또는 즉시 세션 발급) */
  signIn(input: unknown): Promise<AuthResult>;
  /** 콜백 핸들러 (OAuth/매직링크용) */
  handleCallback?(req: Request): Promise<AuthResult>;
}

export interface AuthResult {
  userId: string;
  isAnonymous: boolean;
  redirectTo: string;
}
```

### 6.2 Provider Registry

```ts
// lib/infra/auth/provider-registry.ts
import { anonymousProvider } from './anonymous-provider';
// TODO[Phase9-Email]: import { emailProvider } from './email-provider';
// TODO[Phase7]:       import { googleProvider } from './google-provider';

export const authRegistry: Record<AuthProvider, AuthProviderAdapter | null> = {
  anonymous: anonymousProvider,
  email: null,     // TODO[Phase9-Email]: emailProvider
  google: null,    // TODO[Phase7]: googleProvider
  github: null,    // TODO[Phase7]
  microsoft: null, // TODO[Phase7]
  apple: null,     // TODO[Phase7]
};

export function enabledProviders(): AuthProvider[] {
  return Object.entries(authRegistry)
    .filter(([, p]) => p?.isEnabled())
    .map(([id]) => id as AuthProvider);
}
```

> `email-provider.ts` 자체는 Phase 1에서 **stub 형태로 미리 만들어 둔다** (인터페이스 + `isEnabled() => false`). 이렇게 두면 Phase 9에서 본문만 채우고 registry 한 줄만 바꾸면 활성화된다.

### 6.3 익명 → 회원 전환 시퀀스 *(Phase 9에서 활성화)*

> 본 시퀀스는 `emailProvider`가 registry에 등록되는 시점부터 동작한다. Phase 1~6 동안에는 UI에 "이메일로 저장" 버튼이 노출되지 않으며, `convert-anonymous-to-member.ts` 유즈케이스도 호출되지 않는다. 다만 데이터 모델(`anonymous_sessions.converted_user_id`)과 유즈케이스 코드는 Phase 1부터 미리 준비해 두어, Phase 9에서 라우팅/UI만 연결하면 즉시 동작하게 한다.

```
[익명 사용자]
   │ 1) 닉네임 입력
   ▼
[anonymousProvider.signIn]
   │  - anonymous_sessions row 생성
   │  - httpOnly 쿠키 onuri_anon=<token>
   ▼
[채널/스토리 생성, 활동 누적]
   │
   │ 2) "이메일로 저장" 클릭
   ▼
[emailProvider.signIn({ email })]
   │  - Supabase signInWithOtp
   │  - 매직 링크 발송 (Resend)
   ▼
[/auth/callback 진입]
   │  - 회원 user row upsert
   │  - 익명 세션 토큰을 form/state로 전달
   ▼
[convertAnonymousToMember 유즈케이스]
   │  - anonymous_sessions.converted_user_id = newUserId
   │  - channels.owner_id, participations.user_id 일괄 업데이트
   │  - 쿠키 onuri_anon 삭제, JWT 세션 발급
   ▼
[마이페이지로 리다이렉트]
```

### 6.4 `useOnuriAuth` 훅 시그니처

```ts
// lib/hooks/useOnuriAuth.ts
export interface OnuriAuthState {
  user: User | null;
  status: 'loading' | 'anonymous' | 'authenticated' | 'unauthenticated';
  enabledProviders: AuthProvider[];        // MVP에서는 ['anonymous']
  signIn: (provider: AuthProvider, input?: unknown) => Promise<void>;
  signOut: () => Promise<void>;
  /** Phase 9에서 emailProvider 활성화 시 비로소 호출 가능. 그 전엔 throw 'EMAIL_AUTH_DISABLED' */
  convertToMember: (email: string) => Promise<void>;
}
```

> 훅 시그니처는 Phase 1부터 최종 형태로 고정한다. 비활성 메서드를 호출하면 명시적으로 throw 하여, MVP 단계에서 실수로 UI를 노출하는 것을 방지한다.

---

## 7. 환경변수 명세

### 7.1 `.env.example`

```bash
# 도메인 (Phase 1 필수)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="Onuri Studio"

# Supabase (Phase 1 필수)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Yjs Realtime (Phase 4)
NEXT_PUBLIC_YJS_WS_URL=ws://localhost:1234

# 보안 (Phase 6)
RATE_LIMIT_REDIS_URL=

# SSO (Phase 7+, 빈 값 OK)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Google Workspace (Phase 8+, 빈 값 OK)
GOOGLE_WORKSPACE_SCOPES="drive.file spreadsheets presentations"
INTEGRATION_TOKEN_ENCRYPTION_KEY=

# 이메일 매직 링크 (Phase 9, MVP에선 빈 값 OK)
RESEND_API_KEY=
EMAIL_FROM=
# 예: noreply@onuri.studio (도메인 인증 후)
```

### 7.2 환경변수 검증 (`lib/config/env.ts`)

```ts
import { z } from 'zod';

const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_APP_NAME: z.string().default('Onuri Studio'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(), // 서버 only
  // Phase 9에서 활성화. 빈 값일 때 emailProvider.isEnabled() === false
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export const env = schema.parse(process.env);
```

### 7.3 URL 헬퍼

```ts
// lib/config/urls.ts
import { env } from './env';

export const urls = {
  base: () => env.NEXT_PUBLIC_APP_URL,
  authCallback: () => `${env.NEXT_PUBLIC_APP_URL}/auth/callback`,
  channel: (id: string) => `${env.NEXT_PUBLIC_APP_URL}/ch/${id}`,
  story: (channelId: string, storyId: string) =>
    `${env.NEXT_PUBLIC_APP_URL}/ch/${channelId}/story/${storyId}`,
};
```

> 모든 외부 노출 URL은 `urls.*`만 사용한다. 하드코딩 금지.

---

## 8. API 설계

### 8.1 RESTful 엔드포인트 (Next.js Route Handlers)

| 메서드 | 경로 | 설명 | Auth | Rate Limit |
| --- | --- | --- | --- | --- |
| POST | `/api/channels` | 채널 생성 | required | 5/min/IP |
| GET | `/api/channels/:id` | 채널 조회 | optional | 60/min |
| POST | `/api/stories` | 스토리 생성 | channel owner | 20/min/user |
| PATCH | `/api/stories/:id/title` | 인라인 제목 변경 | channel owner | 30/min/user |
| DELETE | `/api/stories/:id` | 스토리 삭제 | channel owner | 10/min/user |
| GET | `/api/export/:storyId` | `.onuri.json` 다운로드 | participant | 10/min/user |
| POST | `/api/import` | `.onuri.json` 업로드 | required | 5/min/user |
| GET | `/api/me/history` | 마이페이지 데이터 | required | 60/min |
| GET | `/api/admin/stats` | 관리자 통계 | role=admin | 60/min |

### 8.2 응답 포맷

```ts
// 성공
{ "ok": true, "data": <T> }

// 실패
{ "ok": false, "error": { "code": "RATE_LIMITED", "message": "..." } }
```

### 8.3 입력 검증 (zod)

- 모든 핸들러는 `lib/security/validators/`의 zod 스키마로 입력 파싱.
- 파일 업로드는 MIME + 크기(이미지 5MB, .onuri.json 10MB) + 스키마 버전 검증.

---

## 9. 실시간 동기화 설계

### 9.1 Yjs 도큐먼트 라이프사이클

```
[페이지 진입]
  ↓
useYDoc(storyId)
  ├── 1) Y.Doc 인스턴스 생성
  ├── 2) IndexedDB persistence (오프라인 캐시)
  ├── 3) WebsocketProvider 연결 (NEXT_PUBLIC_YJS_WS_URL)
  ├── 4) Awareness 채널로 Presence 송수신
  └── 5) 5초 debounce로 Postgres bytea 스냅샷 저장
[페이지 이탈]
  ↓
provider.destroy() + 마지막 스냅샷 flush
```

### 9.2 Presence 페이로드

```ts
{
  userId: string;
  nickname: string;
  color: string;          // accent-live 계열 자동 배정
  cursor: { x: number; y: number } | null;
  tool: 'pen' | 'rect' | 'circle' | 'arrow' | 'text' | 'sticky' | 'eraser';
  isOnAir: boolean;       // 현재 그리기 중일 때 true → 빨간 펄스
}
```

### 9.3 동기화 어댑터 선택지

| 옵션 | 장점 | 단점 | 권장 |
| --- | --- | --- | --- |
| **y-websocket 자체 호스팅** | 표준, 검증됨 | Vercel 외 별도 호스트 필요 (Fly.io 무료 티어) | Phase 4 기본 |
| **Supabase Realtime** | 인프라 통합 | y-protocols 어댑터 필요, 메시지 한도 | 대안 |

> 어댑터는 `lib/infra/realtime/` 아래에 둘 다 구현하고, 환경변수 `NEXT_PUBLIC_REALTIME_DRIVER`로 토글한다.

---

## 10. 컴포넌트 설계 — 핵심 항목

### 10.1 워드마크 (`components/brand/Wordmark.tsx`)

- 단일 책임: "Onuri Studio" 표기 + "i"의 점을 `--accent-rec`으로 강조.
- props: `size` (`'sm' | 'md' | 'lg'`), `withTagline?: boolean`.
- 외부에서 색/폰트 override 금지 (브랜드 일관성).

### 10.2 스토리 제목 인라인 편집 (`components/channel/StoryTitleInline.tsx`)

상태 머신:

```
[idle]
  ── click ──▶ [editing]
                 │ Enter / blur(valid)  → [saving]
                 │ Esc                  → [idle, rollback]
                 │ blur(empty)          → [idle, rollback]
[saving]
  ── success ──▶ [idle, broadcast Yjs awareness 'title_changed']
  ── error   ──▶ [idle, rollback + toast]
```

- props: `storyId`, `initialTitle`, `canEdit`.
- 낙관적 업데이트, 실패 시 `initialTitle`로 복원.
- Yjs awareness로 다른 클라이언트에 즉시 반영.

### 10.3 On Air 인디케이터 (`components/brand/OnAirIndicator.tsx`)

- 빨간 점 (`--accent-rec`) + 2초 주기 펄스 (Framer Motion `animate`).
- 페이지/스토리 단위 1개 인스턴스 권장.

### 10.4 AuthGate (`components/auth/AuthGate.tsx`)

- `enabledProviders()`를 받아 동적 렌더.
- **MVP(Phase 1~6)**: `[닉네임으로 시작]` 단일 버튼만 노출 (`anonymous`만 enabled).
- **Phase 7**: `[Google로 시작]` 자동 추가.
- **Phase 9**: `[이메일로 시작]` + 마이페이지 내 `[이메일로 저장]` 버튼 자동 추가.
- 컴포넌트 코드는 Phase 1부터 모든 분기를 포함하되, 비활성 provider는 자연스럽게 렌더에서 제외된다 (조건부 분기 없음).

---

## 11. 디자인 토큰

### 11.1 CSS 변수 (`app/globals.css`)

```css
:root {
  --bg-bezel:      #0B0B0F;
  --bg-screen:     #16161D;
  --bg-surface:    #1F1F2A;
  --text-primary:  #F5F5F7;
  --text-muted:    #9A9AA8;
  --accent-rec:    #FF3D5A;
  --accent-live:   #4FD1C5;
  --divider:       #2A2A38;

  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;

  --transition-default: 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

### 11.2 Tailwind preset (`lib/design-tokens/tailwind-preset.ts`)

- `theme.extend.colors.brand`에 토큰 매핑.
- 모든 컴포넌트는 `bg-brand-screen`, `text-brand-primary` 식으로 사용.
- 임의 hex 사용 금지 (PR review 시 차단).

---

## 12. 보안 설계 상세

### 12.1 위협 모델

| 위협 | 완화책 |
| --- | --- |
| 채널 ID 추측 | nanoid 12자 (≈63bit 엔트로피) |
| XSS (스토리 제목, 닉네임) | DOMPurify + zod 입력 길이 제한 |
| CSRF | Server Action 토큰 + SameSite=Lax |
| 매직 링크 토큰 탈취 | Supabase 기본 15분 TTL, 1회 사용 |
| Rate abuse | API 레벨 + 매직 링크 3회/분/email |
| 익명 세션 도용 | httpOnly + Secure 쿠키, 10분 idle 시 갱신 |
| RLS 우회 | Service Role 키는 서버 모듈에서만 import (lint rule) |
| Phase 8 토큰 유출 | `INTEGRATION_TOKEN_ENCRYPTION_KEY` 기반 AES-GCM 암호화 |

### 12.2 Service Role Key 격리

- `lib/infra/supabase/admin.ts`만 Service Role 키 import.
- ESLint custom rule: 클라이언트 번들에서 `admin.ts` import 시 에러.

### 12.3 파일 업로드 검증 절차

1. MIME 검사 (서버에서 magic byte 재검증)
2. 크기 한도 (이미지 5MB, .onuri.json 10MB)
3. zod 스키마 검증 (`OnuriFile` v1)
4. 의심 시 격리 후 관리자 알림

---

## 13. Phase 별 구현 계획

### Phase 1 — 브랜딩 + 익명 인증 + 도메인 추상화

- 산출물:
  - **pnpm + Next.js 14 App Router + TypeScript + TailwindCSS** 프로젝트 초기화 (D-005)
  - **shadcn/ui** init + 디자인 토큰 매핑 (D-006)
  - 랜딩 페이지 (워드마크 + 태그라인 + `[닉네임으로 시작]` 단일 CTA)
  - 디자인 토큰 (CSS 변수 + Tailwind preset)
  - Supabase 프로젝트 연결 + 익명 user row 자동 생성 (Phase 1 코드 작성 직후 프로젝트 생성, D-003)
  - **anonymous-provider 구현 + email-provider stub** (인터페이스만, `isEnabled() => false`)
  - `provider-registry.ts`에 anonymous만 등록, email/SSO는 `null`
  - **`assign-anonymous-color.ts` 유즈케이스** (D-007: 채널 내 활성 색상 충돌 회피, § 17.2 알고리즘)
  - 환경변수 검증 (`lib/config/env.ts`) + `urls.*` 헬퍼
  - 워드마크 컴포넌트
- 검증: `pnpm run dev` → 닉네임 입력 → 익명 세션 발급 → 두 브라우저로 같은 채널 입장 시 서로 다른 색 자동 배정 → 새로고침 후 세션 유지.
- 함정:
  - 익명 쿠키를 SameSite=Lax, httpOnly로 설정하지 않으면 Vercel 프리뷰에서 동작 불일치.
  - email/SSO 관련 환경변수가 빈 값이어도 부팅이 깨지면 안 됨 → zod 스키마에서 모두 `.optional()` 처리.
- 무료 티어: Supabase Auth 50K MAU. **이메일 발송은 본 단계에서 하지 않으므로 Resend 한도 무관.**

### Phase 2 — 채널 / 스토리 CRUD + 마이페이지 골격

- 산출물: 채널 생성/조회, Channel Guide, 스토리 카드, `/me` 페이지 정적 영역.
- 검증: 채널 생성 → URL 공유 → 다른 브라우저로 조회.
- 함정: nanoid 충돌 처리 (DB unique constraint + 재시도).

### Phase 3 — 단일 사용자 화이트보드 + 자동 저장 + 인라인 제목

- 산출물: tldraw 통합, 5초 debounce 저장, `StoryTitleInline`.
- 검증: 새로고침 후 도형 복원, 제목 인라인 편집 후 새로고침 유지.

### Phase 4 — Yjs 동기화 + Presence + On Air

- 산출물: y-websocket 어댑터, awareness 기반 커서, 빨간 펄스.
- 검증: 두 브라우저로 50ms 이내 동기화.
- 함정: Vercel 함수에 WebSocket 직접 호스팅 불가 → Fly.io 등 외부 사용.

### Phase 5 — 내보내기/가져오기 + 마이페이지 히스토리 + 관리자

- 산출물: `.onuri.json` export/import, `.png`/`.svg` 익스포트, 마이페이지 즐겨찾기, `/admin` 통계.
- 검증: export → 새 채널에 import 시 도형/제목 동일.

### Phase 6 — 보안 + 모바일 + 스테이징 배포

- 산출물: RLS 정책 활성화, Rate Limit, 모바일 터치, Vercel preview 도메인.
- 검증: Lighthouse 모바일 점수 90+, RLS 침투 테스트.

### Phase 7 — Google SSO (확장)

- 활성화 포인트:
  - `lib/infra/auth/google-provider.ts` 구현
  - `provider-registry.ts`의 `google: null` → `googleProvider` 교체
  - Google Cloud Console에서 OAuth client 생성, redirect URI = `urls.authCallback()`
  - `.env`에 `GOOGLE_CLIENT_ID/SECRET` 주입
- AuthGate UI는 자동으로 Google 버튼 노출.

### Phase 8 — Google Workspace 연계 (확장)

- 활성화 포인트:
  - `lib/infra/external/google-drive.stub.ts` 구현
  - `external_integrations` 테이블 활성 사용
  - `OnuriFile.external` 필드 채움
  - 스토리 화이트보드에 Sheets/Slides 임베드 컴포넌트 추가

### Phase 9 — 이메일 매직 링크 + 커스텀 도메인 + 프로덕션 배포

이메일 인증과 도메인 활성화를 **하나의 묶음**으로 처리한다. 발신 도메인 인증(DKIM/SPF)이 커스텀 도메인을 전제로 하기 때문에 분리 시 의미가 없다.

- 산출물 (순서대로 수행):
  1. **도메인 구매 + DNS 설정** (예: `onuri.studio`)
  2. **Resend 도메인 인증** (DKIM/SPF/DMARC TXT 레코드 등록)
  3. **`.env` 갱신**:
     - `NEXT_PUBLIC_APP_URL=https://onuri.studio`
     - `RESEND_API_KEY=<발급된 키>`
     - `EMAIL_FROM=noreply@onuri.studio`
  4. **Supabase Auth Redirect URL** 갱신 → `https://onuri.studio/auth/callback`
  5. **OAuth Redirect URL** 갱신 (Phase 7에서 SSO 활성화한 경우)
  6. **`email-provider.ts` 본문 구현**:
     - `signInWithOtp({ email })` → 매직 링크 발송
     - `handleCallback(req)` → 토큰 교환 + JWT 세션 발급
     - `isEnabled()` → `!!env.RESEND_API_KEY && !!env.EMAIL_FROM`
  7. **`provider-registry.ts` 활성화**: `email: null` → `email: emailProvider`
  8. **익명 → 회원 전환 라우팅 활성화**:
     - `MagicLinkForm` 컴포넌트를 `AuthGate` / `/me` 페이지에서 렌더 가능하게 노출
     - `convert-anonymous-to-member.ts` 유즈케이스를 `/auth/callback`에서 호출
  9. **마이페이지에 `[이메일로 저장]` 버튼 노출** (익명 사용자에게만)
  10. Vercel 프로덕션 배포 + 도메인 연결
- 검증:
  - 익명 사용자 → "이메일로 저장" → 매직 링크 수신 → 클릭 → 회원 전환 후 익명 자산(채널/스토리/즐겨찾기) 그대로 보존
  - 매직 링크 토큰 15분 만료 동작
  - 발신 도메인이 `noreply@onuri.studio`로 표기, SPF/DKIM 통과
- 함정:
  - Resend 도메인 인증은 DNS 전파에 최대 24시간 걸릴 수 있음 → 검증 단계 사전 배치
  - `EMAIL_FROM`을 인증되지 않은 도메인으로 두면 발송 자체가 실패 (`onboarding@resend.dev` 임시 사용 불가, MVP 정책에서 의도적으로 배제)
  - 익명 → 회원 전환 시 `channels.owner_id` 일괄 업데이트는 트랜잭션으로 묶을 것 (RLS 충돌 방지 위해 Service Role로 실행)
  - Supabase Auth의 매직 링크 템플릿을 `NEXT_PUBLIC_APP_URL` 기반으로 커스터마이즈 (기본 템플릿은 supabase.co URL을 노출)
- 무료 티어: Resend 3,000통/월, Supabase Auth 50K MAU.

---

## 14. 테스트 전략

| 레이어 | 도구 | 범위 |
| --- | --- | --- |
| Unit | Vitest | 도메인 함수, 훅 (테스트용 어댑터 주입) |
| Integration | Vitest + msw | API Route, Supabase 어댑터 |
| E2E (MVP) | Playwright | 익명 입장, 동시 편집(2 브라우저), import/export |
| E2E (Phase 9) | Playwright | 익명→회원 전환, 매직 링크 토큰 만료, 자산 이전 무결성 |
| Visual | Playwright trace + screenshot | 워드마크, On Air |
| Security | 수동 + zap baseline | RLS 우회, XSS, 파일 업로드 |

> Phase 6 종료 시 MVP E2E 그린 + Lighthouse 모바일/접근성 90+ 가 스테이징 릴리즈 게이트.
> Phase 9 종료 시 이메일 전환 E2E 그린 + 발신 도메인 SPF/DKIM 통과 가 프로덕션 릴리즈 게이트.

---

## 15. 운영 / 관측

| 항목 | 도구 | 비고 |
| --- | --- | --- |
| 에러 추적 | Sentry (무료 티어) | 클라이언트/서버 동시 |
| 분석 | Vercel Analytics 기본 | 무료 티어 |
| 로그 | Vercel + Supabase logs | |
| 헬스체크 | `/api/health` | Vercel cron |

---

## 16. 확장 포인트 인덱스 (TODO 마커)

코드 내 다음 마커로 향후 작업 위치를 표시한다.

| 마커 | 의미 | 위치 예시 |
| --- | --- | --- |
| `TODO[Phase7]` | SSO 추가 시 손볼 곳 | `provider-registry.ts`, `AuthGate.tsx` |
| `TODO[Phase8]` | Google Workspace 통합 시 손볼 곳 | `OnuriFile.external`, `external_integrations` |
| `TODO[Phase9-Email]` | 이메일 매직 링크 활성화 시 손볼 곳 | `email-provider.ts`, `provider-registry.ts`, `convert-anonymous-to-member.ts`, `MagicLinkForm.tsx`, `/auth/callback` |
| `TODO[Phase9-Domain]` | 커스텀 도메인 전환 시 손볼 곳 | `.env`, Supabase auth redirect, Resend 도메인 인증 |
| `TODO[Security]` | 보안 강화 후속 작업 | rate-limit 정책 튜닝 |

---

## 17. 결정 사항 (Decision Log)

### 17.1 확정된 결정

| 일자 | # | 항목 | 결정 | 근거 |
| --- | --- | --- | --- | --- |
| 2026-05-08 | D-001 | 도메인 | **`onuri.studio`** | 브랜드명과 일치, Phase 9에서 구매·연결 |
| 2026-05-08 | D-002 | GitHub 저장소 | **https://github.com/jinhalim/onuri-studio** | 생성 완료, Vercel 연동은 Phase 6 |
| 2026-05-08 | D-003 | Supabase 프로젝트 | **Phase 1 코드 작성 직후 생성** | 무료 티어 카운트 시작점 늦추기 |
| 2026-05-08 | D-004 | 개발 진행 방식 | **AI가 코드 작성 → 사용자 검토 (방식 A)** | 일정 우선 |
| 2026-05-08 | D-005 | 패키지 매니저 | **pnpm** | 디스크/속도 우수, Vercel 호환 |
| 2026-05-08 | D-006 | UI 컴포넌트 라이브러리 | **shadcn/ui** | Radix 기반, 토큰 커스터마이즈 자유, 코드 직접 소유 |
| 2026-05-08 | D-007 | 익명 닉네임 색상 팔레트 | **랜덤 배정 + 같은 채널/스토리 내 충돌 회피** | 같은 공간 내 다른 사용자 색상은 즉시 식별 가능해야 함 |
| 2026-05-08 | D-008 | 관리자 권한 부여 | **MVP는 Supabase SQL 직접 변경, 사용자 증가 시 `/admin` promote UI 추가** | MVP 단순성 |
| 2026-05-08 | D-009 | Yjs 스냅샷 보존 정책 | **일별 1개 + 직전 5개 롤링** | 500MB 무료 티어 안전 + 즉시 롤백 + 장기 백업 균형 |
| 2026-05-08 | D-010 | Realtime 드라이버 (O-008 해결) | **Supabase Realtime broadcast + presence** (tldraw store diff, last-write-wins) | 별도 WebSocket 인프라 불필요. Yjs CRDT는 후속 마이그레이션으로 점진 전환 가능 (같은 채널에 메시지 타입 추가). MVP 동시 편집 충돌은 last-write-wins 으로 수용. |
| 2026-05-11 | D-011 | 캔버스 색상 — **전체 도형 임의 색** | tldraw `shape.meta.customColor` 에 hex 저장, 각 ShapeUtil `.configure({ getCustomDisplayValues })` 로 렌더 override. 커스텀 StylePanel 에 HTML color picker section 추가. 구현 메모 [§ 17.5](#175-d-011-임의-색상-지원-구현-메모). | tldraw v5 의 `colorStyle` enum 제약을 schema 변경 없이 우회. 기본 팔레트 + 임의 색 병행. sticky note 작은 화면 hit-box 버그 회피로 함께 해결. |
| 2026-05-11 | D-012 | **라이트 모드 추가** | `html[data-theme="light"]` CSS 변수 분기로 다크 13색 → 라이트 대응색 정의. `<head>` 인라인 bootstrap 스크립트로 first paint 전 적용 (flash 방지). 영속화: localStorage('theme') + cookie('theme'). 헤더에 sun/moon `ThemeToggle`. 스토리(화이트보드) 페이지는 `ForceDarkTheme` 으로 다크 강제. accent (`--accent-rec`, `--accent-live`) 두 모드 공유. | CLAUDE.md §2 의 "다크 모드 우선" 을 "다크 default + 라이트 선택 가능" 으로 완화. tldraw 캔버스 자체는 이미 자체 colorMode 가지므로 dark 고정으로 충돌 회피. |
| 2026-05-12 | D-013 | **Google SSO 활성화** (O-012/O-016 부분 해결) | provider abstraction (Phase 1 부터 준비) 의 `google-provider.ts` 활성화. Supabase `signInWithOAuth({ provider: 'google' })` + `/auth/callback` 라우트로 OAuth code 교환. 익명 트랙은 그대로 병행 유지 (사용자 선택). Google 로그인 직후 `/auth/setup-nickname` 으로 닉네임 입력 (익명과 동일 UX). 익명 흔적은 Google 계정에 흡수: `anonymous_sessions.converted_user_id` 연결 + `channels.owner_id`/`participations.user_id` 등을 Google user 로 transfer. | CLAUDE.md §11 Phase 7 SSO 를 Phase 6 단계에서 일부 조기 도입. 익명/Google 병행으로 진입 장벽 낮춤. 이메일 매직링크는 D-EMAIL 로 Phase 9 까지 보류 유지. |
| 2026-05-12 | D-014 | **사용자 유형별 권한 정책** | **익명 사용자**: (a) middleware 가 미인증 사용자를 메인 페이지 (`/`) 로 redirect, `next` 쿼리에 원래 URL 보존 → 닉네임 입력 후 자동 이동. (b) 나가기 클릭 시 확인 모달 — "Google 연동" → `/me` 또는 "데이터 삭제" → cascade 삭제 (`auth.users` 삭제로 `users`/`channels`/`participations`/`stories` 모두 cleanup). (c) 비-owner 채널에서 ExportButton 숨김. **Google 회원**: admin 제외 전체 기능 (export/import 모두 허용 — 비-owner 채널도 export 가능). 나가기 시 세션만 종료, 데이터 영구 보존 — 단순 확인 모달만. | CLAUDE.md §5 의 "Could (확장)" 채널 권한 시스템의 일부 — 익명/회원 차별화 + 데이터 명시적 삭제. O-015 의 핵심인 "편집 권한 요청·부여" 는 여전히 보류. |
| 2026-05-13 | D-015 | **수정 권한 요청/승인 + 알림 inbox** (O-015 부분 해결) | **스토리 단위 / 영구 / DB 보관**. 비-owner 사용자(익명 닉네임 또는 Google) 가 스토리 페이지 우상단 "읽기 전용" 배지를 클릭 → `requestEditPermissionAction` → owner 의 inbox 에 `edit_request` 알림 INSERT + broadcast push. owner 가 알림 클릭 → `EditRequestDialog` (허용/차단) → 허용 시 `story_permissions` 에 `(story_id, user_id, role='editor')` upsert + 요청자에게 `edit_request_approved` 알림. 요청자가 그 알림 클릭 → `window.location.assign` 으로 전체 페이지 리로드 → `canEdit = isOwner \|\| hasStoryEditPermission` 재계산 → 편집 모드. 구현 메모 [§ 17.6](#176-d-015-수정-권한-요청-및-알림-시스템-구현-메모). | CLAUDE.md §5 "Could" 채널 권한 시스템 중 가장 핵심인 "수정 권한 요청/부여" 만 스토리 단위로 도입. 채널 단위 권한 / 대표 이미지 등은 별도 결정 필요. |
| 2026-05-13 | D-016 | **tldraw Hobby License attribution + Editor abstraction L1** | **라이선스 attribution**: README "📜 라이선스" 섹션 + [§ 17.7](#177-tldraw-라이선스-가이드) 라이선스 가이드 + 랜딩 페이지 푸터 ("Built with tldraw (Hobby License) · Non-commercial use only"). **L1 abstraction**: `lib/editor/index.ts` 신설로 tldraw 의 사용 표면 (components / hooks / shape utils / types) 을 한곳에 명시적 re-export. 9개 캔버스 관련 소비처는 `@/lib/editor` 만 import → tldraw 직접 import 는 `lib/editor/index.ts` + StudioCanvas CSS side-effect 두 곳만 남음. 미래 editor 교체 (Excalidraw / 자체 canvas 등) 검토 시 본 파일에 동일 시그니처 adapter 작성으로 swap 가능. 구현 메모 [§ 17.8](#178-editor-교체-대비-abstraction-가이드). | CLAUDE.md §13 ("예산 $0", "MIT 호환 라이선스 우선") 의 운영 가이드 구체화. 상업화 결정 시점에 SDK License 구매 OR alternative editor 로 swap. |
| 2026-05-13 | D-017 | **Realtime sync hardening + per-story 정원 제한** | 누적된 sync 코드 정리 + 데이터 손실 quick wins + 50명 대비 throttle 조정 + 정원 cap. 구현 메모 [§ 17.9](#179-d-017-realtime-sync-hardening-구현-메모). | CLAUDE.md §8 (Realtime D-010) + §9 ("한 스토리당 20명") 갱신 — 25명 cap + 50명 운영 시 Yjs CRDT 이행. |

### 17.2 D-007 색상 충돌 회피 알고리즘 상세

```ts
// lib/usecases/assign-anonymous-color.ts
// 1. 채널/스토리 내 현재 활성 사용자 awareness state에서 사용 중인 색 목록 수집
// 2. PALETTE에서 사용 중이지 않은 색 무작위 선택
// 3. PALETTE 모두 사용 중이면 HSL 색상환에서 가장 멀리 떨어진 색 fallback

const PALETTE = [
  '#FF3D5A', '#4FD1C5', '#F6AD55', '#9F7AEA',
  '#48BB78', '#ED64A6', '#4299E1', '#ECC94B',
  '#38B2AC', '#FC8181', '#A0AEC0', '#D69E2E',
  '#667EEA', '#F687B3', '#68D391', '#B794F4',
  '#F56565', '#4FD1C5', '#FBD38D', '#7F9CF5',
];

// 동시 접속 20명 = PALETTE 크기와 동일 → 정원 초과 시 HSL fallback 활성
```

> 사용자 색은 채널/스토리 입장 시점에 awareness presence와 비교하여 결정. DB의 `users.color`는 "최근 색"의 hint일 뿐, 충돌하면 즉시 재배정한다.

### 17.3 D-009 스냅샷 보존 구현 메모

- `stories.y_doc_snapshot` 컬럼은 **항상 최신 1개**만 저장 (현재 상태).
- 별도 `story_snapshots` 테이블 신설 (Phase 4 또는 Phase 5):
  - `story_id`, `snapshot bytea`, `kind: 'rolling' | 'daily'`, `created_at`
  - `kind='rolling'`은 최대 5개, 6번째 추가 시 가장 오래된 것 삭제
  - `kind='daily'`은 매일 자정 cron으로 1개 추가, 무기한 보존(또는 90일 후 정리는 추후 결정)
- 복구 UI는 Phase 5 마이페이지에서 추가 (선택사항).

### 17.5 D-011 임의 색상 지원 구현 메모

**문제**: tldraw v5 의 color style 은 `'black' | 'grey' | 'light-violet' | …` enum (`TLDefaultColorStyle`) 으로 schema 에 박혀 있어 임의 hex 를 `shape.props.color` 에 넣을 수 없음. 그러나 사용자 요구는 sticky note·도형·펜·화살표 등 **전체 도형에 임의 색**.

**해법** — 두 축으로 분리:

1. **저장**: `shape.meta.customColor` 에 hex 문자열 저장. `meta` 는 자유로운 JsonObject 라 schema 변경 불필요.
2. **렌더**: 각 기본 ShapeUtil 을 `.configure({ getCustomDisplayValues })` 로 확장. `getDisplayValues` 가 default + custom 을 spread 머지하므로 (`shapes/shared/getDisplayValues.js`), custom 에서 `strokeColor` / `fillColor` / `noteBackgroundColor` 등 키만 반환하면 부분 override.

```ts
// components/canvas/customShapeUtils.ts
const CustomNoteShapeUtil = NoteShapeUtil.configure({
  getCustomDisplayValues: (_editor, shape) => {
    const hex = getCustomColor(shape);
    if (!hex) return {};
    return {
      noteBackgroundColor: hex,
      borderColor: hexWithAlpha(hex, 0.6),
      labelColor: labelOnHex(hex),  // sRGB 휘도로 검정/흰색 자동
    };
  },
});
```

**UI**: `<Tldraw components={{ StylePanel: CustomStylePanel }}>` 로 교체. `CustomStylePanel` 은 `<DefaultStylePanel>` 안에 `<DefaultStylePanelContent />` (기존 팔레트 유지) + HTML `<input type="color">` section 추가.

**Realtime 호환**: 사용자가 picker 로 색을 적용하면 `editor.updateShapes({ id, type, meta })` 가 호출되고, store 의 user-source 변경은 D-010 broadcast 메커니즘으로 자동 전파 → 다른 사용자도 같은 hex 색으로 렌더.

**부수 효과**: 작은 화면에서 일부 팔레트 swatch 클릭이 잘 안되는 hit-box 이슈는 globals.css 에 `min-width/min-height: 24px` 추가로 보완 + 임의 색 picker 가 우회로 제공.

### 17.6 D-015 수정 권한 요청 및 알림 시스템 구현 메모

**데이터 모델** (migration `0010_permissions_and_notifications.sql`):

```sql
public.story_permissions (
  id, story_id, user_id, role='editor', granted_by, granted_at,
  unique (story_id, user_id)
)
public.notifications (
  id, recipient_user_id,
  type in ('edit_request', 'edit_request_approved', 'edit_request_denied'),
  payload jsonb, read_at, created_at
)
```

`stories` 의 RLS `stories_owner_write` 를 owner OR editor 권한자 모두 허용으로 확장 (`with check` 도 동일). `notifications` 는 본인만 read/update/delete (RLS), write 는 admin client 전용.

**서버 액션** (`app/actions/`):

- `request-edit-permission.ts` — visitor → owner. `already_granted` (이미 권한 보유) / `already_pending` (24시간 내 미읽음 요청 존재) dedupe.
- `approve-edit-request.ts` — owner 가 승인. `upsert(story_permissions)` + 원본 `edit_request` read 처리 + 요청자에게 `edit_request_approved` INSERT.
- `deny-edit-request.ts` — 권한 부여 없이 거절 알림만 INSERT.
- `mark-notification-read.ts` — 본인 알림 read 처리.
- `list-my-notifications.ts` — 최근 50개 초기 fetch (admin client → RLS 우회, server-side 본인 user_id 필터).

**Realtime push — 왜 broadcast 인가**: 익명 사용자는 클라이언트 Supabase 세션이 없다 (`anonymous-provider.ts` 가 `auth.admin.createUser` 만 호출, 브라우저 `sb-*` 쿠키 없음). 따라서 `auth.uid()` 가 NULL → Postgres Changes 및 RLS-protected 직접 SELECT 가 모두 차단. 우회로 `lib/infra/realtime/broadcast-server.ts` 가 REST `/realtime/v1/api/broadcast` 엔드포인트로 service key 인증 broadcast 전송. 클라이언트는 `user-notifications:{userId}` 채널 구독, broadcast payload 는 메타만 (`notificationId`, `type`) — 본문은 `listMyNotificationsAction` 으로 refetch.

**컴포넌트**:

- `RequestEditButton` — 우상단 "읽기 전용" 배지 교체. 클릭 시 `requestEditPermissionAction` 호출. 4가지 시각 상태 (idle / pending / requested / granted / error).
- `NotificationBell` — 헤더에 종 아이콘 + 미확인 카운트 빨간 도트. 모든 페이지 (랜딩 / 채널 / 스토리 / 마이페이지) 헤더에 배치.
- `NotificationDropdown` — 알림 리스트. type 별 아이콘/문구/액션 분기.
- `EditRequestDialog` — owner 가 `edit_request` 클릭 시 뜨는 허용/차단 모달.

**Editor 동기화**: 승인 알림 클릭 시 `window.location.assign(storyUrl)` 으로 전체 페이지 리로드 (router.refresh 는 React state 보존 → tldraw editor 의 `isReadonly` 초기 mount 설정이 stale 닫힘 회피). 추가로 `StudioCanvas` 에 `useEffect([canEdit])` 으로 `editor.updateInstanceState({ isReadonly: !canEdit })` 동기화 effect 추가 (defense-in-depth).

**Save 권한 검증**: `lib/usecases/save-story-snapshot.ts` 에 `hasStoryEditPermission` 체크 추가. owner 아니어도 editor 면 통과.

### 17.4 미해결 결정 (사용자 검토 대기)

| # | 항목 | 결정 시점 | 비고 |
| --- | --- | --- | --- |
| ~~O-008~~ | ~~Realtime 드라이버~~ | **D-010 으로 해결 (Supabase Realtime 채택)** | |
| O-009 | 썸네일 생성 방식 (클라이언트 캡처 vs 서버 puppeteer) | Phase 2 또는 Phase 5 | 사용자 추가 설명 요청 → README "결정 이력" 섹션에 설명 보강 |
| O-012 | SSO 우선순위 (Google만 / Google+GitHub / 4종) | Phase 7 시작 전 | |
| O-013 | Google Workspace 통합 깊이 (임베드만 / 양방향 / 전체 동기화) | Phase 8 시작 전 | |
| O-014 | 이메일 발신자 표기 (`noreply@` / `hello@` / `studio@`) | Phase 9 도메인 인증 시 | |
| ~~O-015~~ | ~~채널 권한 시스템~~ | **D-015 부분 해결 (스토리 단위 수정 권한 요청/승인)** | 채널 단위 권한 / 대표 이미지 등은 별도 결정 필요 |
| O-016 | 인증 방식 — 이메일 매직 링크 대신 다른 방식 (SSO 등) 검토 | O-012 와 함께 | 사용자 의사로 이메일 매직 링크 활성화 보류 |

### 17.7 tldraw 라이선스 가이드

#### 라이선스 종류

| 라이선스 | 비용 | 제약 | 워터마크 |
| --- | --- | --- | --- |
| **Hobby License** | 무료 | **비상업적만** (개인 학습 / 포트폴리오 / 비영리 OSS / 교육) | tldraw 3.x 부터 포함 |
| **SDK License (상업)** | 연간 정액, 협상 (수천 USD/년 수준) | 자유 | 제거됨 |

> 공식 페이지: <https://tldraw.dev/community/license>. 문의: `license@tldraw.com`

#### "상업적 사용" 의 정의 (실무 기준)

다음 중 하나라도 해당하면 **상업 사용** 으로 간주, SDK License 필요:

- 수익 발생 (직접: 구독/판매, 간접: 광고/후원/데이터)
- 법인 (회사) 이 운영 또는 사용 — 무료 서비스여도 상업
- 회사 내부 도구로 사용 (외부 판매 X 여도 영리 활동의 일부)
- 본인 사업의 부수 도구 (포트폴리오 → 채용 → 회사 인수 등으로 전환되는 시점)

다음은 **Hobby** 로 유지 가능:

- 개인 학습 / 취미 프로젝트, 수익 0
- 졸업작품 / 학교 과제
- 비영리 OSS 데모 (수익화 없음)
- 개인 포트폴리오 (수익 0, 본인 사이트)

회색 지대 (NPO / 정부기관 / 사회적 기업 / 후원 모델 등) 는 `license@tldraw.com` 사전 문의 권장.

#### Onuri Studio 의 현재 위치

- 사용자 본인 1명, 수익 0, 학습/포트폴리오 용도 → **Hobby License 명백히 OK**
- 상업화 전환 시점 (자가 진단 3가지: 수익 의도 / 법인 운영 / 제3자 수익 — 셋 중 하나라도 yes) 도달 시 SDK License 협상 필요

#### 상업화 시 대안

SDK License 비용이 부담스러우면 editor 자체를 교체 고려:

| 대안 | 라이선스 | tldraw 대비 기능 |
| --- | --- | --- |
| [Excalidraw](https://github.com/excalidraw/excalidraw) | MIT (상업 자유) | 손그림 느낌, 기능 단순, 동시편집 자체 약함 |
| [Konva](https://konvajs.org) / [Fabric.js](http://fabricjs.com) | MIT / MIT | 캔버스 라이브러리, UI/UX 직접 구현 필요 |
| 자체 canvas (SVG / HTML5) | 자유 | 구현 부담 매우 큼 |

교체는 본격 코드 수정이라 [§ 17.8](#178-editor-교체-대비-abstraction-가이드) 의 abstraction layer 가 있는 만큼 작업량이 달라짐.

#### 안전한 운영 가이드

1. README + 앱 푸터 + 코드 주석에 라이선스 표기 (이 문서 + `README.md` "📜 라이선스" 섹션)
2. 수익화 1개월 전 tldraw 팀에 사전 문의 (협상 시간 확보)
3. 워터마크 제거 시점도 라이선스 구매 시점과 동일
4. 회색지대 진입 (후원 시작 / 회사 인수 / 광고 도입) 즉시 메일 문의
5. Excalidraw 등 MIT 대안으로 fallback 가능하게 코드 추상화 ([§ 17.8](#178-editor-교체-대비-abstraction-가이드))

### 17.8 Editor 교체 대비 abstraction 가이드

> **현재 상태: L1 (Import 중앙화) 적용 완료** — D-016 (2026-05-13).
> [`lib/editor/index.ts`](lib/editor/index.ts) 가 tldraw 의 사용 표면을 명시적 re-export.
> 9개 캔버스 관련 소비처 (`StudioCanvas.tsx`, `customShapeUtils.ts`, `CustomStylePanel.tsx`, `NoteAuthorLayer.tsx`, `PresenceLayer.tsx`, `RemoteLaserLayer.tsx`, `export-image.ts`, `ExportButton.tsx`, `StoryWorkspace.tsx`) 가 `@/lib/editor` 만 import.
> tldraw 직접 import 는 본 abstraction 파일 + `StudioCanvas.tsx` 의 CSS side-effect (`import 'tldraw/tldraw.css'`) 두 곳만 남음.

#### 현재 tldraw 결합 표면 (touchpoint inventory)

L1 abstraction 도입으로 의존 표면은 한곳에 모였지만, **shape 모델 / 스타일 패널 / export API 등 도메인 로직 자체는 여전히 tldraw 특화**. 분포:

| 영역 | 파일 | tldraw 의존도 |
| --- | --- | --- |
| 캔버스 마운트 | [`components/canvas/StudioCanvas.tsx`](components/canvas/StudioCanvas.tsx) | 매우 높음 — `<Tldraw>` 컴포넌트, `Editor` 인스턴스, `editor.store.listen`, `editor.getSnapshot`, `editor.loadSnapshot` 직접 호출 |
| 커스텀 도형 | [`components/canvas/customShapeUtils.ts`](components/canvas/customShapeUtils.ts) | 매우 높음 — `NoteShapeUtil` 등 ShapeUtil `.configure` 패턴 |
| 커스텀 스타일 패널 | [`components/canvas/CustomStylePanel.tsx`](components/canvas/CustomStylePanel.tsx) | 매우 높음 — tldraw `DefaultStylePanel`, `StylePanelColorPicker` 등 |
| 노트 작성자 라벨 | [`components/canvas/NoteAuthorLayer.tsx`](components/canvas/NoteAuthorLayer.tsx) | 매우 높음 — `editor.getShapesById`, `useValue` |
| 레이저 / 커서 오버레이 | [`components/canvas/PresenceLayer.tsx`](components/canvas/PresenceLayer.tsx) / `RemoteLaserLayer.tsx` | 중간 — 좌표 변환에 `editor.pageToScreen` 사용 |
| 실시간 sync | [`components/story/StoryWorkspace.tsx`](components/story/StoryWorkspace.tsx) `handleRemoteSync` | 중간 — `TLRecord` 타입, `store.put` / `store.remove` |
| broadcast 페이로드 | [`lib/hooks/useStoryRealtime.ts`](lib/hooks/useStoryRealtime.ts) `SyncPayload` | 낮음 — 추상 record 타입으로 사용 중 (`unknown[]` 으로 선언) |
| 내보내기/가져오기 | [`components/story/ExportButton.tsx`](components/story/ExportButton.tsx), `import-story.ts` | 매우 높음 — `editor.getSnapshot` / `editor.toSvg` 등 tldraw 전용 API |

#### Abstraction 수준 옵션

| 수준 | 작업량 | 효과 | 현재 상태 |
| --- | --- | --- | --- |
| **L0. Documentation only** | 0 | touchpoint 카탈로그만 — 교체 시 어디 손대야 하는지 명확 | ✅ 본 문서가 그 역할 |
| **L1. Light — Import 중앙화** | 0.5일 | `lib/editor/index.ts` 를 신설해서 tldraw type 들을 re-export, 모든 소비처가 `@/lib/editor` 만 import. 향후 backend 교체 시 re-export 만 갈아끼우면 됨 (단, API shape 가 같을 때만 효과) | **✅ D-016 으로 완료** |
| **L2. Medium — Adapter interface** | 2~3일 | `CanvasEditorAdapter` interface 정의 (mount, getSnapshot, loadSnapshot, listenChanges, applyRemoteChanges), tldraw adapter 1개 구현. 소비처는 interface 만 의존. 다른 editor 도입 시 adapter 1개 더 작성 | ⏳ 상업화 결정 시점에 재검토 |
| **L3. Heavy — Full abstraction** | 1~2주 | 도형 모델, 스타일, presence, export 까지 모두 추상화. tldraw 의 기능 풍부함을 일부 잃을 가능성 | 🔒 보류 (over-engineering) |

#### L1 구현 상세 ([`lib/editor/index.ts`](lib/editor/index.ts))

명시적 re-export 패턴 — `export * from 'tldraw'` 대신 사용 중인 API 만 명시적으로 export 해서 의존 표면을 가시화:

```ts
// Components
export { Tldraw, DefaultStylePanel, StylePanelColorPicker, ... } from 'tldraw';
// Hooks
export { useEditor, useValue } from 'tldraw';
// Shape util base classes
export { NoteShapeUtil, GeoShapeUtil, ArrowShapeUtil, ... } from 'tldraw';
// Types
export type { Editor, TLRecord, TLShape, TLComponents, TLUiStylePanelProps } from 'tldraw';
```

새 tldraw API 를 도입할 땐 반드시 본 파일에 export 추가 후 소비. 직접 `from 'tldraw'` import 는 새 코드에서 지양 (ESLint `no-restricted-imports` rule 로 강제 가능 — 현재는 컨벤션만).

#### 권장 (D-016 이후 갱신)

- **현재 (비상업, L1 완료)**: 더 추상화 없이 유지. 문서 + L1 으로 향후 swap 시점에 정보/표면이 모두 정리되어 있음.
- **상업화 결정 시점**: 그때 선택한 alternative editor (Excalidraw / Konva / 자체) 의 API 를 보고 L2 adapter interface 설계. "그 editor 의 진짜 API" 를 알아야 추상화가 정확함 — 미리 만들면 wrong abstraction 위험.
- **L3 는 영구 보류**: tldraw 자체 풍부함을 abstraction 으로 평탄화하면 가치를 잃음. 진짜 multi-backend 가 필요한 시점이 오기 전엔 부담만.

#### Excalidraw 교체 시 예상 작업

L1 abstraction 이 적용된 상태에서 swap 시 손대야 하는 항목:

| 항목 | 변경 정도 | 비고 |
| --- | --- | --- |
| `lib/editor/index.ts` | **전면 재작성** | tldraw re-export → Excalidraw API 로 같은 시그니처 노출 (또는 adapter wrapping) |
| `customShapeUtils.ts` | **전면 재작성** | Excalidraw 는 ShapeUtil 개념 없음 — 다른 customization API |
| `CustomStylePanel.tsx` | **전면 재작성** | Excalidraw UI 슬롯 구조에 맞게 |
| `NoteAuthorLayer.tsx` | **전면 재작성** | 좌표 변환 / shape 조회 API 다름 |
| `PresenceLayer.tsx` | 중간 | `editor.pageToScreen` 등 좌표 변환만 다시 |
| `RemoteLaserLayer.tsx` | 중간 | 좌표 변환 다시 |
| `export-image.ts` + `ExportButton.tsx` | 중간 | Excalidraw 의 `.excalidraw` ↔ `.onuri.json` 매핑, `editor.toImage` 대체 API |
| `StudioCanvas.tsx` | 중간 | mount / store.listen / snapshot 의 새 API 적용 |
| `StoryWorkspace.tsx` | 작음 | `TLRecord` 가 abstract record type 으로 바뀌므로 type 만 영향 |
| broadcast 페이로드 / Realtime sync | 작음 | record 직렬화 형식만 다름. `SyncPayload` 의 added/updated/removed 구조는 그대로 |
| 기존 저장된 snapshot JSON | 마이그레이션 필요 | tldraw → Excalidraw 변환 스크립트 OR 신규 스토리만 새 editor 사용하고 기존은 read-only 유지 |

실질 작업량 추정:
- **L1 있을 때**: 1~2주 (L1 으로 의존 표면 가시화 → 작업 범위 추정/계획 용이)
- **L1 없을 때**: 3~4주 (어디부터 손대야 하는지 찾는 시간만 며칠)

### 17.9 D-017 Realtime sync hardening 구현 메모

#### 배경

D-010 (Supabase Realtime broadcast + tldraw store diff, last-write-wins) 기반 운영 중 사용자가 보고한 데이터 손실 패턴:

1. **"내가 작성한 게 사라짐"** — owner 의 1.5초 autosave debounce 가 다른 사용자의 in-flight broadcast 도착 직전에 발화 → owner 의 로컬 snapshot (그 변경 누락된 상태) 이 DB 에 덮어쓰여서 영구 손실.
2. **"동시 작업이 둘 다 사라짐"** — 위 + broadcast drop.
3. **"버벅거림"** — store 변경마다 즉시 broadcast → N명 동시 편집 시 broadcast/수신측 re-render 폭주.
4. **"재접속 후 작업 사라짐"** — `handleReconnect` 가 `loadSnapshot(parsed)` 로 store 전체 replace → disconnect 동안 로컬 변경 통째로 사라짐.

추가 요구: 50명 동시 접속 목표지만 현재 인프라 (Supabase free tier) 에선 안정 운영 곤란 → **per-story 정원 25명 cap** 으로 안정성 우선, 50명 시점엔 Yjs CRDT 이행.

#### 적용 변경

**Phase 1 — Cleanup (누적 흔적 제거)**

| 항목 | 위치 | 변경 |
| --- | --- | --- |
| 과도한 console.log | `useStoryRealtime`, `useChannelPresence`, `StudioCanvas`, `StoryWorkspace` | broadcast 송수신, presence sync, subscribe status, system event 로그 제거. 의미 있는 error 만 유지 |
| 이중 fromUserId 안전망 | `useStoryRealtime` broadcast handlers | `broadcast.self=false` SDK 설정이 본인 메시지 차단 → 수동 `if (p.fromUserId === user.id) return` 제거 |
| `flushSave` vs `flushPendingSave` | `StudioCanvas` | 통합 — 단일 `flushSave` (await + UI 상태 갱신) + `flushPendingSave` (fire-and-forget, unmount/visibility 용) |
| `STATUS_DEBOUNCE_MS` | `StoryWorkspace` | 3000 → 1500 (50명 환경에서 진짜 끊김을 너무 늦게 인지하면 불리) |
| `keepalive` 간격 | `useStoryRealtime` | 20s → 45s (50명 × 20s 빈도는 무의미한 broadcast 폭주) |
| `system event` log | `useStoryRealtime` | 제거 (디버그 목적, 환경 가드 없이 항상 출력되던 noise) |

**Phase 2 — Quick wins (데이터 손실 차단)**

| ID | 항목 | 코드 위치 | 효과 |
| --- | --- | --- | --- |
| **A1** | Smart autosave | `StudioCanvas.tsx` `handleStoreChange` autosave 분기 | debounce 발화 시 `presencesRef.current.some(p => p.userId !== self && p.isDrawing)` 검사 → true 면 `AUTOSAVE_DEFER_RETRY_MS=1000` 후 재시도. `AUTOSAVE_MAX_DEFERS=5` 회 상한 (무한 연기 방지). owner snapshot 이 다른 사용자 in-flight 변경 누락한 상태로 덮어쓰는 케이스 차단 |
| **A2** | Non-destructive reconnect | `StoryWorkspace.tsx` `handleReconnect` | `ed.loadSnapshot(parsed)` 전체 replace → 서버 snapshot 의 record 만 `store.put` 으로 merge. 로컬 unsynced 변경 보존. 보너스: 본인 로컬 shape record 들을 `broadcast({ updated: localShapes })` 로 catch-up 전송 (다른 사용자가 disconnect 동안의 본인 변경 회복). 트레이드오프: 다른 사용자가 정당하게 삭제한 record 가 잠시 부활 가능 — last-write-wins 로 자연 회복 |
| **A3** | Broadcast throttle/batch | `useStoryRealtime.ts` `broadcast` | 50ms window 내 변경 누적 후 1번 송신. Record id 기반 dedupe (같은 shape 의 여러 updated 는 마지막 것만, added → updated 순서면 added 유지, removed 가 오면 add/update 무시). N명 환경에서 broadcast 수 폭증 + 수신측 re-render 폭증 완화 |

**Phase 3 — 50명 폴리시**

| ID | 항목 | 변경 |
| --- | --- | --- |
| **P1** | `CURSOR_THROTTLE_MS` | 33 (30Hz) → 66 (15Hz). 50명 × 30Hz = 1500 msg/s 부담 절반으로 |
| **P2** | `LASER_THROTTLE_MS` | 16 (60Hz) → 33 (30Hz). 같은 이유 |
| **Cap** | `MAX_STORY_PRESENCES` | 25명 cap. presence sync 시 본인 포함 정원 초과면 `channel.untrack()` + `setStatus('overflow')` + `OverflowNotice` 표시. **자동 재시도 없음** — `overflowRef` 로 scheduleRetry 차단. 사용자가 "다시 시도" 버튼 (= `window.location.reload`) 으로 새 채널 인스턴스 생성해서 재진입 |

#### Overflow 동작 흐름

1. 사용자 N번째 (>=26) 가 스토리 URL 접속.
2. `useStoryRealtime` 가 channel subscribe + SUBSCRIBED 콜백에서 track.
3. 첫 `presence sync` 이벤트에서 list.length > 25 + includesMe(self) 검사.
4. 본인이 정원 초과 origin → 즉시 `channel.untrack()` + `overflowRef.current = true` + `setStatus('overflow')`.
5. `StoryWorkspace` 가 status === 'overflow' 분기로 `OverflowNotice` 렌더 (캔버스 대신).
6. 사용자가 "다시 시도" → `window.location.reload()` → 페이지 전체 재로드 → 다시 N+1 검사. 다른 사용자가 떠난 후면 정상 입장.

**Race window**: 두 사용자가 동시에 26번째로 입장 시도하면 둘 다 잠시 "in" 으로 보이다가 둘 다 overflow 처리. 26~27 인원이 잠시 보일 수 있지만 곧 정상화. 무료 티어 정확성 트레이드오프로 수용.

#### 50명 운영을 위한 후속 작업 (별도 결정 필요)

D-017 적용 후 안정 운영 가능 범위는 **20~30명 정도**. 50명 운영을 위해서는:

- **Yjs CRDT 마이그레이션** (B 옵션) — tldraw 의 `useYjsStore` + Y.Doc binary 영속화 (Supabase Storage). 1~2주 작업. CRDT 라서 데이터 손실 자체가 발생 안 함 → Smart autosave / Non-destructive reconnect 불필요.
- 또는 **상업 매니지드 서비스** — Liveblocks / tldraw sync cloud 등 (상업화 시점에 검토).

이행 시 D-017 의 quick wins (A1/A2/A3) 와 정원 cap 은 일부 제거 가능 (CRDT 가 본질적으로 대체).

---

## 18. 변경 이력

| 일자 | 버전 | 변경 |
| --- | --- | --- |
| 2026-05-08 | 0.1.0 | 초안 작성 (Claude.md 기반) |
| 2026-05-08 | 0.2.0 | **이메일 매직 링크를 Phase 1 → Phase 9로 이동.** MVP는 익명 트랙 단독. 인증 추상화 인터페이스(`email-provider.ts` stub, `convert-anonymous-to-member.ts` 유즈케이스, `useOnuriAuth.convertToMember`)는 Phase 1부터 미리 준비하되, registry에는 `null`로 등록하여 비활성. Phase 9에서 도메인 구매 + Resend 도메인 인증 + registry 활성화를 일괄 수행. |
| 2026-05-08 | 0.3.0 | **결정 9건 확정** (D-001 ~ D-009). 도메인=`onuri.studio`, 패키지매니저=pnpm, UI=shadcn/ui, 익명 색상=충돌 회피 랜덤, 관리자 권한=MVP SQL/이후 UI, Yjs 스냅샷=일별+롤링5. § 17 구조를 확정/미해결로 분리. |
| 2026-05-08 | 0.4.0 | **D-010 Realtime 드라이버 확정** (O-008 해결). Supabase Realtime broadcast + presence 채택, Yjs 후순위. |
| 2026-05-11 | 0.5.0 | **D-011 임의 색상 + D-012 라이트 모드**. customColor meta override + StylePanel 교체. `data-theme` CSS 변수 분기 + system preference + 영속화. |
| 2026-05-12 | 0.6.0 | **D-013 Google SSO + D-014 사용자 유형별 권한**. provider abstraction 의 google 활성화 + 익명 → Google 흡수. 익명 middleware 가드 + 나가기 모달 + 비-owner export 차단. |
| 2026-05-13 | 0.7.0 | **D-015 ~ D-017 일괄 적용**. <br>**D-015**: 스토리 단위 수정 권한 요청/승인 + DB 알림 inbox (`story_permissions` / `notifications` 테이블 + broadcast push + UI 4종). <br>**D-016**: tldraw Hobby License attribution (README + DESIGN § 17.7 + 랜딩 푸터) + Editor abstraction L1 (`lib/editor/index.ts` re-export, 9개 소비처 일괄 전환, § 17.8 가이드). <br>**D-017**: Realtime sync hardening — cleanup (console.log / 이중 안전망 제거 / flushSave 통합 / status 디바운스 단축 / keepalive 45s) + Quick wins (Smart autosave / Non-destructive reconnect / 50ms broadcast batching) + 50명 폴리시 (cursor 15Hz / laser 30Hz) + **per-story 25명 정원 cap + OverflowNotice** (§ 17.9). |
