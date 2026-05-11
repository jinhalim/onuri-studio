# 프로젝트: Onuri Studio (온누리 스튜디오) — 협업 화이트보드 웹앱

> AI 코딩 도구(Cursor / Claude Code / Codex 등)에 그대로 붙여 넣을 수 있는 완성형 프롬프트.

---

## 0. 브랜드

- **제품명**: Onuri Studio
- **내부 코드명**: onuri-studio (repo, 패키지명)
- **의미**: "On"(방송이 켜지는 순간) + "누리"(우리 모두의 온 세상) + "Studio"(함께 만드는 작업실/방송 스튜디오).
- **태그라인**:
  - 영문: "The studio where everyone tunes in."
  - 국문: "모두의 방송, 우리의 스튜디오."
- **보이스**: 따뜻하지만 미니멀. "켜다", "맞추다", "함께", "참여" 같은 동사 선호.

---

## 1. 배포 전략 (도메인 유연성)

### 환경 단계

1. **로컬 개발**: `http://localhost:3000`
2. **스테이징**: `https://onuri-studio.vercel.app` (Vercel 무료 서브도메인)
3. **프로덕션**: `https://onuri.studio` (사용자가 직접 도메인 구매 시점에 연결)

### 도메인 추상화 원칙

- **하드코딩된 URL 절대 금지**. 모든 URL은 환경변수로 관리.
- 핵심 환경변수:

  ```
  NEXT_PUBLIC_APP_URL              # 현재 환경의 baseURL
  NEXT_PUBLIC_APP_NAME             # "Onuri Studio"
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY        # 서버 전용
  RESEND_API_KEY                   # 매직 링크 이메일
  EMAIL_FROM                       # noreply@[도메인 또는 resend 기본]

  # SSO (Phase 7 이후 추가, 처음엔 빈 값 OK)
  GOOGLE_CLIENT_ID
  GOOGLE_CLIENT_SECRET
  ```

- Supabase Auth 콜백 URL, OAuth 리다이렉트, 매직 링크 본문 모두 `NEXT_PUBLIC_APP_URL` 기반으로 동적 생성.
- 도메인 구매·연결 시점에 `.env`만 교체하면 즉시 전환 가능.

### 로컬에서 이메일 매직 링크 테스트 방법

- Resend의 `onboarding@resend.dev` sender 사용 (도메인 없이 발송 가능)
- 또는 Supabase Inbucket(로컬 SMTP 캐처)으로 메일 미리보기

---

## 2. 컨셉 & 비주얼 디렉션

FigJam과 유사한 실시간 협업 화이트보드를 **방송 스튜디오 메타포**로 디자인.
사용자는 "채널"에 입장해서 "스토리(화이트보드)"를 함께 그린다.
URL만 공유하면 즉시 동시 작업 가능.

### 비주얼 톤

- 현대 OLED TV의 미니멀한 어둠. **다크 모드 우선**.
- 레트로 CRT 느낌(스캔라인, 픽셀 폰트) **금지**.
- 스튜디오 메타포는 **언어와 마이크로 인터랙션**에서만 표현.

### 컬러 팔레트

```css
--bg-bezel:      #0B0B0F;
--bg-screen:     #16161D;
--bg-surface:    #1F1F2A;
--text-primary:  #F5F5F7;
--text-muted:    #9A9AA8;
--accent-rec:    #FF3D5A;  /* On Air, 라이브 (한 점만) */
--accent-live:   #4FD1C5;  /* 다른 사용자 커서 */
--divider:       #2A2A38;
--radius-sm: 8px; --radius-md: 14px; --radius-lg: 20px;
```

### 타이포그래피

- 헤딩: Pretendard 700 / Inter 700
- 본문: Pretendard 400~500
- 모노: JetBrains Mono

### 로고

워드마크 "Onuri Studio" — Pretendard 산세리프, "i"의 점에 `--accent-rec` 빨간 점.

---

## 3. 정보 구조 & UI 용어

