import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/infra/supabase/server';
import { createAdminClient } from '@/lib/infra/supabase/admin';
import { assignAnonymousColor } from '@/lib/usecases/assign-anonymous-color';
import { provisionOnboardingSample } from '@/lib/usecases/provision-onboarding-sample';
import { transferAnonymousToUser } from '@/lib/usecases/transfer-anonymous-to-user';

// Google OAuth (D-013) 콜백.
// 클라이언트가 supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback' } })
// 를 호출하면 Google 동의 → 이 URL 로 ?code=XXX 와 함께 리다이렉트.
//
// 처리 흐름:
// 1) code 를 Supabase JWT 세션으로 교환 (exchangeCodeForSession)
// 2) public.users mirror row 가 없으면 생성 — 단, 닉네임은 아직 미정 → /auth/setup-nickname 으로
// 3) public.users 가 이미 있으면 곧장 / 로 이동
// 4) 익명 cookie 가 있으면 익명 흔적을 Google 계정에 흡수 (transferAnonymousToUser)

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    console.error('[auth/callback] OAuth error:', errorParam);
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(errorParam)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    console.error('[auth/callback] exchange 실패:', error);
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  const authUser = data.user;
  if (!authUser) {
    return NextResponse.redirect(`${origin}/?auth_error=no_user`);
  }

  // public.users mirror 조회 (이미 있으면 기존 계정)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('users')
    .select('id, nickname')
    .eq('id', authUser.id)
    .maybeSingle();

  if (profile && profile.nickname) {
    // 이미 닉네임 있는 회원 — 익명 흡수 후 메인으로
    await transferAnonymousToUser(authUser.id).catch((err) => {
      console.error('[auth/callback] anon transfer 실패 (무시):', err);
    });
    return NextResponse.redirect(`${origin}/`);
  }

  // 신규 OAuth 가입 — mirror row 만들고 닉네임 입력 단계로
  if (!profile) {
    const color = assignAnonymousColor([]);
    const { error: insertError } = await admin.from('users').insert({
      id: authUser.id,
      email: authUser.email ?? null,
      // 닉네임은 임시로 빈 문자열 대신 user id 일부 → setup-nickname 이 update.
      // unique 충돌 방지 위해 fallback 도 unique 하게.
      nickname: `__pending_${authUser.id.slice(0, 8)}__`,
      color,
      primary_auth_provider: 'google',
      linked_providers: ['google'],
      is_anonymous: false,
      role: 'user',
    });
    if (insertError) {
      console.error('[auth/callback] public.users insert 실패:', insertError);
      return NextResponse.redirect(`${origin}/?auth_error=profile_insert_failed`);
    }
  }

  // 닉네임 입력 단계로 (Google displayName 을 placeholder 로 활용)
  const suggested = (authUser.user_metadata?.full_name || authUser.user_metadata?.name || '') as string;
  const url = new URL(`${origin}/auth/setup-nickname`);
  if (suggested) url.searchParams.set('suggested', suggested);
  return NextResponse.redirect(url);
}

// 이 route 가 onboarding 호출도 담당해야 하나? — 닉네임 확정 후에 호출하는 게 자연스러움 →
// /auth/setup-nickname 의 server action 에서 provisionOnboardingSample 호출.
void provisionOnboardingSample;
