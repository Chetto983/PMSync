/**
 * Email Calendar Invite Controller
 * Handles: GET/POST calendar invite endpoints.
 * Extracted from EmailsController (Phase 43 god-file split).
 */
import { BadRequestException, Body, Controller, Get, Logger, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { EmailSendService } from '../services/email-send.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { IcsGeneratorService, CalendarResponseType } from '../../calendar/services/ics-generator.service';
import { ParsedCalendarInvite } from '../../calendar/services/ics-parser.service';
import { CalendarService } from '../../calendar/services/calendar.service';
import { ProviderConfig } from '@prisma/client';
import { AuthenticatedRequest } from '../../../common/types/request.types';

interface CalendarEventMetadata { sequence?: number; [key: string]: unknown; }

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
@UseGuards(TenantGuard, RolesGuard)
export class EmailCalendarInviteController {
  private readonly logger = new Logger(EmailCalendarInviteController.name);

  constructor(
    private emailSendService: EmailSendService,
    private prisma: PrismaService,
    private icsGenerator: IcsGeneratorService,
    private calendarService: CalendarService,
  ) {}

  @Get(':id/calendar-invite')
  async getCalendarInvite(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    const email = await this.prisma.email.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: { hasCalendarInvite: true, calendarInviteData: true },
    });
    if (!email || !email.hasCalendarInvite || !email.calendarInviteData) {
      throw new NotFoundException('Calendar invite not found for this email');
    }
    return this.normalizeInvite(email.calendarInviteData as unknown as ParsedCalendarInvite);
  }

  @Post(':id/calendar-invite/respond')
  @Roles('admin', 'manager')
  async respondToCalendarInvite(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { response: 'accept' | 'decline' | 'tentative' },
  ) {
    const tenantId = req.user.tenantId;
    if (!body?.response) throw new BadRequestException('response field is required');
    const response = body.response.toLowerCase();
    if (!['accept', 'decline', 'tentative'].includes(response)) {
      throw new BadRequestException('response must be one of: accept, decline, tentative');
    }

    const email = await this.prisma.email.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: { provider: { select: { id: true, email: true, supportsCalendar: true, providerType: true } } },
    });
    if (!email || !email.calendarInviteData || !email.hasCalendarInvite) {
      throw new NotFoundException('Calendar invite not found for this email');
    }

    const invite = this.normalizeInvite(email.calendarInviteData as unknown as ParsedCalendarInvite);
    if (invite.method === 'CANCEL') throw new BadRequestException('Cannot respond to a cancelled invitation');

    const organizerEmail = invite.organizer?.email || this.extractEmailFromString(email.from);
    const attendeeEmail = email.provider?.email || this.extractEmailFromString(req.user?.email) || this.extractEmailFromString(email.to?.[0]);
    if (!organizerEmail) throw new BadRequestException('Organizer email missing from calendar invite');
    if (!attendeeEmail) throw new BadRequestException('Unable to determine attendee email for response');

    const responseMap: Record<string, CalendarResponseType> = { accept: 'ACCEPTED', decline: 'DECLINED', tentative: 'TENTATIVE' };
    const inviteStatusMap: Record<string, 'accepted' | 'declined' | 'tentative'> = { accept: 'accepted', decline: 'declined', tentative: 'tentative' };

    const replyIcs = this.icsGenerator.generateReply(invite, responseMap[response], attendeeEmail);
    const readableResponse = response === 'accept' ? 'Accepted' : response === 'decline' ? 'Declined' : 'Tentative';
    const subject = invite.summary ? `Re: ${invite.summary}` : 'Meeting invitation response';
    const bodyText = `${readableResponse} invitation for "${invite.summary || 'meeting'}".`;

    await this.emailSendService.sendEmail({
      tenantId, providerId: email.providerId, threadId: email.threadId ?? undefined,
      to: [organizerEmail], subject, bodyHtml: `<p>${bodyText}</p>`, bodyText,
      inReplyTo: email.messageId ?? undefined, references: email.references ?? undefined,
      attachments: [{ filename: 'response.ics', content: Buffer.from(replyIcs, 'utf-8'), contentType: 'text/calendar; method=REPLY; charset=UTF-8' }],
    });

    let calendarEventId = email.calendarEventId || undefined;
    if ((response === 'accept' || response === 'tentative') && email.provider?.supportsCalendar) {
      const attendees = invite.attendees?.map((a) => ({ email: a.email, name: a.name }));
      calendarEventId = await this.prisma.$transaction(async (tx) => {
        const existingEvents = await tx.$queryRaw<Array<{ id: string; timeZone: string; metadata: unknown }>>`
          SELECT id, "timeZone", metadata FROM "calendar_events"
          WHERE "tenantId" = ${tenantId} AND "providerId" = ${email.providerId} AND "iCalUID" = ${invite.uid} FOR UPDATE`;
        if (existingEvents.length > 0) {
          const ev = existingEvents[0];
          const updated = await tx.calendarEvent.update({
            where: { id_tenantId: { id: ev.id, tenantId } },
            data: {
              title: invite.summary, description: invite.description, location: invite.location,
              startTime: invite.startTime, endTime: invite.endTime, isAllDay: !!invite.isAllDay,
              timeZone: invite.timezone || ev.timeZone, attendees, status: 'confirmed', isCancelled: false,
              recurrence: invite.recurrence ?? [],
              metadata: { ...((ev.metadata as Record<string, unknown> | null) ?? {}), sequence: invite.sequence ?? 0 },
            },
          });
          return updated.id;
        }
        const created = await this.calendarService.createEvent(tenantId, {
          providerId: email.providerId, title: invite.summary, description: invite.description,
          location: invite.location, startTime: invite.startTime, endTime: invite.endTime,
          isAllDay: invite.isAllDay, timeZone: invite.timezone || 'UTC', attendees,
        });
        await tx.calendarEvent.update({
          where: { id_tenantId: { id: created.id, tenantId } },
          data: { iCalUID: invite.uid, recurrence: invite.recurrence ?? [], metadata: { inviteUid: invite.uid, sequence: invite.sequence ?? 0 } },
        });
        return created.id;
      });
    }

    await this.prisma.email.update({
      where: { id_tenantId: { id, tenantId } },
      data: { calendarInviteStatus: inviteStatusMap[response], hasCalendarInvite: true, calendarEventId },
    });
    return { success: true, status: inviteStatusMap[response] };
  }

  @Post('calendar-invite/send')
  @Roles('admin', 'manager')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async sendCalendarInvite(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      providerId: string; to: Array<{ email: string; name?: string }>;
      cc?: Array<{ email: string; name?: string }>; bcc?: Array<{ email: string; name?: string }>;
      summary: string; description?: string; location?: string;
      startTime: string | Date; endTime: string | Date; isAllDay?: boolean;
      timeZone?: string; recurrence?: string[]; subject?: string;
    },
  ) {
    const tenantId = req.user.tenantId;
    if (!body.providerId || !body.to || body.to.length === 0) {
      throw new BadRequestException('providerId and at least one recipient are required');
    }
    const provider = await this.getProviderForTenant(tenantId, body.providerId);
    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@pmsync`;
    const eventData = {
      uid, summary: body.summary, description: body.description, location: body.location,
      startTime: new Date(body.startTime), endTime: new Date(body.endTime), isAllDay: body.isAllDay,
      timezone: body.timeZone, organizer: { email: provider.email, name: provider.email },
      attendees: body.to.map((a) => ({ email: a.email, name: a.name, rsvp: true })),
    };
    const icsContent = this.icsGenerator.generateRequest(eventData);
    const subject = body.subject || body.summary || 'Meeting invitation';
    const bodyText = `You are invited to "${body.summary}"`;
    const { messageId } = await this.emailSendService.sendEmail({
      tenantId, providerId: body.providerId,
      to: body.to.map((r) => r.email), cc: body.cc?.map((r) => r.email), bcc: body.bcc?.map((r) => r.email),
      subject, bodyHtml: `<p>You are invited to "<strong>${body.summary?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') ?? ''}</strong>".</p>`, bodyText,
      attachments: [{ filename: 'invite.ics', content: Buffer.from(icsContent, 'utf-8'), contentType: 'text/calendar; method=REQUEST; charset=UTF-8' }],
    });
    const createdEvent = await this.calendarService.createEvent(tenantId, {
      providerId: body.providerId, title: body.summary, description: body.description,
      location: body.location, startTime: new Date(body.startTime), endTime: new Date(body.endTime),
      isAllDay: body.isAllDay, timeZone: body.timeZone || 'UTC',
      attendees: body.to.map((a) => ({ email: a.email, name: a.name })), reminders: undefined,
    });
    await this.prisma.calendarEvent.update({
      where: { id_tenantId: { id: createdEvent.id, tenantId } },
      data: { iCalUID: uid, recurrence: body.recurrence ?? [], metadata: { inviteUid: uid, sequence: 0, messageId } },
    });
    return { success: true, eventId: createdEvent.id, messageId };
  }

  @Post('calendar-invite/:eventId/cancel')
  @Roles('admin', 'manager')
  async cancelCalendarInvite(
    @Req() req: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() body?: { reason?: string },
  ) {
    const tenantId = req.user.tenantId;
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId, isDeleted: false }, include: { provider: true },
    });
    if (!event) throw new NotFoundException('Calendar event not found');
    if (!event.iCalUID) throw new BadRequestException('Calendar event is missing iCalUID');

    const provider = await this.getProviderForTenant(tenantId, event.providerId);
    const attendees = Array.isArray(event.attendees) ? (event.attendees as Array<{ email: string; name?: string }>) : [];
    const parsed: ParsedCalendarInvite = {
      uid: event.iCalUID, method: 'CANCEL',
      sequence: ((event.metadata as CalendarEventMetadata | null)?.sequence ?? 0) + 1,
      summary: event.title, description: body?.reason || event.description || '',
      location: event.location || undefined, url: undefined,
      startTime: event.startTime, endTime: event.endTime, isAllDay: event.isAllDay,
      timezone: event.timeZone || undefined, recurrence: event.recurrence || [],
      organizer: { email: provider.email, name: provider.email },
      attendees: attendees.map((a) => ({ email: a.email, name: a.name, status: 'NEEDS-ACTION', role: 'REQ-PARTICIPANT', rsvp: true })),
      status: 'CANCELLED', created: event.createdAt, lastModified: event.updatedAt, rawIcs: '',
    };
    const icsContent = this.icsGenerator.generateCancel(parsed, body?.reason);
    const subject = `Cancelled: ${event.title}`;
    const bodyText = body?.reason || `The meeting "${event.title}" has been cancelled.`;
    const { messageId } = await this.emailSendService.sendEmail({
      tenantId, providerId: event.providerId, to: attendees.map((a) => a.email),
      subject, bodyHtml: `<p>${bodyText}</p>`, bodyText,
      attachments: [{ filename: 'cancel.ics', content: Buffer.from(icsContent, 'utf-8'), contentType: 'text/calendar; method=CANCEL; charset=UTF-8' }],
    });
    await this.prisma.calendarEvent.update({
      where: { id_tenantId: { id: event.id, tenantId } },
      data: {
        isCancelled: true, status: 'cancelled',
        metadata: { ...(event.metadata as Record<string, any> | null ?? {}), sequence: parsed.sequence, cancelMessageId: messageId },
      },
    });
    await this.calendarService.cancelEvent(tenantId, event.id, body?.reason);
    return { success: true, eventId: event.id, messageId };
  }

  private normalizeInvite(inviteData: ParsedCalendarInvite): ParsedCalendarInvite {
    const toDate = (value?: string | Date | null) => (value ? new Date(value) : new Date());
    return {
      ...inviteData,
      startTime: toDate(inviteData.startTime), endTime: toDate(inviteData.endTime),
      created: inviteData.created ? new Date(inviteData.created) : undefined,
      lastModified: inviteData.lastModified ? new Date(inviteData.lastModified) : undefined,
      attendees: Array.isArray(inviteData.attendees)
        ? inviteData.attendees.map((a) => ({ email: a.email, name: a.name, status: a.status || 'NEEDS-ACTION', role: a.role || 'REQ-PARTICIPANT', rsvp: a.rsvp !== false }))
        : [],
      organizer: inviteData.organizer || { email: '' }, rawIcs: inviteData.rawIcs || '',
    };
  }

  private async getProviderForTenant(tenantId: string, providerId: string): Promise<ProviderConfig> {
    const provider = await this.prisma.providerConfig.findFirst({ where: { id: providerId, tenantId, isActive: true } });
    if (!provider) throw new NotFoundException('Provider not found or inactive for tenant');
    return provider;
  }

  private extractEmailFromString(value?: string | null): string | null {
    if (!value) return null;
    const match = value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match ? match[1].toLowerCase() : null;
  }
}
