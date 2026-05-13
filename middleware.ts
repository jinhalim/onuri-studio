import { NextResponse, type NextRequest } from 'next/server';

// D-014: 미인증 사용자가 메인(/) 외 URL 로 직접 접근하면 메인페이지로 redirect
// + `?next=원래URL` 로 보존. 메인페이지의 NicknameForm 이 가입 후 next 로 이동.
//
// 인증 판정: 익명 쿠키 (`onuri_anon`) 또는 Supabase JWT (`sb-...`) 둘 중 하나라도
// 있으면 통과. 정밀 검증은 page/action 에서 다시 수행 (middleware 는 Edge runtime).
//
// public 경로 (auth/callback, setup-nickname, _next, static, api 등) 는 통과.

const ANON_COOKIE = 'onuri_anon';

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 메인페이지 + 인증 흐름 + Next 정적 자원은 항상 통과
  if (
    pathname === '/' ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/') ||
    pathname === '/favicon.ico' ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next();
  }

  // 익명 쿠키
  const anonCookie = req.cookies.get(ANON_COOKIE)?.value;
  if (anonCookie) return NextResponse.next();

  // Supabase JWT 쿠키는 'sb-' prefix 사용. 정확한 이름은 인스턴스마다 달라서
  // prefix 매칭으로 존재 여부만 확인 (값 검증은 page 단에서).
  const hasSbCookie = req.cookies.getAll().some((c) => c.name.startsWith('sb-'));
  if (hasSbCookie) return NextResponse.next();

  // 미인증 → 메인페이지로 redirect (next 보존)
  const url = req.nextUrl.clone();
  url.pathname = '/';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

// matcher: 위 코드의 분기를 다 통과시키지만, 명시적으로 빠를 수 있게 한 번 더 거름.
export const config = {
  matcher: [
    /*
     * 모든 경로에 적용하되 다음은 제외:
     * - api routes
     * - _next/static (정적 자원)
     * - _next/image (이미지 최적화)
     * - favicon.ico
     * - 확장자 있는 파일 (.svg, .png 등)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
