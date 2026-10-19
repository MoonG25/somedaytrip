import type { NextConfig } from 'next';

// 모든 응답에 붙이는 보안 헤더
const SECURITY = [
  // 다른 사이트가 섬데트를 iframe으로 몰래 띄우지 못하게 (주인 버튼을 속여 누르게 하는 공격 방지)
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // 지도 타일·날씨·환율 같은 외부 서비스엔 사이트 주소만 (링크 공개 계획의 주소가 새지 않게)
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)' },
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY },
      // 생성 그림(풍경·위조방지 무늬)은 같은 주소면 늘 같은 그림이라 오래 캐시한다
      { source: '/art/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

export default config;
