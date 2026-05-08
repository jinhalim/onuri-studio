/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 참고: experimental.typedRoutes 는 동적 라우트와의 호환성 문제로 비활성.
  // 라우트 안전성은 lib/config/urls.ts 의 헬퍼 함수로 보장한다.
};

export default nextConfig;
