/**
 * Permission Taxonomy & IPolicyService Interface Tests
 *
 * Phase 35 Plan 02 -- Task 2 (TDD RED -> GREEN)
 * Tests: Permission enum coverage, value format, interface importability.
 */
import { describe, it, expect } from 'vitest';
import {
  Permission,
  POLICY_SERVICE,
} from '../interfaces/policy-service.interface';
import type {
  IPolicyService,
  PolicyEvaluation,
} from '../interfaces/policy-service.interface';

describe('Permission Taxonomy', () => {
  it('has at least 20 permission entries', () => {
    const values = Object.values(Permission);
    expect(values.length).toBeGreaterThanOrEqual(20);
  });

  it('covers all required resource domains', () => {
    const values = Object.values(Permission);

    // Email domain
    expect(values).toContain('email:read');
    expect(values).toContain('email:write');
    expect(values).toContain('email:delete');
    expect(values).toContain('email:send');

    // AI domain
    expect(values).toContain('ai:chat');
    expect(values).toContain('ai:briefing');
    expect(values).toContain('ai:triage');
    expect(values).toContain('ai:draft');
    expect(values).toContain('ai:runs:read');
    expect(values).toContain('ai:runs:export');

    // Calendar domain
    expect(values).toContain('calendar:read');
    expect(values).toContain('calendar:write');
    expect(values).toContain('calendar:delete');

    // Contacts domain
    expect(values).toContain('contacts:read');
    expect(values).toContain('contacts:write');
    expect(values).toContain('contacts:delete');
    expect(values).toContain('contacts:export');

    // Admin domain
    expect(values).toContain('admin:users');
    expect(values).toContain('admin:billing');
    expect(values).toContain('admin:audit');
    expect(values).toContain('admin:settings');
  });

  it('all values follow resource:action format (/^[a-z]+:[a-z:]+$/)', () => {
    const values = Object.values(Permission);
    const pattern = /^[a-z]+:[a-z:]+$/;

    for (const v of values) {
      expect(v, `Permission value "${v}" does not match pattern`).toMatch(pattern);
    }
  });
});

describe('IPolicyService interface', () => {
  it('POLICY_SERVICE symbol is defined', () => {
    expect(POLICY_SERVICE).toBeDefined();
    expect(typeof POLICY_SERVICE).toBe('symbol');
  });

  it('IPolicyService type is importable and has expected shape', () => {
    // Type-level check: compile-time verification that the interface exists
    // and has the expected methods. If this compiles, the interface is correct.
    const mockService: IPolicyService = {
      evaluate: async (_subjectId: string, _permission: Permission, _context?: Record<string, unknown>) => {
        return { allowed: true, requiredPermissions: [] } as PolicyEvaluation;
      },
      checkAll: async (_subjectId: string, _permissions: Permission[]) => {
        return new Map<Permission, boolean>();
      },
      listPermissions: async (_subjectId: string) => {
        return [] as Permission[];
      },
    };

    // Runtime assertions on the mock
    expect(mockService.evaluate).toBeDefined();
    expect(mockService.checkAll).toBeDefined();
    expect(mockService.listPermissions).toBeDefined();
  });
});
