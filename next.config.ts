import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // 생성 그림(풍경·위조방지 무늬)은 같은 주소면 늘 같은 그림이라 오래 캐시한다
      { source: '/art/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
    ];
  },
};

export default config;
