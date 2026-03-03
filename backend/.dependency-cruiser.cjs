// Phase 32 complete (2026-03-03): circular deps enforced at error severity with known-violations baseline
// Cross-module deep imports remain as warnings (separate reduction effort)
// Use `npm run dep:check` to validate, `npm run dep:baseline` to regenerate baseline

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-deep-imports',
      comment:
        'NestJS modules should import from barrel exports or module files, not internal paths. Phase 32 will reduce these violations.',
      severity: 'warn',
      from: { path: '^src/modules/([^/]+)' },
      to: {
        path: '^src/modules/([^/]+)/.+',
        pathNot: [
          '^src/modules/\\1/', // Same module is allowed
          '\\.module\\.ts$', // Module files are public API
          'index\\.ts$', // Barrel exports are public API
        ],
      },
    },
    {
      name: 'no-circular',
      comment:
        'Circular dependencies cause forwardRef usage. Error severity enforced in CI with known-violations baseline.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Files not imported by any other file (potential dead code).',
      severity: 'info',
      from: {
        orphan: true,
        pathNot: [
          '\\.module\\.ts$', // Module entry files are roots
          '\\.spec\\.ts$', // Test files are roots
          '\\.test\\.ts$', // Test files are roots
          'main\\.ts$', // App entry point
          '\\.config\\.', // Config files
          '\\.d\\.ts$', // Type declaration files
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)',
      },
    },
  },
};
