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

### 17.4 미해결 결정 (사용자 검토 대기)

| # | 항목 | 결정 시점 | 비고 |
| --- | --- | --- | --- |
| ~~O-008~~ | ~~Realtime 드라이버~~ | **D-010 으로 해결 (Supabase Realtime 채택)** | |
| O-009 | 썸네일 생성 방식 (클라이언트 캡처 vs 서버 puppeteer) | Phase 2 또는 Phase 5 | 사용자 추가 설명 요청 → README "결정 이력" 섹션에 설명 보강 |
| O-012 | SSO 우선순위 (Google만 / Google+GitHub / 4종) | Phase 7 시작 전 | |
| O-013 | Google Workspace 통합 깊이 (임베드만 / 양방향 / 전체 동기화) | Phase 8 시작 전 | |
| O-014 | 이메일 발신자 표기 (`noreply@` / `hello@` / `studio@`) | Phase 9 도메인 인증 시 | |
| O-015 | 채널 권한 시스템 (수정 권한 요청·알림 inbox·익명/로그인 구분·대표 이미지) | MVP 후 또는 인증 결정 후 | C 그룹 검토 후 보류. CLAUDE.md §5 Could 항목 |
| O-016 | 인증 방식 — 이메일 매직 링크 대신 다른 방식 (SSO 등) 검토 | O-012 와 함께 | 사용자 의사로 이메일 매직 링크 활성화 보류 |

---

## 18. 변경 이력

| 일자 | 버전 | 변경 |
| --- | --- | --- |
| 2026-05-08 | 0.1.0 | 초안 작성 (Claude.md 기반) |
| 2026-05-08 | 0.2.0 | **이메일 매직 링크를 Phase 1 → Phase 9로 이동.** MVP는 익명 트랙 단독. 인증 추상화 인터페이스(`email-provider.ts` stub, `convert-anonymous-to-member.ts` 유즈케이스, `useOnuriAuth.convertToMember`)는 Phase 1부터 미리 준비하되, registry에는 `null`로 등록하여 비활성. Phase 9에서 도메인 구매 + Resend 도메인 인증 + registry 활성화를 일괄 수행. |
| 2026-05-08 | 0.3.0 | **결정 9건 확정** (D-001 ~ D-009). 도메인=`onuri.studio`, 패키지매니저=pnpm, UI=shadcn/ui, 익명 색상=충돌 회피 랜덤, 관리자 권한=MVP SQL/이후 UI, Yjs 스냅샷=일별+롤링5. § 17 구조를 확정/미해결로 분리. |