```
User (익명 / 이메일 / [향후: Google/GitHub/Microsoft/Apple])
 ├── Channel (1:N)              /ch/[channel-id]
 │    └── Story (1:N)           /ch/[channel-id]/story/[story-id]
 ├── 마이페이지                 /me
 └── 관리자 페이지              /admin
```

UI 용어: Channel, Story, Channel Guide, Tune in, On Air, Remote, Studio.

---

## 4. 인증 시스템 (확장 가능 구조)

### 설계 원칙: Provider 추상화

모든 인증 흐름을 `AuthProvider` 타입으로 추상화. **MVP에선 anonymous + email만 활성화**, 나머지는 인터페이스만 준비하고 환경변수로 제어.

```typescript
type AuthProvider =
  | 'anonymous'    // 닉네임만 (Phase 1)
  | 'email'        // 매직 링크 OTP (Phase 1)
  | 'google'       // Phase 7 (SSO)
  | 'github'       // Phase 7+
  | 'microsoft'    // Phase 7+
  | 'apple';       // Phase 7+
```

### Phase 1 활성화: 익명 + 이메일 매직 링크

**트랙 A: 익명 (Guest)**

- 닉네임 + 자동 색상만 입력 → 즉시 입장
- 세션 ID는 httpOnly 쿠키
- 제약: 채널/스토리 히스토리 임시 보존

**트랙 B: 이메일 매직 링크 (Member)**

- 패스워드 없음. Supabase Auth `signInWithOtp()`.
- 매직 링크 클릭 → 즉시 로그인 → JWT 발급
- 혜택: 마이페이지에서 만든/방문한 채널·스토리 영구 보존

**익명 → 회원 전환**

- "이메일로 저장" 버튼 → 매직 링크 → 인증 후 익명 세션의 소유권 이전
- `anonymous_session_id` ↔ `user_id` 매핑 테이블로 처리

### Phase 7 확장: SSO (Google 우선)

**구현 시 추가 작업** (지금은 건들지 말고 구조만 준비):

- Supabase Auth는 Google/GitHub/Microsoft/Apple OAuth 빌트인 지원
- `auth.signInWithOAuth({ provider: 'google' })` 한 줄로 활성화
- Google Cloud Console에서 OAuth 클라이언트 생성, redirect URI는 `${NEXT_PUBLIC_APP_URL}/auth/callback`

**Google Workspace 연계 (Phase 8+, 별도)**

- 단순 SSO 로그인과 별개로 Google Drive/Sheets/Slides 임베드/공유 기능
- 추가 OAuth scope 필요: `drive.file`, `spreadsheets`, `presentations`
- 사용자가 명시적으로 권한 부여하는 별도 "Google 연결" 플로우
- 스토리 안에 Google Sheets/Slides 임베드, 화이트보드에서 직접 링크 공유

**계정 연결(Account Linking) 고려**

- 사용자가 처음 이메일로 가입 후, 같은 이메일의 Google 계정 추가 연결 가능
- DB에 `linked_providers` 배열로 추적
- Supabase의 Identity Linking 기능 활용

---

## 5. 핵심 기능

### Must (MVP)

