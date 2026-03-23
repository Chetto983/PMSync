import { TENANT_SCOPED_MODELS, COMPOSITE_PK_MODELS } from '../tenant-scoped-models';
import {
  getTenantIdFromContext,
  isTenantScopingBypassed,
  withoutTenantScoping,
  withoutTenantScopingAsync,
} from '../tenant-context';
import { TenantContextRequiredError } from '../tenant-scoping.extension';

// Mock the CorrelationContext used by getTenantIdFromContext
let mockTenantId: string | undefined;
jest.mock('../../../common/services/correlation-context.service', () => ({
  CorrelationContext: {
    getContext: () =>
      mockTenantId
        ? { correlationId: 'test', tenantId: mockTenantId, createdAt: Date.now() }
        : undefined,
  },
}));

describe('Tenant-Scoped Models', () => {
  it('includes all expected models with tenantId', () => {
    expect(TENANT_SCOPED_MODELS.has('Email')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('User')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('Contact')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('Folder')).toBe(true);
    expect(TENANT_SCOPED_MODELS.has('AiConversation')).toBe(true);
  });

  it('excludes models without tenantId', () => {
    expect(TENANT_SCOPED_MODELS.has('Tenant')).toBe(false);
    expect(TENANT_SCOPED_MODELS.has('AiMessage')).toBe(false);
    // voltagent_memory_* tables dropped (VoltAgent removed)
  });

  it('identifies composite PK models', () => {
    expect(COMPOSITE_PK_MODELS.has('Email')).toBe(true);
    expect(COMPOSITE_PK_MODELS.has('Folder')).toBe(true);
    expect(COMPOSITE_PK_MODELS.has('Contact')).toBe(true);
    expect(COMPOSITE_PK_MODELS.has('CalendarEvent')).toBe(true);
    expect(COMPOSITE_PK_MODELS.has('Embedding')).toBe(true);
    // Non-composite
    expect(COMPOSITE_PK_MODELS.has('User')).toBe(false);
    expect(COMPOSITE_PK_MODELS.has('Session')).toBe(false);
  });

  it('has correct count of tenant-scoped models', () => {
    // 43 models (ActionQueue removed, Reminder/TelegramLog/TelegramSettings added)
    expect(TENANT_SCOPED_MODELS.size).toBe(43);
  });
});

describe('Tenant Context', () => {
  beforeEach(() => {
    mockTenantId = undefined;
  });

  it('returns tenantId when context is active', () => {
    mockTenantId = 'tenant-abc';
    expect(getTenantIdFromContext()).toBe('tenant-abc');
  });

  it('returns undefined when no context is active', () => {
    mockTenantId = undefined;
    expect(getTenantIdFromContext()).toBeUndefined();
  });

  it('bypass is false by default', () => {
    expect(isTenantScopingBypassed()).toBe(false);
  });

  it('withoutTenantScoping sets bypass to true', () => {
    let bypassedInside = false;
    withoutTenantScoping(() => {
      bypassedInside = isTenantScopingBypassed();
    });
    expect(bypassedInside).toBe(true);
    // Outside the callback, bypass is off
    expect(isTenantScopingBypassed()).toBe(false);
  });

  it('withoutTenantScopingAsync sets bypass to true', async () => {
    let bypassedInside = false;
    await withoutTenantScopingAsync(async () => {
      bypassedInside = isTenantScopingBypassed();
    });
    expect(bypassedInside).toBe(true);
    expect(isTenantScopingBypassed()).toBe(false);
  });

  it('withoutTenantScopingAsync keeps bypass for lazy thenables', async () => {
    const lazyThenable = {
      then: (resolve: (value: boolean) => void) => {
        resolve(isTenantScopingBypassed());
      },
    } as unknown as Promise<boolean>;

    const bypassedInside = await withoutTenantScopingAsync(
      async () => lazyThenable,
    );

    expect(bypassedInside).toBe(true);
    expect(isTenantScopingBypassed()).toBe(false);
  });

  it('withoutTenantScoping returns the callback result', () => {
    const result = withoutTenantScoping(() => 42);
    expect(result).toBe(42);
  });

  it('nested withoutTenantScoping maintains bypass', () => {
    let innerBypassed = false;
    withoutTenantScoping(() => {
      withoutTenantScoping(() => {
        innerBypassed = isTenantScopingBypassed();
      });
    });
    expect(innerBypassed).toBe(true);
  });
});

describe('TenantContextRequiredError', () => {
  it('has descriptive message', () => {
    const err = new TenantContextRequiredError('Email', 'findMany');
    expect(err.message).toContain('Email.findMany');
    expect(err.message).toContain('withoutTenantScoping');
    expect(err.name).toBe('TenantContextRequiredError');
  });

  it('is instanceof Error', () => {
    const err = new TenantContextRequiredError('User', 'create');
    expect(err).toBeInstanceOf(Error);
  });
});
