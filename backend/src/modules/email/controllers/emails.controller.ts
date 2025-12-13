import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailsService, EmailListFilters } from '../services/emails.service';
import { EmailRetentionService } from '../services/email-retention.service';
import { EmailFetchService } from '../services/email-fetch.service';
import { EmailSendService } from '../services/email-send.service';
import { EmailCleanupService } from '../services/email-cleanup.service';
import { StorageService } from '../services/storage.service';
import {
  ReplyForwardEmailRequestDto,
  SendEmailRequestDto,
  type EmailAttachmentDto,
} from '../dto/send-email.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { IcsGeneratorService, CalendarResponseType } from '../../calendar/services/ics-generator.service';
import { ParsedCalendarInvite } from '../../calendar/services/ics-parser.service';
import { CalendarService } from '../../calendar/services/calendar.service';
import { ProviderConfig } from '@prisma/client';

/** Typed metadata for calendar events - used to safely access JSON fields */
interface CalendarEventMetadata {
  sequence?: number;
  [key: string]: unknown;
}

const decodeAttachments = (attachments?: EmailAttachmentDto[]) =>
  attachments?.map((attachment) => {
    const [, base64 = attachment.contentBase64] =
      attachment.contentBase64.split(',');

    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: Buffer.from(base64, 'base64'),
    };
  });

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailsController {
  private readonly maxEmailListLimit: number;

  constructor(
    private emailsService: EmailsService,
    private retentionService: EmailRetentionService,
    private fetchService: EmailFetchService,
    private emailSendService: EmailSendService,
    private cleanupService: EmailCleanupService,
    private storageService: StorageService,
    private prisma: PrismaService,
    private icsGenerator: IcsGeneratorService,
    private calendarService: CalendarService,
    private configService: ConfigService,
  ) {
    this.maxEmailListLimit = this.configService.get<number>('EMAIL_LIST_MAX_LIMIT') || 1000;
  }

  /**
   * GET /emails - List emails with pagination and filters
   */
  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'List emails', description: 'Get paginated list of emails with optional filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 50, max: 1000)' })
  @ApiQuery({ name: 'providerId', required: false, type: String, description: 'Filter by provider ID' })
  @ApiQuery({ name: 'folder', required: false, type: String, description: 'Filter by folder path (e.g., "Posta in arrivo")' })
  @ApiQuery({ name: 'specialUse', required: false, type: String, description: 'RFC 6154 folder type: INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE' })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean, description: 'Filter by read status' })
  @ApiQuery({ name: 'isStarred', required: false, type: Boolean, description: 'Filter by starred status' })
  @ApiQuery({ name: 'hasAttachments', required: false, type: Boolean, description: 'Filter emails with attachments' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search in subject, from, body' })
  @ApiQuery({ name: 'labelIds', required: false, type: String, description: 'Comma-separated label IDs' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filter from date (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filter to date (ISO 8601)' })
  @ApiResponse({ status: 200, description: 'Paginated list of emails' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listEmails(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('providerId') providerId?: string,
    @Query('folder') folder?: string,
    @Query('specialUse') specialUse?: string, // RFC 6154: aggregate by folder type
    @Query('isRead') isRead?: string,
    @Query('isStarred') isStarred?: string,
    @Query('hasAttachments') hasAttachments?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('subject') subject?: string,
    @Query('labelIds') labelIds?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.user.tenantId;

    // Validate and sanitize pagination parameters
    const parsedPage = page ? parseInt(page) : 1;
    const parsedLimit = limit ? parseInt(limit) : 50;

    // Security: Enforce maximum limit to prevent DOS attacks
    const MIN_PAGE = 1;

    if (parsedPage < MIN_PAGE) {
      throw new BadRequestException(`Page must be at least ${MIN_PAGE}`);
    }

    if (parsedLimit < 1) {
      throw new BadRequestException('Limit must be at least 1');
    }

    if (parsedLimit > this.maxEmailListLimit) {
      throw new BadRequestException(`Limit cannot exceed ${this.maxEmailListLimit}`);
    }

    const filters: EmailListFilters = {};
    if (folder) filters.folder = folder;
    if (specialUse) filters.specialUse = specialUse; // RFC 6154: aggregate by folder type
    if (isRead !== undefined) filters.isRead = isRead === 'true';
    if (isStarred !== undefined) filters.isStarred = isStarred === 'true';
    if (hasAttachments !== undefined) filters.hasAttachments = hasAttachments === 'true';
    if (search) filters.search = search;
    if (from) filters.from = from;
    if (to) filters.to = to;
    if (subject) filters.subject = subject;
    if (labelIds) filters.labelIds = labelIds.split(',').map(id => id.trim()).filter(Boolean);
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.emailsService.listEmails({
      tenantId,
      providerId,
      page: parsedPage,
      limit: parsedLimit,
      filters,
    });
  }

  /**
   * GET /emails/stats - Get email statistics
   */
  @Get('stats')
  @SkipThrottle()
  async getStats(@Req() req: any, @Query('providerId') providerId?: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getStats(tenantId, providerId);
  }

  /**
   * GET /emails/search - Search emails
   * Default limit: 20, Max limit: 100 (prevents large result sets)
   */
  @Get('search')
  @SkipThrottle()
  async searchEmails(
    @Req() req: any,
    @Query('q') query: string,
    @Query('providerId') providerId?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user.tenantId;
    const parsedLimit = limit ? Math.min(parseInt(limit) || 20, 100) : 20;
    const emails = await this.emailsService.searchEmails(
      tenantId,
      query,
      providerId,
      parsedLimit,
    );

    return { emails, limit: parsedLimit };
  }

  /**
   * GET /emails/conversations - Get conversation view (threaded emails)
   */
  @Get('conversations')
  async getConversations(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('providerId') providerId?: string,
    @Query('folder') folder?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getConversations({
      tenantId,
      providerId,
      folder,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  /**
   * GET /emails/thread/:threadId - Get all emails in a thread
   */
  @Get('thread/:threadId')
  async getThread(@Req() req: any, @Param('threadId') threadId: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getThread(threadId, tenantId);
  }

  /**
   * GET /emails/:id/calendar-invite - Get parsed calendar invite data
   */
  @Get(':id/calendar-invite')
  async getCalendarInvite(@Req() req: any, @Param('id') id: string) {
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

  /**
   * POST /emails/:id/calendar-invite/respond - Respond to calendar invite
   */
  @Post(':id/calendar-invite/respond')
  async respondToCalendarInvite(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { response: 'accept' | 'decline' | 'tentative' },
  ) {
    const tenantId = req.user.tenantId;
    const response = body.response?.toLowerCase();

    if (!['accept', 'decline', 'tentative'].includes(response)) {
      throw new BadRequestException('response must be one of: accept, decline, tentative');
    }

    const email = await this.prisma.email.findFirst({
      where: { id, tenantId, isDeleted: false },
      include: {
        provider: { select: { id: true, email: true, supportsCalendar: true, providerType: true } },
      },
    });

    if (!email || !email.calendarInviteData || !email.hasCalendarInvite) {
      throw new NotFoundException('Calendar invite not found for this email');
    }

    const invite = this.normalizeInvite(email.calendarInviteData as unknown as ParsedCalendarInvite);

    if (invite.method === 'CANCEL') {
      throw new BadRequestException('Cannot respond to a cancelled invitation');
    }
    const organizerEmail = invite.organizer?.email || this.extractEmailFromString(email.from);
    const attendeeEmail =
      email.provider?.email ||
      this.extractEmailFromString(req.user?.email) ||
      this.extractEmailFromString(email.to?.[0]);

    if (!organizerEmail) {
      throw new BadRequestException('Organizer email missing from calendar invite');
    }

    if (!attendeeEmail) {
      throw new BadRequestException('Unable to determine attendee email for response');
    }

    const responseMap: Record<string, CalendarResponseType> = {
      accept: 'ACCEPTED',
      decline: 'DECLINED',
      tentative: 'TENTATIVE',
    };

    const inviteStatusMap: Record<string, 'accepted' | 'declined' | 'tentative'> = {
      accept: 'accepted',
      decline: 'declined',
      tentative: 'tentative',
    };

    const replyIcs = this.icsGenerator.generateReply(
      invite,
      responseMap[response],
      attendeeEmail,
    );

    const readableResponse =
      response === 'accept' ? 'Accepted' : response === 'decline' ? 'Declined' : 'Tentative';
    const subject = invite.summary ? `Re: ${invite.summary}` : 'Meeting invitation response';
    const bodyText = `${readableResponse} invitation for "${invite.summary || 'meeting'}".`;
    const bodyHtml = `<p>${bodyText}</p>`;

    await this.emailSendService.sendEmail({
      tenantId,
      providerId: email.providerId,
      threadId: email.threadId ?? undefined,
      to: [organizerEmail],
      subject,
      bodyHtml,
      bodyText,
      inReplyTo: email.messageId ?? undefined,
      references: email.references ?? undefined,
      attachments: [
        {
          filename: 'response.ics',
          content: Buffer.from(replyIcs, 'utf-8'),
          contentType: 'text/calendar; method=REPLY; charset=UTF-8',
        },
      ],
    });

    let calendarEventId = email.calendarEventId || undefined;

    const shouldCreateEvent = (response === 'accept' || response === 'tentative') && email.provider?.supportsCalendar;
    if (shouldCreateEvent) {
      const existingEvent = await this.prisma.calendarEvent.findFirst({
        where: {
          tenantId,
          providerId: email.providerId,
          iCalUID: invite.uid,
        },
      });

      const attendees = invite.attendees?.map((a) => ({
        email: a.email,
        name: a.name,
      }));

      if (existingEvent) {
        const updated = await this.prisma.calendarEvent.update({
          where: { id: existingEvent.id },
          data: {
            title: invite.summary,
            description: invite.description,
            location: invite.location,
            startTime: invite.startTime,
            endTime: invite.endTime,
            isAllDay: !!invite.isAllDay,
            timeZone: invite.timezone || existingEvent.timeZone,
            attendees,
            status: 'confirmed',
            isCancelled: false,
            recurrence: invite.recurrence ?? [],
            metadata: {
              ...(existingEvent.metadata as Record<string, any> | null ?? {}),
              sequence: invite.sequence ?? 0,
            },
          },
        });
        calendarEventId = updated.id;
      } else {
        const created = await this.calendarService.createEvent(tenantId, {
          providerId: email.providerId,
          title: invite.summary,
          description: invite.description,
          location: invite.location,
          startTime: invite.startTime,
          endTime: invite.endTime,
          isAllDay: invite.isAllDay,
          timeZone: invite.timezone || 'UTC',
          attendees,
        });

        await this.prisma.calendarEvent.update({
          where: { id: created.id },
          data: {
            iCalUID: invite.uid,
            recurrence: invite.recurrence ?? [],
            metadata: { inviteUid: invite.uid, sequence: invite.sequence ?? 0 },
          },
        });

        calendarEventId = created.id;
      }
    }

    await this.prisma.email.update({
      where: { id },
      data: {
        calendarInviteStatus: inviteStatusMap[response],
        hasCalendarInvite: true,
        calendarEventId,
      },
    });

    return { success: true, status: inviteStatusMap[response] };
  }

  /**
   * GET /emails/:id - Get email by ID
   */
  @Get(':id')
  async getEmail(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getEmailById(id, tenantId);
  }

  /**
   * POST /emails/calendar-invite/send - Send a new meeting invitation (REQUEST)
   * Rate limited: 10 emails per minute per user to prevent spam/abuse
   */
  @Post('calendar-invite/send')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async sendCalendarInvite(
    @Req() req: any,
    @Body()
    body: {
      providerId: string;
      to: Array<{ email: string; name?: string }>;
      cc?: Array<{ email: string; name?: string }>;
      bcc?: Array<{ email: string; name?: string }>;
      summary: string;
      description?: string;
      location?: string;
      startTime: string | Date;
      endTime: string | Date;
      isAllDay?: boolean;
      timeZone?: string;
      recurrence?: string[];
      subject?: string;
    },
  ) {
    const tenantId = req.user.tenantId;
    if (!body.providerId || !body.to || body.to.length === 0) {
      throw new BadRequestException('providerId and at least one recipient are required');
    }

    const provider = await this.getProviderForTenant(tenantId, body.providerId);
    const organizerEmail = provider.email;

    const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@mailagent`;
    const eventData = {
      uid,
      summary: body.summary,
      description: body.description,
      location: body.location,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      isAllDay: body.isAllDay,
      timezone: body.timeZone,
      organizer: { email: organizerEmail, name: organizerEmail },
      attendees: body.to.map((a) => ({ email: a.email, name: a.name, rsvp: true })),
    };

    const icsContent = this.icsGenerator.generateRequest(eventData);
    const subject = body.subject || body.summary || 'Meeting invitation';
    const bodyText = `You are invited to "${body.summary}"`;
    const bodyHtml = `<p>You are invited to "<strong>${body.summary}</strong>".</p>`;

    const { messageId } = await this.emailSendService.sendEmail({
      tenantId,
      providerId: body.providerId,
      to: body.to.map((r) => r.email),
      cc: body.cc?.map((r) => r.email),
      bcc: body.bcc?.map((r) => r.email),
      subject,
      bodyHtml,
      bodyText,
      attachments: [
        {
          filename: 'invite.ics',
          content: Buffer.from(icsContent, 'utf-8'),
          contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
        },
      ],
    });

    const createdEvent = await this.calendarService.createEvent(tenantId, {
      providerId: body.providerId,
      title: body.summary,
      description: body.description,
      location: body.location,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      isAllDay: body.isAllDay,
      timeZone: body.timeZone || 'UTC',
      attendees: body.to.map((a) => ({ email: a.email, name: a.name })),
      reminders: undefined,
    });

    await this.prisma.calendarEvent.update({
      where: { id: createdEvent.id },
      data: {
        iCalUID: uid,
        recurrence: body.recurrence ?? [],
        metadata: { inviteUid: uid, sequence: 0, messageId },
      },
    });

    return { success: true, eventId: createdEvent.id, messageId };
  }

  /**
   * POST /emails/calendar-invite/:eventId/cancel - Send meeting cancellation (CANCEL)
   */
  @Post('calendar-invite/:eventId/cancel')
  async cancelCalendarInvite(
    @Req() req: any,
    @Param('eventId') eventId: string,
    @Body() body?: { reason?: string },
  ) {
    const tenantId = req.user.tenantId;

    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId, isDeleted: false },
      include: { provider: true },
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found');
    }

    if (!event.iCalUID) {
      throw new BadRequestException('Calendar event is missing iCalUID');
    }

    const provider = await this.getProviderForTenant(tenantId, event.providerId);
    const organizerEmail = provider.email;
    const attendees = Array.isArray(event.attendees) ? (event.attendees as Array<{ email: string; name?: string }>) : [];

    const parsed: ParsedCalendarInvite = {
      uid: event.iCalUID,
      method: 'CANCEL',
      sequence: ((event.metadata as CalendarEventMetadata | null)?.sequence ?? 0) + 1,
      summary: event.title,
      description: body?.reason || event.description || '',
      location: event.location || undefined,
      url: undefined,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      timezone: event.timeZone || undefined,
      recurrence: event.recurrence || [],
      organizer: { email: organizerEmail, name: organizerEmail },
      attendees: attendees.map((a) => ({
        email: a.email,
        name: a.name,
        status: 'NEEDS-ACTION',
        role: 'REQ-PARTICIPANT',
        rsvp: true,
      })),
      status: 'CANCELLED',
      created: event.createdAt,
      lastModified: event.updatedAt,
      rawIcs: '',
    };

    const icsContent = this.icsGenerator.generateCancel(parsed, body?.reason);
    const subject = `Cancelled: ${event.title}`;
    const bodyText = body?.reason || `The meeting "${event.title}" has been cancelled.`;
    const bodyHtml = `<p>${bodyText}</p>`;

    const { messageId } = await this.emailSendService.sendEmail({
      tenantId,
      providerId: event.providerId,
      to: attendees.map((a) => a.email),
      subject,
      bodyHtml,
      bodyText,
      attachments: [
        {
          filename: 'cancel.ics',
          content: Buffer.from(icsContent, 'utf-8'),
          contentType: 'text/calendar; method=CANCEL; charset=UTF-8',
        },
      ],
    });

    await this.prisma.calendarEvent.update({
      where: { id: event.id },
      data: {
        isCancelled: true,
        status: 'cancelled',
        metadata: {
          ...(event.metadata as Record<string, any> | null ?? {}),
          sequence: parsed.sequence,
          cancelMessageId: messageId,
        },
      },
    });

    // Best-effort provider cancel
    await this.calendarService.cancelEvent(tenantId, event.id, body?.reason);

    return { success: true, eventId: event.id, messageId };
  }

  /**
   * POST /emails/send - Send a new email
   * Rate limited: 10 emails per minute per user to prevent spam/abuse
   */
  @Post('send')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async sendEmail(@Req() req: any, @Body() body: SendEmailRequestDto) {
    const tenantId = req.user.tenantId;
    const { providerId, attachments, ...rest } = body;

    return this.emailSendService.sendEmail({
      tenantId,
      providerId,
      ...rest,
      attachments: decodeAttachments(attachments),
    });
  }

  /**
   * POST /emails/:id/reply - Reply to an email
   * Rate limited: 10 emails per minute per user to prevent spam/abuse
   */
  @Post(':id/reply')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async replyToEmail(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ReplyForwardEmailRequestDto,
  ) {
    const tenantId = req.user.tenantId;

    return this.emailSendService.replyToEmail(id, tenantId, {
      ...body,
      attachments: decodeAttachments(body.attachments),
    });
  }

  /**
   * POST /emails/:id/forward - Forward an email
   * Rate limited: 10 emails per minute per user to prevent spam/abuse
   */
  @Post(':id/forward')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async forwardEmail(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ReplyForwardEmailRequestDto,
  ) {
    const tenantId = req.user.tenantId;

    return this.emailSendService.forwardEmail(id, tenantId, {
      ...body,
      attachments: decodeAttachments(body.attachments),
    });
  }

  /**
   * PATCH /emails/:id - Update email flags
   */
  @Patch(':id')
  async updateEmail(
    @Req() req: any,
    @Param('id') id: string,
    @Body() data: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.updateEmail(id, tenantId, data);
  }

  /**
   * DELETE /emails/bulk - Bulk delete emails
   * IMPORTANT: Must come before @Delete(':id') to avoid route conflict
   */
  @Delete('bulk')
  async bulkDelete(
    @Req() req: any,
    @Body() data: { emailIds: string[] },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkDelete(data.emailIds, tenantId);
  }

  /**
   * DELETE /emails/:id - Delete email
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEmail(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    await this.emailsService.deleteEmail(id, tenantId);
  }

  /**
   * Create or update a draft (autosave)
   * POST /emails/drafts
   */
  @Post('drafts')
  async saveDraft(
    @Req() req: any,
    @Body()
    dto: {
      id?: string;
      providerId: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      attachments?: {
        filename: string;
        contentType: string;
        size?: number;
        contentBase64?: string;
      }[];
    },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.saveDraft(tenantId, dto);
  }

  /**
   * Get a draft by ID
   * GET /emails/drafts/:id
   */
  @Get('drafts/:id')
  async getDraft(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getDraft(id, tenantId);
  }

  /**
   * Delete a draft
   * DELETE /emails/drafts/:id
   */
  @Delete('drafts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDraft(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    await this.emailsService.deleteDraft(id, tenantId);
  }

  /**
   * PATCH /emails/bulk/read - Mark multiple emails as read/unread
   */
  @Patch('bulk/read')
  async bulkUpdateRead(
    @Req() req: any,
    @Body() data: { emailIds: string[]; isRead: boolean },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateRead(
      data.emailIds,
      tenantId,
      data.isRead,
    );
  }
  /**
   * PATCH /emails/bulk/star - Bulk star/unstar emails
   */
  @Patch('bulk/star')
  async bulkUpdateStar(
    @Req() req: any,
    @Body() data: { emailIds: string[]; isStarred: boolean },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateStarred(
      data.emailIds,
      tenantId,
      data.isStarred,
    );
  }

  /**
   * PATCH /emails/bulk/flag - Bulk flag/unflag emails (mark as important)
   */
  @Patch('bulk/flag')
  async bulkUpdateFlag(
    @Req() req: any,
    @Body() data: { emailIds: string[]; isFlagged: boolean },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateFlagged(
      data.emailIds,
      tenantId,
      data.isFlagged,
    );
  }

  /**
   * PATCH /emails/bulk/move - Bulk move emails to folder
   */
  @Patch('bulk/move')
  async bulkMoveToFolder(
    @Req() req: any,
    @Body() data: { emailIds: string[]; folder: string },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkMoveToFolder(
      data.emailIds,
      tenantId,
      data.folder,
    );
  }

  /**
   * PATCH /emails/bulk/labels/add - Bulk add labels to emails
   */
  @Patch('bulk/labels/add')
  async bulkAddLabels(
    @Req() req: any,
    @Body() data: { emailIds: string[]; labelIds: string[] },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkAddLabels(
      data.emailIds,
      tenantId,
      data.labelIds,
    );
  }

  /**
   * PATCH /emails/bulk/labels/remove - Bulk remove labels from emails
   */
  @Patch('bulk/labels/remove')
  async bulkRemoveLabels(
    @Req() req: any,
    @Body() data: { emailIds: string[]; labelIds: string[] },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkRemoveLabels(
      data.emailIds,
      tenantId,
      data.labelIds,
    );
  }

  /**
   * POST /emails/:id/fetch-archived - Fetch archived email from server
   */
  @Post(':id/fetch-archived')
  async fetchArchivedEmail(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.fetchService.fetchArchivedEmail(id, tenantId);
  }

  /**
   * POST /emails/maintenance/cleanup - Remove duplicates and purge deleted emails for current tenant
   */
  @Post('maintenance/cleanup')
  async runTenantCleanup(@Req() req: any) {
    if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
      throw new ForbiddenException('Administrator access required');
    }

    return this.cleanupService.runTenantMaintenance(req.user.tenantId);
  }

  /**
   * GET /emails/retention/stats - Get retention statistics for current tenant
   * SECURITY: Requires admin role, returns stats for user's tenant only
   */
  @Get('retention/stats')
  async getRetentionStats(@Req() req: any) {
    const tenantId = req.user.tenantId;

    // Require admin or super-admin role
    if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
      throw new ForbiddenException('Administrator access required for retention statistics');
    }

    return this.retentionService.getRetentionStats(tenantId);
  }

  /**
   * POST /emails/retention/run - Manually run retention policy
   * SECURITY: SUPER-ADMIN ONLY - Archives old emails for current tenant
   */
  @Post('retention/run')
  async runRetentionPolicy(@Req() req: any, @Body() data?: { retentionDays?: number }) {
    const tenantId = req.user.tenantId;

    // CRITICAL: Only super-admin can trigger retention policy
    if (req.user.role !== 'super-admin') {
      throw new ForbiddenException(
        'Super administrator access required to run retention policy',
      );
    }

    return this.retentionService.runManualRetention(tenantId, data?.retentionDays);
  }

  /**
   * GET /emails/:emailId/attachments/:attachmentId/download - Download attachment
   */
  @Get(':emailId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Req() req: any,
    @Res() res: any,
    @Param('emailId') emailId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const tenantId = req.user.tenantId;
    const attachment = await this.emailsService.getAttachmentDownloadUrl(emailId, attachmentId, tenantId);

    if (attachment.storageType === 's3' && attachment.storagePath) {
      const signedUrl = await this.storageService.getSignedDownloadUrl(attachment.storagePath);
      return res.redirect(signedUrl);
    }

    return res.status(400).json({ message: 'Invalid or unsupported storage configuration' });
  }

  /**
   * Normalize persisted invite JSON into ParsedCalendarInvite with Date instances
   */
  private normalizeInvite(inviteData: ParsedCalendarInvite): ParsedCalendarInvite {
    const toDate = (value?: string | Date | null) => (value ? new Date(value) : new Date());

    return {
      ...inviteData,
      startTime: toDate(inviteData.startTime),
      endTime: toDate(inviteData.endTime),
      created: inviteData.created ? new Date(inviteData.created) : undefined,
      lastModified: inviteData.lastModified ? new Date(inviteData.lastModified) : undefined,
      attendees: Array.isArray(inviteData.attendees)
        ? inviteData.attendees.map((attendee) => ({
            email: attendee.email,
            name: attendee.name,
            status: attendee.status || 'NEEDS-ACTION',
            role: attendee.role || 'REQ-PARTICIPANT',
            rsvp: attendee.rsvp !== false,
          }))
        : [],
      organizer: inviteData.organizer || { email: '' },
      rawIcs: inviteData.rawIcs || '',
    };
  }

  /**
   * Get provider for tenant ensuring calendar support
   */
  private async getProviderForTenant(tenantId: string, providerId: string): Promise<ProviderConfig> {
    const provider = await this.prisma.providerConfig.findFirst({
      where: { id: providerId, tenantId, isActive: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or inactive for tenant');
    }

    return provider;
  }

  /**
   * Extract email address from a string (e.g., "Name <email@example.com>")
   */
  private extractEmailFromString(value?: string | null): string | null {
    if (!value) return null;
    const match = value.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return match ? match[1].toLowerCase() : null;
  }
}
