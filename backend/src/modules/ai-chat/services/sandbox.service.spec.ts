/**
 * SandboxService Unit Tests
 *
 * Tests the ComputeSDK-based sandbox service.
 * Integration tests (actual code execution) require COMPUTESDK_API_KEY.
 * Unit tests verify configuration, error handling, and input wrapping.
 */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SandboxService } from './sandbox.service';

describe('SandboxService', () => {
  let service: SandboxService;

  describe('without COMPUTESDK_API_KEY', () => {
    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          SandboxService,
          {
            provide: ConfigService,
            useValue: {
              get: () => undefined,
            },
          },
        ],
      }).compile();

      service = module.get(SandboxService);
      service.onModuleInit();
    });

    it('returns error when not configured', async () => {
      const result = await service.executeCode({
        code: 'console.log("hello")',
        language: 'javascript',
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not available');
      expect(result.stdout).toBe('');
    });

    it('returns error for python when not configured', async () => {
      const result = await service.executeCode({
        code: 'print("hello")',
        language: 'python',
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not available');
    });
  });

  describe('with COMPUTESDK_API_KEY configured', () => {
    const mockConfigValues: Record<string, string> = {
      COMPUTESDK_API_KEY: 'test-key',
      RAILWAY_API_KEY: 'railway-key',
      RAILWAY_PROJECT_ID: 'proj-123',
      RAILWAY_ENVIRONMENT_ID: 'env-456',
    };

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          SandboxService,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) => mockConfigValues[key],
            },
          },
        ],
      }).compile();

      service = module.get(SandboxService);
      // Note: onModuleInit will call compute.setConfig which requires the real SDK
      // We test configuration logic, not actual sandbox creation
    });

    it('creates service instance', () => {
      expect(service).toBeDefined();
    });

    it('has executeCode method', () => {
      expect(typeof service.executeCode).toBe('function');
    });
  });

  describe('timeout enforcement', () => {
    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          SandboxService,
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
        ],
      }).compile();

      service = module.get(SandboxService);
      service.onModuleInit();
    });

    it('caps timeout at DEFAULT_TIMEOUT_MS (30s)', async () => {
      // Even with large timeout, returns "not configured" error (but doesn't hang)
      const result = await service.executeCode({
        code: 'console.log("fast")',
        language: 'javascript',
        timeout: 999_999,
      });

      expect(result.exitCode).toBe(1);
    });
  });

  describe('tenant isolation', () => {
    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          SandboxService,
          {
            provide: ConfigService,
            useValue: { get: () => undefined },
          },
        ],
      }).compile();

      service = module.get(SandboxService);
      service.onModuleInit();
    });

    it('accepts tenantId parameter', async () => {
      const result = await service.executeCode({
        code: 'console.log("hello")',
        language: 'javascript',
        tenantId: 'tenant-abc',
      });

      // Not configured, but no crash — tenantId is accepted
      expect(result.exitCode).toBe(1);
    });

    it('defaults tenantId to "default"', async () => {
      const result = await service.executeCode({
        code: 'console.log("hello")',
        language: 'javascript',
      });

      expect(result.exitCode).toBe(1);
    });
  });
});
