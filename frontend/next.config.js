/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  images: {
    remotePatterns: [],
  },
  // Set turbopack root to this directory to silence lockfile warning
  turbopack: {
    root: __dirname,
  },
  // Skip static optimization for error pages to avoid SSR issues with MUI
  experimental: {
    optimizePackageImports: ['@mui/material', '@mui/icons-material'],
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

module.exports = nextConfig;
