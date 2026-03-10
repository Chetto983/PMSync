/* eslint-disable @typescript-eslint/no-explicit-any */

// Mock better-auth.instance to break the import chain to better-auth
jest.mock('../better-auth.instance', () => ({
  getRequestIp: jest.fn(),
}));

// Mock tenant scoping
jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => any) => fn()),
}));

import { resolveEventType } from '../audit-hooks';
import * as fs from 'fs';
import * as path from 'path';

describe('Admin Plugin Configuration', () => {
  const instanceSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'better-auth.instance.ts'),
    'utf-8',
  );

  describe('admin plugin registration', () => {
    it('should import admin from better-auth/plugins', () => {
      expect(instanceSource).toMatch(
        /import\s*\{[^}]*admin[^}]*\}\s*from\s*['"]better-auth\/plugins['"]/,
      );
    });

    it('should call admin() in plugins array', () => {
      expect(instanceSource).toContain('admin({');
    });
  });

  describe('adminRoles configuration', () => {
    it('should use super-admin role (not admin)', () => {
      expect(instanceSource).toContain("adminRoles: ['super-admin']");
      expect(instanceSource).not.toMatch(/adminRoles:\s*\['admin'\]/);
    });
  });
});

describe('Admin Audit Path Mappings', () => {
  it('should map /admin/ban-user to AUTH:ADMIN_BAN', () => {
    expect(resolveEventType('/admin/ban-user')).toBe('AUTH:ADMIN_BAN');
  });

  it('should map /admin/unban-user to AUTH:ADMIN_UNBAN', () => {
    expect(resolveEventType('/admin/unban-user')).toBe('AUTH:ADMIN_UNBAN');
  });

  it('should map /admin/impersonate-user to AUTH:ADMIN_IMPERSONATE', () => {
    expect(resolveEventType('/admin/impersonate-user')).toBe(
      'AUTH:ADMIN_IMPERSONATE',
    );
  });

  it('should map /admin/stop-impersonating to AUTH:ADMIN_STOP_IMPERSONATE', () => {
    expect(resolveEventType('/admin/stop-impersonating')).toBe(
      'AUTH:ADMIN_STOP_IMPERSONATE',
    );
  });

  it('should map /admin/revoke-user-sessions to AUTH:ADMIN_REVOKE_SESSIONS', () => {
    expect(resolveEventType('/admin/revoke-user-sessions')).toBe(
      'AUTH:ADMIN_REVOKE_SESSIONS',
    );
  });

  it('should map /admin/revoke-user-session to AUTH:ADMIN_REVOKE_SESSION', () => {
    expect(resolveEventType('/admin/revoke-user-session')).toBe(
      'AUTH:ADMIN_REVOKE_SESSION',
    );
  });
});
