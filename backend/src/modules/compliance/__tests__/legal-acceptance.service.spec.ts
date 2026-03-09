jest.mock('../../../prisma/tenant-scoping/tenant-context', () => ({
  withoutTenantScopingAsync: jest.fn((fn: () => unknown) => fn()),
}));

import { BadRequestException } from '@nestjs/common';
import { LegalAcceptanceService } from '../services/legal-acceptance.service';
import {
  CURRENT_PP_VERSION,
  CURRENT_TOS_VERSION,
} from '../legal.constants';
import { withoutTenantScopingAsync } from '../../../prisma/tenant-scoping/tenant-context';

function createMockPrisma() {
  return {
    legalAcceptance: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  } as any;
}

describe('LegalAcceptanceService', () => {
  let service: LegalAcceptanceService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createMockPrisma();
    service = new LegalAcceptanceService(prisma);
  });

  it('accept uses withoutTenantScopingAsync with explicit tenant filters', async () => {
    prisma.legalAcceptance.create.mockResolvedValue({
      id: 'legal-1',
      userId: 'user-1',
      tenantId: 'tenant-1',
      documentType: 'TOS',
      documentVersion: CURRENT_TOS_VERSION,
    });

    const result = await service.accept(
      'user-1',
      'tenant-1',
      'TOS',
      CURRENT_TOS_VERSION,
      '127.0.0.1',
      'Jest',
    );

    expect(withoutTenantScopingAsync).toHaveBeenCalledTimes(1);
    expect(prisma.legalAcceptance.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        documentType: 'TOS',
        documentVersion: CURRENT_TOS_VERSION,
        ipAddress: '127.0.0.1',
        userAgent: 'Jest',
      },
    });
    expect(result.id).toBe('legal-1');
  });

  it('hasAcceptedCurrentVersions runs legal checks inside tenant-bypass wrapper', async () => {
    prisma.legalAcceptance.findFirst
      .mockResolvedValueOnce({ id: 'tos-1' })
      .mockResolvedValueOnce({ id: 'pp-1' });

    const result = await service.hasAcceptedCurrentVersions('user-1', 'tenant-1');

    expect(result).toBe(true);
    expect(withoutTenantScopingAsync).toHaveBeenCalledTimes(1);
    expect(prisma.legalAcceptance.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        documentType: 'TOS',
        documentVersion: CURRENT_TOS_VERSION,
      },
      orderBy: { acceptedAt: 'desc' },
    });
    expect(prisma.legalAcceptance.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        documentType: 'PRIVACY_POLICY',
        documentVersion: CURRENT_PP_VERSION,
      },
      orderBy: { acceptedAt: 'desc' },
    });
  });

  it('getStatus returns current acceptance state inside tenant-bypass wrapper', async () => {
    prisma.legalAcceptance.findFirst
      .mockResolvedValueOnce({
        documentVersion: CURRENT_TOS_VERSION,
      })
      .mockResolvedValueOnce({
        documentVersion: CURRENT_PP_VERSION,
      });

    const result = await service.getStatus('user-1', 'tenant-1');

    expect(withoutTenantScopingAsync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      tosAccepted: true,
      tosVersion: CURRENT_TOS_VERSION,
      ppAccepted: true,
      ppVersion: CURRENT_PP_VERSION,
      currentTosVersion: CURRENT_TOS_VERSION,
      currentPpVersion: CURRENT_PP_VERSION,
    });
  });

  it('accept rejects invalid document types before touching Prisma', async () => {
    await expect(
      service.accept('user-1', 'tenant-1', 'INVALID', '1.0'),
    ).rejects.toThrow(BadRequestException);

    expect(withoutTenantScopingAsync).not.toHaveBeenCalled();
    expect(prisma.legalAcceptance.create).not.toHaveBeenCalled();
  });
});
