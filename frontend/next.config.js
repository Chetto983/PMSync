const bundleAnalyzer = require('@next/bundle-analyzer');
const withSerwistInit = require('@serwist/next').default;

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const withSerwist = withSerwistInit({
  swSrc: 'sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  reloadOnOnline: false,
  cacheOnNavigation: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  images: {
    remotePatterns: [],
  },
  // Set both roots to this directory to prevent Vercel from tracing backend files
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
  // Skip static optimization for error pages to avoid SSR issues with MUI
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material', 'lucide-react'],
  },
  // Skip build errors for error pages (they work fine at runtime)
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow build to continue even with page errors
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Server-side component config - externalize client-only packages
  serverExternalPackages: ['dompurify'],
};

// Wrap with bundle analyzer (enabled via ANALYZE=true)
// Usage:
//   Unix/Mac: ANALYZE=true npm run build
//   Windows PowerShell: $env:ANALYZE="true"; npm run build
//   Windows CMD: set ANALYZE=true && npm run build
module.exports = withSerwist(withBundleAnalyzer(nextConfig));
