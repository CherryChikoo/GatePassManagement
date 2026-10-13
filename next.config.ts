import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimize for faster navigation
  reactStrictMode: true,
  serverExternalPackages: ['@prisma/client'],
  
  // Production optimizations
  poweredByHeader: false,
  compress: true,
  
  // Disable prefetching on hover for instant navigation
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
    // Reuse recently visited pages from the client router cache, so switching
    // between sections is instant instead of a server round-trip every click.
    // Live data comes from the client store, which refreshes independently.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/**',
      },
    ],
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