- [ ] 랜딩: 워드마크 + 태그라인 + "스튜디오 켜기" CTA + "익명/이메일" 선택
- [ ] **이메일 매직 링크 로그인/회원가입** (Supabase Auth)
- [ ] **익명 세션 → 회원 계정 전환** 플로우
- [ ] 채널 생성 → 고유 URL(`/ch/[id]`) 발급
- [ ] Channel Guide: 스토리 카드 그리드 (썸네일, 제목, 마지막 수정일, On Air)
- [ ] 스토리 생성 시 기본 제목 "이름 N" 자동 부여
- [ ] **스토리 제목 인라인 편집** (Enter/blur 저장, Esc 취소, 빈 값 롤백, 실시간 동기화)
- [ ] 닉네임만으로 협업 입장 (익명 트랙)
- [ ] 기본 도구(Remote): 펜, 사각형, 원, 화살표, 텍스트, 스티키, 지우개
- [ ] 실시간 동기화 50ms 이내 (Yjs)
- [ ] Presence: 다른 사용자 커서 + 닉네임 + 색상
- [ ] 무한 캔버스 (팬, 줌)
- [ ] Undo/Redo (사용자별)
- [ ] 자동 저장 + 재접속 복원
- [ ] **"On Air" 인디케이터** (빨간 펄스)
- [ ] 공유 버튼 (URL 클립보드 복사)
- [ ] **내보내기**: `.onuri.json` (네이티브) + `.png` + `.svg`
- [ ] **가져오기**: `.onuri.json` 드래그앤드롭 + 파일선택 (병합/새 스토리 선택)
- [ ] **마이페이지** (`/me`, 회원만):
  - 내가 만든 채널/스토리, 최근 방문, 즐겨찾기, 계정 정보
  - **연결된 인증 제공자 표시** (지금은 email/anonymous만, 향후 Google 등 추가 표시 영역 확보)
- [ ] **관리자 페이지** (`/admin`, admin role만):
  - 사용자 통계, 채널/스토리 검색, 시스템 상태

### Should

- 객체 선택/이동/리사이즈/회전, 색상·굵기 변경
- 이미지 업로드/붙여넣기
- 스토리 삭제/복제/순서 변경
- 미니맵

### Could (확장 단계)

- **Phase 7**: Google/GitHub/Microsoft/Apple SSO
- **Phase 8**: Google Workspace 연계 (Drive/Sheets/Slides 임베드 및 공유)
- 채널 권한 (편집/뷰어/비공개)
- 댓글, 멘션, 템플릿
- 음성 채팅

---

## 6. 데이터 모델 (확장 가능 설계)

```typescript
// Supabase PostgreSQL 스키마
User {
  id: uuid (PK)                            // Supabase auth.users와 1:1
  email: string (nullable, unique)
  nickname: string
  color: string                             // 자동 배정

  // 인증 메타 (확장 가능)
  primary_auth_provider: 'anonymous' | 'email' | 'google' | 'github' | 'microsoft' | 'apple'
  linked_providers: text[]                  // 연결된 추가 제공자들
  is_anonymous: boolean

  role: 'user' | 'admin'
  created_at: timestamp
  last_seen_at: timestamp
}

// 익명 세션 → 회원 전환 매핑
AnonymousSession {
  id: uuid (PK)
  session_token: string (unique)            // 익명 쿠키 토큰
  converted_user_id: uuid? (FK → User.id)   // 회원 전환 시 매핑
  created_at: timestamp
}

Channel {
  id: string (nanoid 12자, PK)
  name: string
  owner_id: uuid (FK → User.id)
  created_at: timestamp
}

Story {
  id: string (nanoid 12자, PK)
  channel_id: string (FK → Channel.id)
  title: string                             // 기본 "이름 N"
  title_updated_at: timestamp
  created_at: timestamp
  y_doc_snapshot: bytea                     // Yjs 바이너리
  thumbnail_url: string?

  // 외부 통합 메타 (Phase 8+ 대비, 지금은 빈 객체)
  external_links: jsonb                     // {googleSheets: [...], slides: [...]}
}

Participation {
  id: uuid (PK)
  user_id: uuid (FK → User.id)
  channel_id: string (FK → Channel.id)
  story_id: string? (FK → Story.id)
  role: 'owner' | 'visitor'
  first_visited_at: timestamp
  last_visited_at: timestamp
  is_favorite: boolean
}

// Phase 8+ Google Workspace 연계용 (지금은 테이블만 준비, 미사용)
ExternalIntegration {
  id: uuid (PK)
  user_id: uuid (FK → User.id)
  provider: 'google_drive' | 'google_sheets' | 'google_slides'
  access_token_encrypted: text              // 암호화 저장
  refresh_token_encrypted: text
  scopes: text[]
  expires_at: timestamp
}
```

