# Onuri Studio — 핸드오프 노트

> 새 Claude 세션 / 다른 계정 / 다른 PC 에서 작업을 이어갈 때 첫 참조 문서.
> 본 파일은 **현재 시점의 단편** — Decision Log SSOT 는 [`CLAUDE.md` 부록 A](CLAUDE.md), [`DESIGN.md` § 17](DESIGN.md), [`README.md`](README.md) 가 담당.

마지막 갱신: 2026-05-14 (D-019 셀 스타일 mini-toolbar 까지 완료)
마지막 커밋: [`d99c8ad`](https://github.com/jinhalim/onuri-studio/commit/d99c8ad) — Table 셀별 텍스트 스타일

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

### ✅ 완료된 기능 (Phase 1~8b + D-019)

- **인증**: 익명 (닉네임만) + Google SSO. 익명 → Google 흡수 흐름.
- **채널 / 스토리 CRUD** + 마이페이지 + 관리자 페이지.
- **실시간 협업**: Supabase Realtime broadcast + presence (LWW). 정원 25명 cap.
- **화이트보드** (tldraw v5): 기본 도구 + 임의 색상 (`shape.meta.customColor`) + 라이트/다크 모드 + Frame 50% lighter fill.
- **D-015 수정 권한 요청**: 스토리 단위, 알림 inbox.
- **D-017 sync hardening**: smart autosave / non-destructive reconnect / throttle.
- **D-018 Google Drive 연동**: Picker SDK + drive.file scope + Shortcut + Workspace path. 양방향 rename + refresh 버튼.
- **D-019 표 도구**: TableShape (셀 편집 / 경계 드래그 / 행·열 추가·삭제 / 셀 병합 / 셀별 텍스트 스타일).
- **D-020 노트 작성자 z-index 동기화** (NoteAuthorLayer 제거 + 셰이프 내부 inline 렌더).

### 🔴 진행 중 / 사용자 검토 대기

| # | 항목 | 다음 단계 |
|---|---|---|
| **tldraw Hobby License** | 신청 안 됨 / 받지 못함 | https://tldraw.dev/community/license 에서 신청 → 받으면 Vercel env `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` 등록. **이거 없으면 production 배포에서 캔버스 5초 뒤 사라짐**. |
| O-009 썸네일 생성 | 미결정 | Channel Guide 의 스토리 카드 미리보기. tldraw `editor.getSvgString` 또는 `exportAs` 로 PNG. |
| O-014 이메일 발신자 표기 | Phase 9 도메인 인증 시 | `noreply@onuri.studio` 등. |

### 🟡 알려진 한계 (의도된 trade-off)

- 동시 편집 충돌: **last-write-wins** (CRDT 아님). 50명 운영 시 Yjs 마이그레이션 필요 ([§ 17.9](DESIGN.md#179-d-017-realtime-sync-hardening-구현-메모)).
- Drive 폴더 단위 share: `appNotAuthorizedToChild` 403 가능 (graceful, 사용자 부담 X — [`§ 17.10`](DESIGN.md#1710-d-018-google-drive-연동-구현-메모)).
- 표 셀 동시 편집: 같은 셀 동시 수정 시 LWW. 다른 셀은 안전.

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

## 🎯 다음 작업 후보 (우선순위순)

1. **tldraw Hobby License 신청 + 등록** — production 배포 가능해짐.
2. **Phase 9 준비**: `onuri.studio` 도메인 구매 검토 + Resend 도메인 인증.
3. **O-009 썸네일**: Channel Guide 카드 미리보기.
4. **채널/스토리 rename → Drive 폴더 rename 동기화** (D-018 deferred 항목).
5. **모바일 / 태블릿 종합 테스트** — 터치, 핀치 줌, 가로 모드.
6. **e2e 테스트 자동화** (Playwright) — 익명/Google 양 흐름.

---

## ⚠ 작업 재개 전 점검

오랜 휴식 후 돌아왔다면:
1. `git pull` — 다른 사람 작업 확인.
2. `pnpm install` — 의존성 업데이트.
3. `pnpm run typecheck` — 새 에러 없는지.
4. `pnpm run build` — production 빌드 통과 확인.
5. Supabase Dashboard → DB migration 적용 상태 확인.
6. tldraw / Next.js / Supabase SDK 메이저 업데이트 있었는지 changelog 확인.
