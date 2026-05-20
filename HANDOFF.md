# Onuri Studio — 핸드오프 노트

> 새 Claude 세션 / 다른 계정 / 다른 PC 에서 작업을 이어갈 때 첫 참조 문서.
> 본 파일은 **현재 시점의 단편** — Decision Log SSOT 는 [`CLAUDE.md` 부록 A](CLAUDE.md), [`DESIGN.md` § 17](DESIGN.md), [`README.md`](README.md) 가 담당.

## 🛑 PROJECT STATUS: Portfolio Mode (Archived)

**활성 개발 종료.** 본 프로젝트는 포트폴리오 / 학습 / 개인 사용 목적으로만 유지됩니다. 상업화 unit economics 비현실적이라는 결론 — 자세히는 [`README.md` § 프로젝트 상태](README.md#-프로젝트-상태--portfolio--personal-use).

**새 세션에서 작업 재개 시 지침:**
- 🐛 **버그 fix / 본인 사용용 개선** → 진행 OK
- ✨ **신규 기능 / 수익화 작업** → 사용자에게 먼저 확인 (포트폴리오 모드 전환 후 활성 로드맵 없음)
- 📋 미해결 항목은 "TODO" 가 아니라 [`README.md` § 미래 후보](README.md#-미래-후보-future-candidates) 로 재분류

---

마지막 활성 갱신: 2026-05-14 (D-021 Google 연동 요청 workflow + Portfolio 모드 전환)

---

## 🚀 새 세션 부트스트랩 (30초)

```bash
git clone https://github.com/jinhalim/onuri-studio
cd onuri-studio
pnpm install
cp .env.example .env.local  # 그리고 아래 § "환경변수" 값 채우기
pnpm run dev
```

새 Claude 세션 첫 메시지:
> "HANDOFF.md, CLAUDE.md 부록 A, DESIGN.md § 17 읽고 현재 상태 파악해줘"

---

## 📦 현재 상태

### ✅ 완료된 기능 (Phase 1~8b + D-013~D-021)

- **인증**: 익명 (닉네임만) + Google SSO + D-021 등록 요청 workflow (testing 모드 영구).
- **채널 / 스토리 CRUD** + 마이페이지 + 관리자 페이지.
- **실시간 협업**: Supabase Realtime broadcast + presence (LWW). 정원 25명 cap.
- **화이트보드** (tldraw v5): 기본 도구 + 임의 색상 (`shape.meta.customColor`) + 라이트/다크 모드 + Frame 50% lighter fill.
- **D-015 수정 권한 요청**: 스토리 단위, 알림 inbox.
- **D-017 sync hardening**: smart autosave / non-destructive reconnect / throttle.
- **D-018 Google Drive 연동**: Picker SDK + drive.file scope + Shortcut + Workspace path. 양방향 rename + refresh 버튼.
- **D-019 표 도구**: TableShape (셀 편집 / 경계 드래그 / 행·열 추가·삭제 / 셀 병합 / 셀별 텍스트 스타일).
- **D-020 노트 작성자 z-index 동기화** (NoteAuthorLayer 제거 + 셰이프 내부 inline 렌더).
- **D-021 Google 연동 등록 요청 workflow** (testing 모드 영구 운영 — 사용자 신청 → admin 등록 → 알림).

### 🔮 미래 후보 (Future Candidates)

> 활성 로드맵 X. 만약 재시동 / 수익화 검토 시 재평가. 자세히는 [`README.md` § 미래 후보](README.md#-미래-후보-future-candidates).

가장 영향 큰 항목:
- **tldraw Hobby License 신청** — 안 받으면 production 캔버스 5초 뒤 사라짐 (`localhost` 는 정상)
- **WCAG AA + Lighthouse 점검** — Phase 6 미체크
- `/me` GoogleLinkSection 레이아웃 (D-021 미완료)
- Yjs CRDT 마이그레이션 (50명+ 필요 시)
- 상업 launch 시: 도메인 / 약관 / OAuth verification / 이메일 매직링크

### 🟡 알려진 한계 (의도된 trade-off)

- 동시 편집 충돌: **last-write-wins** (CRDT 아님). 50명 운영 시 Yjs 마이그레이션 필요 ([§ 17.9](DESIGN.md#179-d-017-realtime-sync-hardening-구현-메모)).
- Drive 폴더 단위 share: `appNotAuthorizedToChild` 403 가능 (graceful, 사용자 부담 X — [`§ 17.10`](DESIGN.md#1710-d-018-google-drive-연동-구현-메모)).
- 표 셀 동시 편집: 같은 셀 동시 수정 시 LWW. 다른 셀은 안전.
- Google OAuth testing 모드 100명 cap — D-021 workflow 로 admin 이 수동 등록.

---

## 🔑 환경변수 (.env.local)

| 변수 | 필수 | 어디서 받는지 |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ✅ | dev 는 `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 동일 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 동일 (서버 전용 — 절대 클라이언트 노출 X) |
| `GOOGLE_CLIENT_ID` | Google SSO | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client |
| `GOOGLE_CLIENT_SECRET` | Google SSO | 동일 |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | Drive 연동 | Google Cloud Console → APIs & Services → Credentials → API key |
| `NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER` | Drive 연동 | `GOOGLE_CLIENT_ID` 의 prefix 숫자 (예: `648962576577-xxx...` → `648962576577`) |
| `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` | production | tldraw.dev/community/license 신청 후 받음 |
| `RESEND_API_KEY` | Phase 9 | resend.com (이메일 매직링크 — MVP 미사용) |

> `.env.example` 에 모든 변수 + 설명 있음. dev 에서 미설정 시 setup banner 표시.

### 외부 서비스 설정 가이드

- **Supabase**: 프로젝트 생성 → migrations 실행 (`supabase/migrations/*.sql`). RLS 활성화 필수.
- **Google Cloud Console**: Drive API + Picker API 활성화 + OAuth consent screen 등록 + Test users 추가. 자세한 단계는 [`DESIGN.md` § 17.10](DESIGN.md#1710-d-018-google-drive-연동-구현-메모) 참조.
- **Vercel**: 환경변수 등록 (`NEXT_PUBLIC_*` 모두 + 서버 전용 키). preview/production 양쪽.

---

## 🏗 아키텍처 빠른 참조

```
app/                      # Next.js App Router (server / RSC)
  actions/                #   Server Actions (DB 호출)
  ch/[channelId]/         #   채널 / 스토리 페이지
  me/                     #   마이페이지
  admin/                  #   관리자
components/
  canvas/                 # tldraw 관련 (StudioCanvas, custom shapes, toolbar)
    customShapeUtils.ts   #   built-in shape util customization (.configure)
    customNoteShapeUtil   #   Note subclass (author 라벨 inline)
    gdriveShapeUtil       #   Drive 파일 shape
    tableShapeUtil        #   D-019 표 shape (병합 / 스타일 / 메뉴)
    CustomToolbar         #   하단 도구 모음 (70vw 확장 + 표 grid picker)
    CustomStylePanel      #   우측 스타일 패널 (드래그 + customColor)
  story/                  # 스토리 페이지 컴포넌트 (StoryWorkspace, GDrivePanel)
  ...
lib/
  editor/index.ts         # tldraw L1 abstraction — 모든 캔버스 코드는 여기서만 import
  client/                 #   client-only (gdrive picker / api / token)
  domain/                 #   domain types (channel, story, user, gdrive)
  hooks/                  #   useStoryRealtime / useChannelPresence / useUserNotifications
  infra/supabase/         #   supabase client (browser + server)
  usecases/               #   pure functions (parse-gdrive-url, assign-color, etc.)
supabase/migrations/      # DB 스키마 + RLS (0001 ~ 0012)
```

### tldraw L1 abstraction
- 모든 캔버스 코드는 `@/lib/editor` 에서만 import (직접 `from 'tldraw'` 금지).
- 미래 editor 교체 시 `lib/editor/index.ts` 에 동일 시그니처 adapter 만 만들면 swap 가능.
- 자세히: [`DESIGN.md` § 17.8`](DESIGN.md#178-editor-교체-대비-abstraction-가이드).

---

## 🐛 알려진 workaround (코드에 주석 있음)

| 위치 | 내용 |
|---|---|
| [`StudioCanvas.tsx` handleMount](components/canvas/StudioCanvas.tsx) | tldraw v5.0.0 의 `Editor.dispose` 가 `getInstanceState() === undefined` 시 throw → try/catch 로 wrap. |
| [`StudioCanvas.tsx` migrateTableShapesInSnapshot](components/canvas/StudioCanvas.tsx) | 옛 table snapshot 의 cellMerges/cellStyles 누락 보정 (loadSnapshot 전). |
| [`CustomToolbar.tsx` Portal](components/canvas/CustomToolbar.tsx) | OverflowingToolbar 의 boundary 도구가 main + overflow 양쪽에 렌더되는 quirk — grid picker 를 `createPortal(document.body)` 로 분리해서 어디서 hover 해도 동일 위치. |
| [`tableShapeUtil.tsx` canEdit](components/canvas/tableShapeUtil.tsx) | `canEdit() = true` 여야 `setEditingShape` 가 허용됨 — false 면 silent reject. |
| [`gdrive-api.ts` shareAnyoneWithLink graceful](lib/client/gdrive-api.ts) | 403 `appNotAuthorizedToChild` 는 catch 만 하고 흐름 진행. |
| [`gdrive-picker.ts` setAppId](lib/client/gdrive-picker.ts) | Picker 에 `setAppId(projectNumber)` 안 호출하면 drive.file scope 가 적용 안 돼 후속 API 404. |

---

## 🛠 자주 쓰는 명령어

```bash
pnpm run dev           # 개발 서버 (localhost:3000)
pnpm run typecheck     # tsc --noEmit
pnpm run lint          # next lint
pnpm run build         # 프로덕션 빌드 검증
pnpm run test          # vitest (있다면)

# Supabase 로컬 migration 적용 (Supabase CLI 필요)
supabase db push

# Git 흐름
git log --oneline -10
git status
```

---

## 📜 결정 이력 (Decision Log) 빠른 인덱스

확정된 결정 (D-NNN — 자세한 건 [`CLAUDE.md` 부록 A.1](CLAUDE.md) 또는 [`DESIGN.md` § 17.1](DESIGN.md)):

- D-001 ~ D-009: Phase 1 기본 결정 (도메인, 패키지매니저, UI 라이브러리, 색상 알고리즘 등)
- D-010 Realtime 드라이버 — Supabase Realtime broadcast
- D-011 임의 색상 — `shape.meta.customColor`
- D-012 라이트 모드 추가 — `data-theme` 분기
- D-013 Google SSO 활성화
- D-014 사용자 유형별 권한
- D-015 수정 권한 요청 / 승인
- D-016 tldraw Hobby License + Editor abstraction L1
- D-017 Realtime sync hardening + 25명 정원
- D-018 Google Drive 연동 (Phase 8a + 8b)
- **D-019** 표 도구 (TableShape + 셀 병합 + 셀별 스타일 + Toolbar 70vw)
- **D-020** 노트 작성자 라벨 z-index 동기화

미해결 (O-NNN):
- O-009 썸네일 생성 방식
- O-014 이메일 발신자 표기 (Phase 9)

---

## 🎯 만약 작업 재개한다면 (Future Candidates)

> 활성 우선순위 X (Portfolio Mode). 상황별로 가장 의미 있을 만한 후보:

**본인 사용 / 친구 공유 시 가장 가치 있는 것:**
1. **tldraw Hobby License 신청** — production 캔버스 정상 동작.

**상업 launch 시 재검토:**
2. 도메인 구매 + Phase 9 (이메일 매직링크 + 도메인 인증).
3. tldraw 상업 SDK License 구매 또는 Excalidraw 대안 swap.
4. 개인정보 처리방침 / 이용약관 / OAuth verification.

**기능 polish:**
5. O-009 Channel Guide 카드 썸네일.
6. 채널/스토리 rename → Drive 폴더 동기 rename (D-018 deferred).
7. 모바일 / 태블릿 종합 테스트 + WCAG AA + Lighthouse.
8. e2e 테스트 자동화 (Playwright).

---

## ⚠ 작업 재개 전 점검

오랜 휴식 후 돌아왔다면:
1. `git pull` — 다른 사람 작업 확인.
2. `pnpm install` — 의존성 업데이트.
3. `pnpm run typecheck` — 새 에러 없는지.
4. `pnpm run build` — production 빌드 통과 확인.
5. Supabase Dashboard → DB migration 적용 상태 확인.
6. tldraw / Next.js / Supabase SDK 메이저 업데이트 있었는지 changelog 확인.