---

## 7. 보안 요구사항

### 데이터 보호

- 모든 테이블 RLS 활성화:
  - User: 본인만 read/update
  - Channel/Story: owner만 수정/삭제, 누구나 read (URL 알면)
  - Participation: 본인 것만
  - admin role은 모든 테이블 read
- 환경변수 분리: `NEXT_PUBLIC_*`(클라이언트) vs Service Role(서버)
- ExternalIntegration의 토큰은 Supabase Vault 또는 자체 암호화

### URL 보안

- 채널/스토리 ID는 nanoid 12자 이상

### 입력 보안

- XSS 방어 (DOMPurify)
- 파일 검증 (MIME, 크기): 이미지 5MB, .onuri.json 10MB
- Import 시 JSON 스키마 검증

### Rate Limiting

- 채널 생성: 5회/분/IP
- 스토리 생성: 20회/분/사용자
- 매직 링크: 3회/분/이메일
- API 전반: 60회/분/IP

### 인증 보안

- JWT는 httpOnly + Secure + SameSite=Lax
- 매직 링크 토큰 15분
- CSRF 보호 (Next.js Server Action)
- OAuth state 파라미터로 CSRF 방어 (Phase 7)

---

## 8. 기술 스택 (무료 티어 + 도메인 무관)

- 프론트엔드: Next.js 14 App Router + TypeScript + TailwindCSS
- 캔버스: tldraw (가장 빠른 MVP)
- 실시간: Yjs + y-websocket (자체 호스팅) 또는 Supabase Realtime
- DB + 인증: Supabase Free (500MB DB, 50K MAU, OAuth 빌트인)
- 이메일: Resend Free (3,000통/월, `onboarding@resend.dev`로 도메인 없이 발송 가능)
- 호스팅: Vercel Hobby (`*.vercel.app` 무료 서브도메인 제공)
- 도메인: **추후 결정** (현재는 `localhost` + `*.vercel.app`만 사용)

---

## 9. 비기능 요구사항

- 한 스토리당 동시 접속 20명까지
- CRDT 자동 머지
- 모바일/태블릿 터치, WCAG AA
- 단축키: V/H/R/O/T/N, Cmd+Z, Cmd+Shift+Z

---

## 10. 마이크로 인터랙션

- 페이지/스토리 전환 0.15~0.2초 페이드
- "On Air" 부드러운 펄스 (2초 주기)
- 다른 사용자 커서 트레일 + 보간 이동
- 모든 트랜지션 ease-out, 200~250ms

---

## 11. 개발 단계

### MVP (Phase 1~6)

- **Phase 1**: 디자인 토큰 + Onuri Studio 브랜딩 + 랜딩 + Supabase 연동 + 익명/이메일 매직 링크 + **환경변수 기반 도메인 추상화**
- **Phase 2**: 채널 CRUD + Channel Guide + 마이페이지 골격
- **Phase 3**: 스토리 CRUD + 제목 인라인 편집 + 단일 사용자 화이트보드 + 자동 저장
- **Phase 4**: Yjs + 다중 사용자 동기화 + Presence + "On Air"
- **Phase 5**: 내보내기/가져오기 + 마이페이지 히스토리 + 관리자 페이지
- **Phase 6**: 보안 강화(RLS, Rate Limiting) + 모바일 + Vercel 스테이징 배포

### 확장 (Phase 7+, 추후)

- **Phase 7**: Google SSO 추가 (다른 SSO도 동일 패턴으로 확장)
- **Phase 8**: Google Workspace 연계 (Drive/Sheets/Slides 임베드 및 공유)
- **Phase 9**: 도메인 구매 + 프로덕션 배포 + 커스텀 발신 이메일 도메인 설정

---

## 12. 출력 요청

