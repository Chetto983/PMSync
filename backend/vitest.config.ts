import 'dotenv/config'; // Load .env before tests run (MISTRAL_API_KEY, etc.)

// MSW test infrastructure: src/test/setup.ts exports mswServer
// Import in test files for deterministic (non-real-API) responses.
// See src/test/msw-streaming.test.ts for usage pattern.

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.test.ts'],
    // .spec.ts stays with Jest -- no overlap
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2021',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
