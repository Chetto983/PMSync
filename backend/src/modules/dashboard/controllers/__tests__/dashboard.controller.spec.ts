import { DashboardController } from '../dashboard.controller';
import type { DashboardTodayService } from '../../services/dashboard-today.service';
import type { GetTodayQueryDto } from '../../dto/get-today-query.dto';

const buildController = () => {
  const dashboardTodayService = {
    getTodayFeed: jest.fn(),
  } as unknown as DashboardTodayService;
  const controller = new DashboardController(dashboardTodayService);
  return { controller, dashboardTodayService };
};

const fixtureResponse = {
  items: [],
  counts: { urgent: 0, today: 0, fyi: 0, total: 0 },
  greeting: null,
  generatedAt: '2026-04-16T12:00:00.000Z',
};

describe('DashboardController', () => {
  describe('getToday', () => {
    it('delegates to service with tenantId and userId from req.user', async () => {
      const { controller, dashboardTodayService } = buildController();
      (dashboardTodayService.getTodayFeed as jest.Mock).mockResolvedValue(
        fixtureResponse,
      );
      const req = { user: { id: 'userA', tenantId: 'tenantA' } } as never;
      await controller.getToday(req, {} as GetTodayQueryDto);
      expect(dashboardTodayService.getTodayFeed).toHaveBeenCalledWith(
        'tenantA',
        'userA',
        expect.any(Object),
      );
    });

    it('enforces tenant isolation — tenantA call passes tenantA, tenantB call passes tenantB', async () => {
      const { controller: cA, dashboardTodayService: sA } = buildController();
      const { controller: cB, dashboardTodayService: sB } = buildController();
      (sA.getTodayFeed as jest.Mock).mockResolvedValue(fixtureResponse);
      (sB.getTodayFeed as jest.Mock).mockResolvedValue(fixtureResponse);

      await cA.getToday(
        { user: { id: 'u1', tenantId: 'tenantA' } } as never,
        {} as GetTodayQueryDto,
      );
      await cB.getToday(
        { user: { id: 'u2', tenantId: 'tenantB' } } as never,
        {} as GetTodayQueryDto,
      );

      expect(sA.getTodayFeed).toHaveBeenCalledWith(
        'tenantA',
        'u1',
        expect.any(Object),
      );
      expect(sB.getTodayFeed).toHaveBeenCalledWith(
        'tenantB',
        'u2',
        expect.any(Object),
      );
      // Cross-tenant negative assertion
      expect(sA.getTodayFeed).not.toHaveBeenCalledWith(
        'tenantB',
        expect.anything(),
        expect.anything(),
      );
    });

    it('passes query opts through to service unchanged', async () => {
      const { controller, dashboardTodayService } = buildController();
      (dashboardTodayService.getTodayFeed as jest.Mock).mockResolvedValue(
        fixtureResponse,
      );
      const req = { user: { id: 'u', tenantId: 't' } } as never;
      const query = {
        locale: 'it',
        tz: 'Europe/Rome',
        includeGreeting: true,
      } as GetTodayQueryDto;
      await controller.getToday(req, query);
      expect(dashboardTodayService.getTodayFeed).toHaveBeenCalledWith('t', 'u', {
        locale: 'it',
        tz: 'Europe/Rome',
        includeGreeting: true,
      });
    });

    it('returns the service response unchanged', async () => {
      const { controller, dashboardTodayService } = buildController();
      (dashboardTodayService.getTodayFeed as jest.Mock).mockResolvedValue(
        fixtureResponse,
      );
      const result = await controller.getToday(
        { user: { id: 'u', tenantId: 't' } } as never,
        {} as GetTodayQueryDto,
      );
      expect(result).toBe(fixtureResponse);
    });
  });
});