1. **환경변수 기반 도메인 추상화**를 가장 먼저 구현. 모든 URL은 `NEXT_PUBLIC_APP_URL` 기반.
2. **인증 시스템은 처음부터 Provider 추상화 패턴**으로 설계 (지금은 anonymous + email만 활성화, Google/GitHub 등은 인터페이스만 준비).
3. 폴더 구조 + Phase 단위 코드 작성.
4. 디자인 토큰을 Tailwind config + CSS 변수로 정의, 모든 컴포넌트가 토큰만 참조.
5. **Onuri Studio 워드마크 컴포넌트** 별도 파일.
6. **스토리 제목 인라인 편집 컴포넌트** 별도 파일.
7. **인증 통합 훅** (`useOnuriAuth`) — Provider별로 확장 가능한 구조.
8. **내보내기/가져오기 모듈** — `.onuri.json` 스키마는 향후 외부 임베드 메타도 담을 수 있게 확장 가능하게 설계.
9. **Supabase RLS 정책 SQL** 별도 파일.
10. "On Air" 라이트, 페이지 전환 페이드 등을 Framer Motion으로.
11. 코드 TypeScript, 주석 한국어.
12. 각 Phase 끝에 **로컬 검증 방법** + **흔한 함정** + **무료 티어 한도 주의사항**.
13. **Phase 7(SSO)/Phase 8(Google Workspace) 추가 시 어디를 어떻게 수정해야 하는지 주석으로 미리 표시** (예: `// TODO[Phase7]: 여기에 OAuth provider 추가`).

---

## 13. 제약

- **예산: $0** (도메인 미구매, 모든 인프라 무료 티어)
- **개발/테스트 환경**: `localhost` + `*.vercel.app`만 사용
- **도메인 구매 시점**: MVP 완성 후 사용자가 임의로 결정 (구매 시 환경변수만 교체)
- 일정: 6주 MVP, +2주 SSO, +2주 Google Workspace 연계
- 라이선스: MIT 호환 라이브러리 우선

---

먼저 **Phase 1**부터 시작해줘. 시작 전에 모호한 부분이 있으면 질문 먼저 해줘.

---

## 부록 A. 결정 이력 (Decision Log)

> 본 부록은 본문(§1~§13)이 작성된 이후 사용자와 합의된 의사결정의 **단일 진실 공급원(SSOT)**이다.
> 본문과 부록이 충돌하면 **부록이 우선**한다. 새로운 결정이 발생할 때마다 본 표 + [`README.md`](README.md) "결정 이력" 섹션 + [`DESIGN.md`](DESIGN.md) § 17 **세 곳을 동시에** 갱신한다.

### A.1 확정된 결정 (Resolved)

