/**
 * Phase 148 Plan 05 Task 2 — Plumbing verification spec.
 *
 * W5 honesty note: this is a PLUMBING spec. Every dependency is mocked
 * (LabelAccuracyService, TenantGuard). It verifies the SEAMS between
 * TriageAccuracyController and its collaborators are wired correctly
 * (tenantId sourced from req.user, service arguments pass through,
 * response body is a 1:1 passthrough), NOT that an end-to-end request
 * through a running server + real DB + real Redis behaves correctly.
 * True end-to-end validation remains a Railway smoke test or the
 * frontend-side TanStack Query hook in Plan 06.
 *
 * Scenarios covered:
 *   1. cold-start — empty tenant returns empty labels array unchanged
 *   2. populated — service result passes through 1:1
 *   3. tenant isolation — tenantId sourced ONLY from req.user.tenantId,
 *      never from a query param or request body
 *   4. windows parser — "7d,all" produces ['7d','all']
 *   5. windows default — absent/empty -> ['7d','30d','all']
 *   6. includeBreakdown passthrough — boolean true forwarded to service
 */
import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import {
  TriageAccuracyController,
  GetLabelAccuracyQueryDto,
} from '../triage-accuracy.controller';
import { LabelAccuracyService } from '../../services/label-accuracy.service';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { AuthenticatedRequest } from '../../../../common/types/request.types';

describe('TriageAccuracyController (plumbing)', () => {
  let controller: TriageAccuracyController;
  let readMock: jest.Mock;

  beforeEach(async () => {
    readMock = jest.fn();
    const mod = await Test.createTestingModule({
      controllers: [TriageAccuracyController],
      providers: [
        { provide: LabelAccuracyService, useValue: { read: readMock } },
      ],
    })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: (_ctx: ExecutionContext) => true })
      .compile();

    controller = mod.get(TriageAccuracyController);
  });

  function mkReq(tenantId: string): AuthenticatedRequest {
    return { user: { tenantId } } as unknown as AuthenticatedRequest;
  }

  function mkQuery(
    overrides: Partial<GetLabelAccuracyQueryDto> = {},
  ): GetLabelAccuracyQueryDto {
    return {
      windows: undefined,
      includeBreakdown: undefined,
      ...overrides,
    } as GetLabelAccuracyQueryDto;
  }

  it('cold-start: returns empty labels array unchanged from service', async () => {
    const frozenAt = new Date().toISOString();
    readMock.mockResolvedValue({ labels: [], computedAt: frozenAt });

    const result = await controller.getLabelAccuracy(mkReq('t1'), mkQuery());

    expect(result).toEqual({ labels: [], computedAt: frozenAt });
    expect(readMock).toHaveBeenCalledTimes(1);
  });

  it('populated: passes service result through 1:1', async () => {
    const payload = {
      labels: [
        {
          labelId: 'L-work',
          labelName: 'Work',
          labelSlug: 'work',
          windows: {
            '30d': {
              precision: 0.91,
              recall: 0.84,
              f1: 0.87,
              tp: 40,
              fp: 4,
              fn: 8,
              sampleSize: 52,
              wilsonPrecLow: 0.78,
              wilsonPrecHigh: 0.97,
              wilsonRecLow: 0.7,
              wilsonRecHigh: 0.93,
              state: 'ready' as const,
            },
          },
          lastUpdatedAt: new Date().toISOString(),
        },
      ],
      computedAt: new Date().toISOString(),
    };
    readMock.mockResolvedValue(payload);

    const result = await controller.getLabelAccuracy(
      mkReq('t1'),
      mkQuery({ windows: '30d' }),
    );

    expect(result).toEqual(payload);
    expect(readMock).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ windows: ['30d'] }),
    );
  });

  it("tenant isolation: tenantId is sourced from req.user.tenantId, never from query", async () => {
    readMock.mockResolvedValue({
      labels: [],
      computedAt: new Date().toISOString(),
    });

    const req = mkReq('tenant-A');
    // Intentionally stuff a rogue tenantId on the query object; the controller
    // MUST ignore it and use req.user.tenantId only.
    const rogueQuery = {
      ...mkQuery(),
      tenantId: 'tenant-B',
    } as unknown as GetLabelAccuracyQueryDto;
    await controller.getLabelAccuracy(req, rogueQuery);

    expect(readMock).toHaveBeenCalledWith('tenant-A', expect.any(Object));
    const [tenantIdArg, optsArg] = readMock.mock.calls[0];
    expect(tenantIdArg).toBe('tenant-A');
    // Options object must NOT leak a tenantId property into the service call.
    expect(optsArg).not.toHaveProperty('tenantId');
  });

  it('parses windows="7d,all" into an array preserving order', async () => {
    readMock.mockResolvedValue({
      labels: [],
      computedAt: new Date().toISOString(),
    });
    await controller.getLabelAccuracy(
      mkReq('t1'),
      mkQuery({ windows: '7d,all' }),
    );
    expect(readMock).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ windows: ['7d', 'all'] }),
    );
  });

  it('defaults windows to [7d, 30d, all] when absent', async () => {
    readMock.mockResolvedValue({
      labels: [],
      computedAt: new Date().toISOString(),
    });
    await controller.getLabelAccuracy(mkReq('t1'), mkQuery());
    expect(readMock).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ windows: ['7d', '30d', 'all'] }),
    );
  });

  it('passes includeBreakdown=true through to service', async () => {
    readMock.mockResolvedValue({
      labels: [],
      computedAt: new Date().toISOString(),
    });
    await controller.getLabelAccuracy(
      mkReq('t1'),
      mkQuery({ includeBreakdown: true }),
    );
    expect(readMock).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({ includeBreakdown: true }),
    );
  });
});
