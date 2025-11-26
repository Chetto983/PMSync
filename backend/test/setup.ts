/**
 * Jest Setup File
 * Runs before all tests
 */

// Load .env file for integration tests that need real API keys
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Set test environment variables (don't override if already set from .env)
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRATION = process.env.JWT_EXPIRATION || '24h';
// Base64 encoded 32-byte key for AES-256 encryption
process.env.AES_SECRET_KEY = process.env.AES_SECRET_KEY || 'dGVzdC1hZXMtMjU2LXNlY3JldC1rZXktMzJjaGFycyE=';
// Use DATABASE_URL from env if provided, otherwise default to local dev DB
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://mailuser:mailpass@localhost:5432/mailagent';
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
// MISTRAL_API_KEY loaded from .env - don't override

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
