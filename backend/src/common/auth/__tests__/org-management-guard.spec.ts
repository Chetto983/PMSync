import { ForbiddenException } from '@nestjs/common';
import { OrgManagementGuard } from '../org-management.guard';

describe('OrgManagementGuard (ORG-05)', () => {
  let guard: OrgManagementGuard;

  beforeEach(() => {
    guard = new OrgManagementGuard();
  });

  const createMockContext = (user: any) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  it('should allow super-admin to access org management', () => {
    const ctx = createMockContext({ id: 'u1', role: 'super-admin' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should block admin users from org management', () => {
    const ctx = createMockContext({ id: 'u2', role: 'admin' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow(
      'Only super-admins can manage organizations',
    );
  });

  it('should block member users from org management', () => {
    const ctx = createMockContext({ id: 'u3', role: 'member' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when no user on request', () => {
    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Authentication required');
  });
});
