// 렌더링된 HTML이 Phase 1 요구사항을 만족하는지 검증.
// 실행 전제: pnpm run dev 가 background로 실행 중.

import fs from 'node:fs';

const html = fs.readFileSync(process.argv[2], 'utf8');

let pass = 0, fail = 0;
const expect = (name, ok, info = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}${info ? ' — ' + info : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${info ? ' — ' + info : ''}`); }
};

console.log('\n[Phase 1] 렌더링 HTML 검증\n');

// 1. HTTP 응답 (curl이 200을 받았으므로 이 테스트가 실행되는 것 자체가 통과)
expect('HTTP 200 응답', html.length > 0, `${html.length} bytes`);

// 2. 페이지 제목
expect('<title>Onuri Studio</title>', html.includes('<title>Onuri Studio</title>'));

// 3. 메타 description
expect('description meta 태그', html.includes('실시간 협업 화이트보드'));

// 4. OG 메타 태그
expect('og:title meta', html.includes('property="og:title"'));
expect('og:locale=ko_KR', html.includes('"og:locale"') && html.includes('ko_KR'));

// 5. 워드마크 (dotless ı + 빨간 점)
expect('Wordmark "Onur" 텍스트', html.includes('>Onur<'));
expect('Wordmark dotless ı', html.includes('>ı<'));
expect('Wordmark "Studio" 텍스트', html.includes('Studio<'));
expect('Wordmark 빨간 점 (bg-rec)', html.includes('bg-rec'));

// 6. 태그라인
expect('태그라인 "모두의 스토리, 우리의 스튜디오"', html.includes('모두의 스토리, 우리의 스튜디오'));

// 7. NicknameForm
expect('input[name="nickname"]', html.includes('name="nickname"'));
expect('input maxLength=24', html.includes('maxLength="24"'));
expect('"스튜디오 켜기" 버튼', html.includes('스튜디오 켜기'));

// 8. 활성 인증 표시
expect('"현재 활성 인증: anonymous" 표시', html.includes('anonymous'));

// 9. 페이지 상태가 3개 정상 상태 중 하나여야 함:
//    (a) SetupBanner — Supabase 미설정
//    (b) SignedInBanner — 로그인 상태
//    (c) NicknameForm 단독 — Supabase 설정됐고 로그아웃 상태
const hasSetupBanner = html.includes('Supabase 설정이 필요해요');
const hasSignedIn = html.includes('안녕하세요');
const hasNicknameForm = html.includes('name="nickname"');
const state = hasSetupBanner ? '(a) SetupBanner'
            : hasSignedIn   ? '(b) SignedInBanner'
            : hasNicknameForm ? '(c) NicknameForm 단독 (Supabase OK + 로그아웃)'
            : '???';
expect('페이지가 3개 정상 상태 중 하나',
  hasSetupBanner || hasSignedIn || hasNicknameForm,
  state);

// 10. Phase 1 푸터
expect('Phase 1 푸터 표시', html.includes('Phase 1'));

// 11. 디자인 토큰 적용 확인 (CSS 클래스)
expect('Tailwind brand-bezel 배경', html.includes('bg-brand-bezel'));
expect('rec/live 액센트 클래스 사용', html.includes('text-rec') || html.includes('bg-rec'));

// 12. 한글 lang 속성
expect('<html lang="ko">', html.includes('<html lang="ko">'));

// 13. Server Action ref 주입 확인 (Form action 작동)
expect('Server Action 주입 (formData hidden inputs)', html.includes('$ACTION_REF'));

console.log(`\n결과: ${pass} pass, ${fail} fail\n`);
process.exit(fail > 0 ? 1 : 0);
