import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CalendarController } from '../calendar.controller';

describe('CalendarController', () => {
  const tenantId = 'tenant-1';
  const req = { user: { tenantId } } as any;

  const buildController = () => {
    const calendarService = {
      listCalendars: jest.fn(),
      createCalendar: jest.fn(),
      updateCalendarPreferences: jest.fn(),
      deleteCalendar: jest.fn(),
      listEvents: jest.fn(),
      getEvent: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      syncProvider: jest.fn(),
      listEventAttachments: jest.fn(),
      getEventAttachment: jest.fn(),
    } as never;

    const conflictService = {
      detectConflicts: jest.fn(),
    } as never;

    const focusTimeService = {
      suggestFocusBlocks: jest.fn(),
    } as never;

    const meetingPrepService = {
      prepareMeeting: jest.fn(),
    } as never;

    const prisma = {
      providerConfig: { findUnique: jest.fn() },
      calendarEvent: { findFirst: jest.fn() },
      email: { findFirst: jest.fn() },
    } as never;

    const controller = new CalendarController(
      calendarService,
      conflictService,
      focusTimeService,
      meetingPrepService,
      prisma,
    );

    return {
      controller,
      calendarService,
      conflictService,
      focusTimeService,
      meetingPrepService,
      prisma,
    };
  };

  // ── CRUD ─────────────────────────────────────────────────────

  describe('listCalendars', () => {
    it('passes tenantId from request to service', async () => {
      const { controller, calendarService } = buildController();
      (calendarService.listCalendars as jest.Mock).mockResolvedValue({
        calendars: [],
        total: 0,
      });

      await controller.listCalendars(req);

      expect(calendarService.listCalendars).toHaveBeenCalledWith(tenantId);
    });
  });

  describe('listEvents', () => {
    it('builds filters from query and passes tenantId', async () => {
      const { controller, calendarService } = buildController();
      (calendarService.listEvents as jest.Mock).mockResolvedValue({
        events: [],
        total: 0,
      });

      const query = {
        providerId: 'p-1',
        startTime: '2026-03-01T00:00:00Z',
        endTime: '2026-03-31T23:59:59Z',
        limit: 10,
        offset: 0,
      };

      await controller.listEvents(req, query as any);

      expect(calendarService.listEvents).toHaveBeenCalledWith(tenantId, {
        providerId: 'p-1',
        calendarId: undefined,
        startTime: new Date('2026-03-01T00:00:00Z'),
        endTime: new Date('2026-03-31T23:59:59Z'),
        limit: 10,
        offset: 0,
      });
    });
  });

  describe('getEvent', () => {
    it('passes tenantId and eventId to service', async () => {
      const { controller, calendarService } = buildController();
      (calendarService.getEvent as jest.Mock).mockResolvedValue({ id: 'e-1' });

      await controller.getEvent(req, 'e-1');

      expect(calendarService.getEvent).toHaveBeenCalledWith(tenantId, 'e-1');
    });
  });

  describe('createEvent', () => {
    it('returns created event with tenantId isolation', async () => {
      const { controller, calendarService } = buildController();
      const eventData = { providerId: 'p-1', title: 'Standup', startTime: new Date(), endTime: new Date() };
      (calendarService.createEvent as jest.Mock).mockResolvedValue({ id: 'e-new', ...eventData });

      const result = await controller.createEvent(req, eventData as any);

      expect(calendarService.createEvent).toHaveBeenCalledWith(tenantId, eventData);
      expect(result).toHaveProperty('id', 'e-new');
    });
  });

  describe('updateEvent', () => {
    it('passes tenantId, eventId, and update data', async () => {
      const { controller, calendarService } = buildController();
      (calendarService.updateEvent as jest.Mock).mockResolvedValue({ id: 'e-1', title: 'Updated' });

      await controller.updateEvent(req, 'e-1', { title: 'Updated' } as any);

      expect(calendarService.updateEvent).toHaveBeenCalledWith(tenantId, 'e-1', { title: 'Updated' });
    });
  });

  describe('deleteEvent', () => {
    it('calls service with tenantId and eventId', async () => {
      const { controller, calendarService } = buildController();
      (calendarService.deleteEvent as jest.Mock).mockResolvedValue(undefined);

      await controller.deleteEvent(req, 'e-1');

      expect(calendarService.deleteEvent).toHaveBeenCalledWith(tenantId, 'e-1');
    });
  });

  // ── Sync ─────────────────────────────────────────────────────

  describe('syncProvider', () => {
    it('verifies provider ownership before syncing', async () => {
      const { controller, calendarService, prisma } = buildController();
      (prisma.providerConfig.findUnique as jest.Mock).mockResolvedValue({
        tenantId,
      });
      (calendarService.syncProvider as jest.Mock).mockResolvedValue({ synced: true });

      await controller.syncProvider(req, 'p-1');

      expect(prisma.providerConfig.findUnique).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        select: { tenantId: true },
      });
      expect(calendarService.syncProvider).toHaveBeenCalledWith(tenantId, 'p-1');
    });

    it('throws ForbiddenException when provider belongs to another tenant', async () => {
      const { controller, prisma } = buildController();
      (prisma.providerConfig.findUnique as jest.Mock).mockResolvedValue({
        tenantId: 'other-tenant',
      });

      await expect(controller.syncProvider(req, 'p-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when provider not found', async () => {
      const { controller, prisma } = buildController();
      (prisma.providerConfig.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(controller.syncProvider(req, 'p-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ── AI / Intelligence ────────────────────────────────────────

  describe('getConflicts', () => {
    it('returns conflicts with date range', async () => {
      const { controller, conflictService } = buildController();
      (conflictService.detectConflicts as jest.Mock).mockResolvedValue([
        { overlapMinutes: 30, severity: 'soft' },
      ]);

      const result = await controller.getConflicts(
        req,
        '2026-03-01',
        '2026-03-31',
      );

      expect(conflictService.detectConflicts).toHaveBeenCalledWith(tenantId, {
        startDate: new Date('2026-03-01'),
        endDate: new Date('2026-03-31'),
      });
      expect(result).toEqual({
        success: true,
        conflicts: [{ overlapMinutes: 30, severity: 'soft' }],
        total: 1,
      });
    });

    it('handles empty calendar gracefully', async () => {
      const { controller, conflictService } = buildController();
      (conflictService.detectConflicts as jest.Mock).mockResolvedValue([]);

      const result = await controller.getConflicts(req);

      expect(result).toEqual({ success: true, conflicts: [], total: 0 });
    });
  });

  describe('getFocusTime', () => {
    it('passes parsed options to service', async () => {
      const { controller, focusTimeService } = buildController();
      (focusTimeService.suggestFocusBlocks as jest.Mock).mockResolvedValue([]);

      await controller.getFocusTime(req, '2026-03-15', '90');

      expect(focusTimeService.suggestFocusBlocks).toHaveBeenCalledWith(
        tenantId,
        {
          date: new Date('2026-03-15'),
          minDurationMinutes: 90,
        },
      );
    });
  });

  describe('getMeetingPrep', () => {
    it('passes tenantId and eventId', async () => {
      const { controller, meetingPrepService } = buildController();
      (meetingPrepService.prepareMeeting as jest.Mock).mockResolvedValue({
        eventId: 'e-1',
        title: 'Standup',
        attendees: [],
        suggestedAgenda: [],
      });

      const result = await controller.getMeetingPrep(req, 'e-1');

      expect(meetingPrepService.prepareMeeting).toHaveBeenCalledWith(
        tenantId,
        'e-1',
      );
      expect(result).toEqual({
        success: true,
        prep: expect.objectContaining({ eventId: 'e-1' }),
      });
    });
  });

  // ── Attachments ──────────────────────────────────────────────

  describe('listEventAttachments', () => {
    it('passes tenantId and eventId', async () => {
      const { controller, calendarService } = buildController();
      (calendarService.listEventAttachments as jest.Mock).mockResolvedValue({
        eventId: 'e-1',
        total: 0,
        attachments: [],
      });

      await controller.listEventAttachments(req, 'e-1');

      expect(calendarService.listEventAttachments).toHaveBeenCalledWith(
        tenantId,
        'e-1',
      );
    });
  });

  describe('getEventAttachment', () => {
    it('passes tenantId, eventId, and attachmentId', async () => {
      const { controller, calendarService } = buildController();
      (calendarService.getEventAttachment as jest.Mock).mockResolvedValue({
        id: 'a-1',
      });

      await controller.getEventAttachment(req, 'e-1', 'a-1');

      expect(calendarService.getEventAttachment).toHaveBeenCalledWith(
        tenantId,
        'e-1',
        'a-1',
      );
    });
  });

  // ── Source Email (RSVP link) ─────────────────────────────────

  describe('getEventSourceEmail', () => {
    it('returns emailId when linked email exists', async () => {
      const { controller, prisma } = buildController();
      (prisma.calendarEvent.findFirst as jest.Mock).mockResolvedValue({ id: 'e-1' });
      (prisma.email.findFirst as jest.Mock).mockResolvedValue({ id: 'email-1' });

      const result = await controller.getEventSourceEmail(req, 'e-1');

      expect(result).toEqual({ emailId: 'email-1' });
      expect(prisma.calendarEvent.findFirst).toHaveBeenCalledWith({
        where: { id: 'e-1', tenantId },
        select: { id: true },
      });
    });

    it('returns null emailId when no linked email', async () => {
      const { controller, prisma } = buildController();
      (prisma.calendarEvent.findFirst as jest.Mock).mockResolvedValue({ id: 'e-1' });
      (prisma.email.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await controller.getEventSourceEmail(req, 'e-1');

      expect(result).toEqual({ emailId: null });
    });

    it('throws NotFoundException when event not found', async () => {
      const { controller, prisma } = buildController();
      (prisma.calendarEvent.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.getEventSourceEmail(req, 'e-missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
