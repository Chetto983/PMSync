import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailCalendarInviteController } from '../email-calendar-invite.controller';

describe('EmailCalendarInviteController', () => {
  const tenantId = 'tenant-1';
  const req = { user: { tenantId, email: 'me@pmsync.local' } } as any;

  const buildController = () => {
    const emailSendService = {
      sendEmail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
    } as never;

    const prisma = {
      email: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      calendarEvent: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      providerConfig: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    } as never;

    const icsGenerator = {
      generateReply: jest.fn().mockReturnValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
      generateRequest: jest.fn().mockReturnValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
      generateCancel: jest.fn().mockReturnValue('BEGIN:VCALENDAR\r\nEND:VCALENDAR'),
    } as never;

    const calendarService = {
      createEvent: jest.fn().mockResolvedValue({ id: 'evt-new' }),
      cancelEvent: jest.fn().mockResolvedValue(undefined),
    } as never;

    const controller = new EmailCalendarInviteController(
      emailSendService,
      prisma,
      icsGenerator,
      calendarService,
    );

    return { controller, emailSendService, prisma, icsGenerator, calendarService };
  };

  const sampleInvite = {
    uid: 'uid-1',
    method: 'REQUEST',
    sequence: 0,
    summary: 'Team standup',
    description: 'Daily sync',
    startTime: '2026-03-20T09:00:00Z',
    endTime: '2026-03-20T09:30:00Z',
    isAllDay: false,
    organizer: { email: 'boss@example.com' },
    attendees: [{ email: 'me@pmsync.local', status: 'NEEDS-ACTION', role: 'REQ-PARTICIPANT', rsvp: true }],
    rawIcs: '',
  };

  // ── GET /:id/calendar-invite ─────────────────────────────────

  describe('getCalendarInvite', () => {
    it('returns normalized invite data', async () => {
      const { controller, prisma } = buildController();
      (prisma.email.findFirst as jest.Mock).mockResolvedValue({
        hasCalendarInvite: true,
        calendarInviteData: sampleInvite,
      });

      const result = await controller.getCalendarInvite(req, 'email-1');

      expect(result).toHaveProperty('uid', 'uid-1');
      expect(result).toHaveProperty('summary', 'Team standup');
      expect(result.startTime).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when email has no invite', async () => {
      const { controller, prisma } = buildController();
      (prisma.email.findFirst as jest.Mock).mockResolvedValue({
        hasCalendarInvite: false,
        calendarInviteData: null,
      });

      await expect(
        controller.getCalendarInvite(req, 'email-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when email not found', async () => {
      const { controller, prisma } = buildController();
      (prisma.email.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.getCalendarInvite(req, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /:id/calendar-invite/respond ────────────────────────

  describe('respondToCalendarInvite', () => {
    it('throws BadRequestException when response is missing', async () => {
      const { controller } = buildController();

      await expect(
        controller.respondToCalendarInvite(req, 'email-1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for invalid response value', async () => {
      const { controller, prisma } = buildController();
      (prisma.email.findFirst as jest.Mock).mockResolvedValue({
        hasCalendarInvite: true,
        calendarInviteData: sampleInvite,
        providerId: 'p-1',
        provider: { id: 'p-1', email: 'me@pmsync.local', supportsCalendar: true, providerType: 'google' },
      });

      await expect(
        controller.respondToCalendarInvite(req, 'email-1', {
          response: 'maybe' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when email has no invite data', async () => {
      const { controller, prisma } = buildController();
      (prisma.email.findFirst as jest.Mock).mockResolvedValue({
        hasCalendarInvite: false,
        calendarInviteData: null,
        providerId: 'p-1',
      });

      await expect(
        controller.respondToCalendarInvite(req, 'email-1', {
          response: 'accept',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when responding to a cancelled invite', async () => {
      const { controller, prisma } = buildController();
      const cancelledInvite = { ...sampleInvite, method: 'CANCEL' };
      (prisma.email.findFirst as jest.Mock).mockResolvedValue({
        hasCalendarInvite: true,
        calendarInviteData: cancelledInvite,
        providerId: 'p-1',
        from: 'boss@example.com',
        to: ['me@pmsync.local'],
        provider: { id: 'p-1', email: 'me@pmsync.local', supportsCalendar: true, providerType: 'google' },
      });

      await expect(
        controller.respondToCalendarInvite(req, 'email-1', {
          response: 'accept',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── POST /calendar-invite/send ───────────────────────────────

  describe('sendCalendarInvite', () => {
    it('throws BadRequestException when providerId missing', async () => {
      const { controller } = buildController();

      await expect(
        controller.sendCalendarInvite(req, {
          providerId: '',
          to: [{ email: 'a@b.com' }],
          summary: 'Test',
          startTime: new Date(),
          endTime: new Date(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no recipients', async () => {
      const { controller } = buildController();

      await expect(
        controller.sendCalendarInvite(req, {
          providerId: 'p-1',
          to: [],
          summary: 'Test',
          startTime: new Date(),
          endTime: new Date(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── POST /calendar-invite/:eventId/cancel ────────────────────

  describe('cancelCalendarInvite', () => {
    it('throws NotFoundException when event not found', async () => {
      const { controller, prisma } = buildController();
      (prisma.calendarEvent.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        controller.cancelCalendarInvite(req, 'e-missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when event has no iCalUID', async () => {
      const { controller, prisma } = buildController();
      (prisma.calendarEvent.findFirst as jest.Mock).mockResolvedValue({
        id: 'e-1',
        tenantId,
        iCalUID: null,
        providerId: 'p-1',
        provider: { id: 'p-1', email: 'me@pmsync.local', providerType: 'google' },
      });

      await expect(
        controller.cancelCalendarInvite(req, 'e-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
