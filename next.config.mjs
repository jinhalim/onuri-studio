/** @type {import('next').NextConfig} */
const nextConfig = {
  // StrictMode를 dev에서 끄는 이유:
  // Supabase Realtime 채널이 mount → 즉시 unmount → 재mount 사이클에서
  // unsubscribe → re-subscribe 가 너무 빠르게 일어나 채널이 CLOSED 상태로
  // 갇히는 문제 발생. Phase 4 안정화 후 ref-counted channel registry 패턴으로
  // 재활성 검토. prod 빌드는 영향 없음 (StrictMode 자체가 dev 전용).
  reactStrictMode: false,
  // 참고: experimental.typedRoutes 는 동적 라우트와의 호환성 문제로 비활성.
  // 라우트 안전성은 lib/config/urls.ts 의 헬퍼 함수로 보장한다.
};

export default nextConfig;
