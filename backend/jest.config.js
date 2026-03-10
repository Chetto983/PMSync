module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/global-setup.ts',
  globalTeardown: '<rootDir>/test/global-teardown.ts',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Force exit after tests complete to handle open handles from API connections
  forceExit: true,
  testMatch: [
    '<rootDir>/src/**/*.spec.ts',
    '<rootDir>/test/**/*.spec.ts',
  ],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.spec.ts',
    '!src/**/index.ts',
    '!src/main.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // INFRA-05 target: 50%. Enforced on `npm test --coverage`. Phases 67-69 add tests to meet this.
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@nestjs|@prisma|imapflow|mailparser|isomorphic-ws|nanoid|@mistralai|@langchain|langchain|p-retry|@anthropic-ai)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^nanoid$': '<rootDir>/test/mocks/nanoid.mock.ts',
    '^jsdom$': '<rootDir>/test/mocks/jsdom.mock.ts',
    '^p-retry$': '<rootDir>/test/mocks/p-retry.mock.ts',
    '^is-network-error$': '<rootDir>/test/mocks/is-network-error.mock.ts',
    '^better-auth/node$': '<rootDir>/test/mocks/better-auth-node.mock.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.test.json',
    }],
  },
};