| 일자 | # | 항목 | 결정 | 본문 어느 절을 덮어쓰는가 |
| --- | --- | --- | --- | --- |
| 2026-05-08 | D-001 | 도메인 | **`onuri.studio`** (Phase 9에서 구매·연결) | §1 (도메인 미정 → 확정) |
| 2026-05-08 | D-002 | GitHub 저장소 | **https://github.com/jinhalim/onuri-studio** | (신규) |
| 2026-05-08 | D-003 | Supabase 프로젝트 생성 시점 | **Phase 1 코드 작성 직후** | §11 |
| 2026-05-08 | D-004 | 개발 진행 방식 | **AI가 코드 작성 → 사용자 검토 (방식 A)** | (신규) |
| 2026-05-08 | D-005 | 패키지 매니저 | **pnpm** | §8 (npm/pnpm 미명시 → 확정) |
| 2026-05-08 | D-006 | UI 컴포넌트 라이브러리 | **shadcn/ui** | §8 |
| 2026-05-08 | D-007 | 익명 닉네임 색상 팔레트 | **랜덤 배정 + 같은 채널/스토리 내 충돌 회피** (구현 알고리즘은 [`DESIGN.md` § 17.2](DESIGN.md#172-d-007-색상-충돌-회피-알고리즘-상세)) | §3 ("자동 배정"의 정의를 충돌 회피로 구체화) |
| 2026-05-08 | D-008 | 관리자 권한 부여 | **MVP는 Supabase SQL 직접 변경**, 사용자 증가 시 `/admin` promote UI 추가 | §3 (`role: 'user' \| 'admin'` 변경 절차 명시) |
| 2026-05-08 | D-009 | Yjs 스냅샷 보존 정책 | **일별 1개 + 직전 5개 롤링** (구현 메모는 [`DESIGN.md` § 17.3](DESIGN.md#173-d-009-스냅샷-보존-구현-메모)) | §6 (`y_doc_snapshot` 단일 컬럼 + `story_snapshots` 신규 테이블) |
| 2026-05-08 | D-EMAIL | 이메일 매직 링크 활성화 시점 | **Phase 9로 이동** (커스텀 도메인 + Resend DKIM/SPF와 묶음). MVP는 익명 트랙만 활성화. | §4, §5, §11 (Phase 1에서 email 활성 → Phase 9로 이동) |
| 2026-05-08 | D-010 | Realtime 드라이버 (O-008 해결) | **Supabase Realtime broadcast + presence** + tldraw store diff (last-write-wins). Yjs는 후속 마이그레이션. | §8 (Yjs + y-websocket 명시 → Supabase Realtime 채택) |
| 2026-05-11 | D-011 | 캔버스 색상 — **전체 도형 임의 색** | tldraw `shape.meta.customColor` 에 hex 저장, 각 ShapeUtil `.configure({ getCustomDisplayValues })` 로 렌더 override. `<Tldraw components={{StylePanel}}>` 로 HTML color picker section 추가. 구현 메모는 [`DESIGN.md` § 17.5](DESIGN.md#175-d-011-임의-색상-지원-구현-메모). | §5 ("색상·굵기 변경" Should 항목을 임의 색까지 확장) |

### A.2 미해결 결정 (Open)

| # | 항목 | 결정 시점 | 사용자 메모 |
| --- | --- | --- | --- |
| ~~O-008~~ | ~~Realtime 드라이버~~ | **D-010 으로 해결 (Supabase Realtime 채택)** | Phase 4 진입 시 결정 |
| O-009 | 썸네일 생성 방식 | Phase 2 또는 Phase 5 | "어느 부분을 말하는지 모르겠음" → README "결정 이력" 섹션에 용도 설명 보강됨 |
| O-012 | SSO 우선순위 (Google만 / Google+GitHub / 4종) | Phase 7 시작 전 | |
| O-013 | Google Workspace 통합 깊이 | Phase 8 시작 전 | |
| O-014 | 이메일 발신자 표기 (`noreply@` / `hello@` / `studio@`) | Phase 9 도메인 인증 시 | |
| O-015 | **채널 권한 시스템** (수정 권한 요청/부여, 알림 inbox, 익명/로그인 구분, 대표 이미지) | MVP 후 또는 인증 방식 결정 후 | C 그룹 검토했으나 D-EMAIL 뒤집기 필요 + 작업량 큼 → MVP Phase 5 다른 항목 우선. CLAUDE.md §5 의 "Could (확장)" 와 일관 |
| O-016 | **인증 방식 — 이메일 매직 링크 대신 다른 방식 검토** | O-012 결정과 함께 또는 Phase 7 | 사용자 명시 의사: "이메일 대신 다른 인증 방식". Google SSO 우선 여부는 O-012 와 묶어서 결정 |

### A.3 결정 이력 갱신 규칙

1. 새 결정이 확정되면 **D-NNN** 번호를 부여하고 A.1에 추가.
2. 동시에 [`README.md`](README.md) "📌 결정 이력" 표와 [`DESIGN.md`](DESIGN.md) § 17.1 표에도 같은 행을 추가.
3. 결정이 본문(§1~§13)의 명시 내용을 덮어쓰면 "본문 어느 절을 덮어쓰는가" 칼럼에 위치를 적는다.
4. 결정이 번복되면 기존 행을 그대로 두고(이력 보존) 새 D-NNN 행을 추가, 비고에 "D-XXX 대체"라고 기록.