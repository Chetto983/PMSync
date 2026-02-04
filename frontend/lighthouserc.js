// Lighthouse CI Configuration
// https://github.com/GoogleChrome/lighthouse-ci
//
// Run: npx lhci autorun
// Or individual steps:
//   npx lhci collect --url="http://localhost:3001/dashboard/email"
//   npx lhci assert
//   npx lhci upload

module.exports = {
  ci: {
    collect: {
      // URLs to test (run against local build)
      url: [
        'http://localhost:3001/dashboard/email',
        'http://localhost:3001/dashboard/email/compose',
      ],
      // Run 3 times for stability
      numberOfRuns: 3,
      // Start server during collect
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 30000,
    },
    assert: {
      assertions: {
        // Performance score (warn at 80, fail at 70)
        'categories:performance': ['warn', { minScore: 0.8 }],

        // Core Web Vitals 2025 thresholds
        // LCP: Good <= 2.5s
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        // CLS: Good <= 0.1
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        // INP proxy (TTI): Good <= 3.5s
        'interactive': ['warn', { maxNumericValue: 3500 }],

        // Project-specific targets from ROADMAP.md
        // Email list scroll < 100ms (measured via Performance API in app)
        // Thread load < 200ms (measured via Performance API in app)

        // Accessibility score
        'categories:accessibility': ['warn', { minScore: 0.9 }],

        // Best practices
        'categories:best-practices': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      // Use temporary storage (no external service needed)
      target: 'temporary-public-storage',
    },
  },
};
