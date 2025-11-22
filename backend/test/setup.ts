/**
 * Jest Setup File
 * Runs before all tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRATION = '24h';
// Base64 encoded 32-byte key for AES-256 encryption
process.env.AES_SECRET_KEY = 'dGVzdC1hZXMtMjU2LXNlY3JldC1rZXktMzJjaGFycyE=';
// Use DATABASE_URL from env if provided, otherwise default to local dev DB
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://mailuser:mailpass@localhost:5432/mailagent';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.MISTRAL_API_KEY = '';

// Increase timeout for integration tests
jest.setTimeout(10000);

// Mock console.error to reduce noise in tests (optional)
// global.console.error = jest.fn();

// Global test utilities
global.testUtils = {
  generateMockUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    tenantId: 'test-tenant-id',
    role: 'user',
    firstName: 'Test',
    lastName: 'User',
  }),

  generateMockTenant: () => ({
    id: 'test-tenant-id',
    name: 'Test Tenant',
    slug: 'test-tenant',
    isActive: true,
  }),
};

// Extend Jest matchers (optional)
expect.extend({
  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid UUID`
          : `expected ${received} to be a valid UUID`,
    };
  },
});

// Declare global types
declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        generateMockUser: () => any;
        generateMockTenant: () => any;
      };
    }
  }

  namespace jest {
    interface Matchers<R> {
      toBeValidUUID(): R;
    }
  }
}
