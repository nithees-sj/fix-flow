import { resolve } from 'node:path';
import type { NextConfig } from 'next';

const apiInternal = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
const realtime = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4000';
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy. The app talks to its own origin (REST is proxied through the
 * rewrite below) plus the realtime endpoint for WebSockets.
 */
const realtimeWs = realtime.replace(/^http/, 'ws');
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${realtime} ${realtimeWs}${isDev ? ' ws://localhost:3000' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace from the monorepo root so workspace packages (@fixflow/shared) land in the standalone output.
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  poweredByHeader: false,
  devIndicators: false,
  agentRules: false,
  reactStrictMode: true,
  // Browser → same-origin /api/v1/* → API. Cookies stay first-party; no CORS needed for REST.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiInternal}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
