import path from 'node:path';

/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4100';

const nextConfig = {
  reactStrictMode: true,
  // Standalone emits a self-contained server bundle for the Docker runtime
  // stage, but it is incompatible with `next start` - so it is opt-in via
  // BUILD_STANDALONE, which docker/frontend.Dockerfile sets. Local `npm run
  // start` keeps working with the normal server.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
  // This is a multi-package repo with several lockfiles; pin the tracing root
  // so Next does not guess wrong when collecting files for the build.
  outputFileTracingRoot: path.join(process.cwd()),
  poweredByHeader: false,
  compress: true,
  images: {
    // Placeholder catalogue art is SVG; production images come from S3/Cloudinary.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Proxy API calls through the Next origin so auth cookies stay first-party.
      { source: '/api/proxy/:path*', destination: `${API_ORIGIN}/api/v1/:path*` },
      // Proxy uploaded media too. Image URLs are stored relative ("/static/..")
      // precisely so this works: next/image optimises server-side, and an
      // absolute "http://localhost:4100/.." is unreachable from inside the
      // frontend container, where localhost is the frontend itself. A relative
      // URL is same-origin for the optimiser and lands here.
      { source: '/static/:path*', destination: `${API_ORIGIN}/static/:path*` },
    ];
  },
};

export default nextConfig;
