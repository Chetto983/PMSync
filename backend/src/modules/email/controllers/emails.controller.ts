import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { EmailsService, EmailListFilters } from '../services/emails.service';
import { EmailRetentionService } from '../services/email-retention.service';
import { EmailFetchService } from '../services/email-fetch.service';
import { EmailSendService } from '../services/email-send.service';
import { EmailCleanupService } from '../services/email-cleanup.service';
import { StorageService } from '../services/storage.service';
import { AttachmentOnDemandService } from '../services/attachment-on-demand.service';
import { EmailSignatureService } from '../services/email-signature.service';
import {
  ReplyEmailRequestDto,
  ForwardEmailRequestDto,
  SendEmailRequestDto,
  type EmailAttachmentDto,
} from '../dto/send-email.dto';
import {
  BulkDeleteDto,
  BulkUpdateReadDto,
  BulkUpdateStarDto,
  BulkUpdateFlagDto,
  BulkMoveToFolderDto,
  BulkLabelsDto,
} from '../dto/bulk-operations.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { IcsGeneratorService, CalendarResponseType } from '../../calendar/services/ics-generator.service';
import { ParsedCalendarInvite } from '../../calendar/services/ics-parser.service';
import { CalendarService } from '../../calendar/services/calendar.service';
import { ProviderConfig } from '@prisma/client';
import { AuthenticatedRequest } from '../../../common/types/request.types';

/** Typed metadata for calendar events - used to safely access JSON fields */
interface CalendarEventMetadata {
  sequence?: number;
  [key: string]: unknown;
}

// FIX (BUG-005): Validate attachment fields before processing
interface DecodedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

const decodeAttachments = (attachments?: EmailAttachmentDto[]): DecodedAttachment[] | undefined => {
  if (!attachments?.length) return undefined;

  return attachments
    .filter(att => att?.contentBase64 && att?.filename)
    .map((attachment) => {
      // Handle data URI format: "data:mime/type;base64,XXXX"
      const base64Data = attachment.contentBase64.includes(',')
        ? attachment.contentBase64.split(',')[1] || attachment.contentBase64
        : attachment.contentBase64;

      return {
        filename: attachment.filename,
        contentType: attachment.contentType || 'application/octet-stream',
        content: Buffer.from(base64Data, 'base64'),
      };
    });
};

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
@UseGuards(JwtAuthGuard, TenantGuard)
export class EmailsController {
  private readonly maxEmailListLimit: number;
  private readonly logger = new Logger(EmailsController.name);

  constructor(
    private emailsService: EmailsService,
    private retentionService: EmailRetentionService,
    private fetchService: EmailFetchService,
    private emailSendService: EmailSendService,
    private cleanupService: EmailCleanupService,
    private storageService: StorageService,
    private attachmentOnDemandService: AttachmentOnDemandService,
    private prisma: PrismaService,
    private icsGenerator: IcsGeneratorService,
    private calendarService: CalendarService,
    private configService: ConfigService,
    private signatureService: EmailSignatureService,
  ) {
    this.maxEmailListLimit = this.configService.get<number>('EMAIL_LIST_MAX_LIMIT') || 1000;
  }

  /**
   * GET /emails - List emails with pagination and filters
   * SECURITY FIX (2025-01-05): Removed @SkipThrottle - was enumeration attack vector
   */
  @Get()
  @ApiOperation({ summary: 'List emails', description: 'Get paginated list of emails with optional filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 50, max: 1000)' })
  @ApiQuery({ name: 'providerId', required: false, type: String, description: 'Filter by provider ID' })
  @ApiQuery({ name: 'folder', required: false, type: String, description: 'Filter by folder path (e.g., "Posta in arrivo")' })
  @ApiQuery({ name: 'specialUse', required: false, type: String, description: 'RFC 6154 folder type: INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE' })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean, description: 'Filter by read status' })
  @ApiQuery({ name: 'isStarred', required: false, type: Boolean, description: 'Filter by starred status' })
  @ApiQuery({ name: 'isFlagged', required: false, type: Boolean, description: 'Filter by flagged/important status' })
  @ApiQuery({ name: 'isImportant', required: false, type: Boolean, description: 'Filter emails that are starred OR flagged (important)' })
  @ApiQuery({ name: 'hasAttachments', required: false, type: Boolean, description: 'Filter emails with attachments' })
  @ApiQuery({ name: 'fromVip', required: false, type: Boolean, description: 'Filter emails from VIP contacts only' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search in subject, from, body' })
  @ApiQuery({ name: 'labelIds', required: false, type: String, description: 'Comma-separated label IDs' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filter from date (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filter to date (ISO 8601)' })
  @ApiQuery({ name: 'excludeTrashSpam', required: false, type: Boolean, description: 'SECURITY: Exclude emails from TRASH/SPAM/JUNK folders' })
  @ApiResponse({ status: 200, description: 'Paginated list of emails' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listEmails(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('providerId') providerId?: string,
    @Query('folder') folder?: string,
    @Query('specialUse') specialUse?: string, // RFC 6154: aggregate by folder type
    @Query('isRead') isRead?: string,
    @Query('isStarred') isStarred?: string,
    @Query('isFlagged') isFlagged?: string,
    @Query('isImportant') isImportant?: string,
    @Query('hasAttachments') hasAttachments?: string,
    @Query('fromVip') fromVip?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('subject') subject?: string,
    @Query('labelIds') labelIds?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('excludeTrashSpam') excludeTrashSpam?: string,
  ) {
    const tenantId = req.user.tenantId;

    // SEC-5 FIX: Validate and sanitize pagination parameters with NaN checks
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;

    // Security: Check for NaN values (parseInt returns NaN for non-numeric strings)
    if (isNaN(parsedPage) || isNaN(parsedLimit)) {
      throw new BadRequestException('Invalid pagination parameters: page and limit must be numbers');
    }

    // Security: Enforce minimum and maximum values to prevent DoS attacks
    const MIN_PAGE = 1;
    const MAX_PAGE = 10000; // Prevent excessive skip values causing database issues

    if (parsedPage < MIN_PAGE) {
      throw new BadRequestException(`Page must be at least ${MIN_PAGE}`);
    }

    if (parsedPage > MAX_PAGE) {
      throw new BadRequestException(`Page cannot exceed ${MAX_PAGE}`);
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
    if (isFlagged !== undefined) filters.isFlagged = isFlagged === 'true';
    if (isImportant !== undefined) filters.isImportant = isImportant === 'true';
    if (hasAttachments !== undefined) filters.hasAttachments = hasAttachments === 'true';
    if (fromVip !== undefined) filters.fromVip = fromVip === 'true';
    if (search) filters.search = search;
    if (from) filters.from = from;
    if (to) filters.to = to;
    if (subject) filters.subject = subject;
    if (labelIds) filters.labelIds = labelIds.split(',').map(id => id.trim()).filter(Boolean);
    if (startDate) {
      const parsedStartDate = new Date(startDate);
      if (Number.isNaN(parsedStartDate.getTime())) {
        throw new BadRequestException('Invalid startDate: must be a valid ISO 8601 date');
      }
      filters.startDate = parsedStartDate;
    }
    if (endDate) {
      const parsedEndDate = new Date(endDate);
      if (Number.isNaN(parsedEndDate.getTime())) {
        throw new BadRequestException('Invalid endDate: must be a valid ISO 8601 date');
      }
      filters.endDate = parsedEndDate;
    }
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      throw new BadRequestException('startDate cannot be after endDate');
    }
    // SECURITY: Parse excludeTrashSpam filter
    if (excludeTrashSpam !== undefined) filters.excludeTrashSpam = excludeTrashSpam === 'true';

    return this.emailsService.listEmails({
      tenantId,
      providerId,
      page: parsedPage,
      limit: parsedLimit,
      maxLimit: this.maxEmailListLimit,
      filters,
    });
  }

  /**
   * GET /emails/stats - Get email statistics
   * SECURITY FIX (2025-01-05): Removed @SkipThrottle - was enumeration attack vector
   */
  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest, @Query('providerId') providerId?: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getStats(tenantId, providerId);
  }

  /**
   * GET /emails/search - Search emails
   * Default limit: 20, Max limit: 100 (prevents large result sets)
   * SECURITY FIX (2025-01-05): Removed @SkipThrottle - was enumeration attack vector
   */
  @Get('search')
  async searchEmails(
    @Req() req: AuthenticatedRequest,
    @Query('q') query: string,
    @Query('providerId') providerId?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user.tenantId;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestException('Invalid limit: must be a positive number');
    }
    if (parsedLimit > 100) {
      throw new BadRequestException('Limit cannot exceed 100');
    }
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
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('providerId') providerId?: string,
    @Query('folder') folder?: string,
  ) {
    const tenantId = req.user.tenantId;
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    if (Number.isNaN(parsedPage) || Number.isNaN(parsedLimit)) {
      throw new BadRequestException('Invalid pagination parameters: page and limit must be numbers');
    }
    if (parsedPage < 1) {
      throw new BadRequestException('Page must be at least 1');
    }
    if (parsedLimit < 1) {
      throw new BadRequestException('Limit must be at least 1');
    }
    if (parsedLimit > this.maxEmailListLimit) {
      throw new BadRequestException(`Limit cannot exceed ${this.maxEmailListLimit}`);
    }
    return this.emailsService.getConversations({
      tenantId,
      providerId,
      folder,
      page: parsedPage,
      limit: parsedLimit,
    });
  }

  /**
   * GET /emails/thread/:threadId - Get all emails in a thread
   * RFC 6154: Always includes deleted emails (for trash folder access)
   */
  @Get('thread/:threadId')
  async getThread(@Req() req: AuthenticatedRequest, @Param('threadId') threadId: string) {
    const tenantId = req.user.tenantId;
    // Always include deleted emails - if user has thread ID, they can access it (trash view)
    const emails = await this.emailsService.getThread(threadId, tenantId, true);

    // Fetch body for archived/missing emails
    const emailsMissingBody = emails.filter((email) => !email.isBodyFetched);
    if (emailsMissingBody.length === 0) {
      return emails;
    }

    this.logger.debug(`Lazy loading body for ${emailsMissingBody.length}/${emails.length} emails in thread`);

    const fetchedEmails = await Promise.all(
      emailsMissingBody.map(async (email) => {
        try {
          return await this.fetchService.fetchArchivedEmail(email.id, tenantId);
        } catch (error) {
          this.logger.warn(
            `Failed to fetch missing body for thread email ${email.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return email;
        }
      }),
    );

    const fetchedMap = new Map(fetchedEmails.map((email) => [email.id, email]));
    return emails.map((email) => fetchedMap.get(email.id) ?? email);
  }

  /**
   * GET /emails/:id/calendar-invite - Get parsed calendar invite data
   */
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

  /**
   * POST /emails/:id/calendar-invite/respond - Respond to calendar invite
   */
  @Post(':id/calendar-invite/respond')
  async respondToCalendarInvite(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { response: 'accept' | 'decline' | 'tentative' },
  ) {
    const tenantId = req.user.tenantId;

    // FIX (BUG-004): Validate response field exists before processing
    if (!body?.response) {
      throw new BadRequestException('response field is required');
    }
    const response = body.response.toLowerCase();

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
      const attendees = invite.attendees?.map((a) => ({
        email: a.email,
        name: a.name,
      }));

      // FIX (RC-NEW-8): Use transaction with row-level lock to prevent duplicate calendar events
      calendarEventId = await this.prisma.$transaction(async (tx) => {
        // Check for existing event with lock to prevent race condition
        const existingEvents = await tx.$queryRaw<Array<{ id: string; timeZone: string; metadata: unknown }>>`
          SELECT id, "timeZone", metadata
          FROM "calendar_events"
          WHERE "tenantId" = ${tenantId}
            AND "providerId" = ${email.providerId}
            AND "iCalUID" = ${invite.uid}
          FOR UPDATE
        `;

        if (existingEvents.length > 0) {
          const existingEvent = existingEvents[0];
          const updated = await tx.calendarEvent.update({
            where: { id_tenantId: { id: existingEvent.id, tenantId } },
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
                ...((existingEvent.metadata as Record<string, unknown> | null) ?? {}),
                sequence: invite.sequence ?? 0,
              },
            },
          });
          return updated.id;
        }

        // Create new event (within transaction to prevent duplicate creation)
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

        await tx.calendarEvent.update({
          where: { id_tenantId: { id: created.id, tenantId } },
          data: {
            iCalUID: invite.uid,
            recurrence: invite.recurrence ?? [],
            metadata: { inviteUid: invite.uid, sequence: invite.sequence ?? 0 },
          },
        });

        return created.id;
      });
    }

    await this.prisma.email.update({
      where: { id_tenantId: { id, tenantId } },
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
   * RFC 6154: Always includes deleted emails (for trash folder access)
   */
  @Get(':id')
  async getEmail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    // Always include deleted emails - if user has ID, they can access it (trash view)
    const email = await this.emailsService.getEmailById(id, tenantId, true);

    // Fetch body for archived/missing emails
    if (!email.bodyHtml && !email.bodyText) {
      try {
        return await this.fetchService.fetchArchivedEmail(id, tenantId);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch missing body for email ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return email;
  }

  /**
   * POST /emails/calendar-invite/send - Send a new meeting invitation (REQUEST)
   * Rate limited: 10 emails per minute per user to prevent spam/abuse
   */
  @Post('calendar-invite/send')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async sendCalendarInvite(
    @Req() req: AuthenticatedRequest,
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
      where: { id_tenantId: { id: createdEvent.id, tenantId } },
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
    @Req() req: AuthenticatedRequest,
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
      where: { id_tenantId: { id: event.id, tenantId } },
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
  async sendEmail(@Req() req: AuthenticatedRequest, @Body() body: SendEmailRequestDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { providerId, attachments, signatureId, ...rest } = body;

    // Append signature to body if available
    let bodyHtml = rest.bodyHtml;
    const signature = await this.signatureService.getSignatureForSend(
      tenantId,
      userId,
      signatureId,
      providerId,
    );
    if (signature) {
      bodyHtml = `${bodyHtml}<br><br>${signature}`;
    }

    return this.emailSendService.sendEmail({
      tenantId,
      providerId,
      ...rest,
      bodyHtml,
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
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ReplyEmailRequestDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { signatureId, ...rest } = body;

    // Get original email to find providerId for signature lookup
    const originalEmail = await this.prisma.email.findFirst({
      where: { id, tenantId },
      select: { providerId: true },
    });

    // Append signature to body if available
    let bodyHtml = rest.bodyHtml;
    if (originalEmail) {
      const signature = await this.signatureService.getSignatureForSend(
        tenantId,
        userId,
        signatureId,
        originalEmail.providerId,
      );
      if (signature) {
        bodyHtml = `${bodyHtml}<br><br>${signature}`;
      }
    }

    return this.emailSendService.replyToEmail(id, tenantId, {
      ...rest,
      bodyHtml,
      attachments: decodeAttachments(rest.attachments),
    });
  }

  /**
   * POST /emails/:id/forward - Forward an email
   * Rate limited: 10 emails per minute per user to prevent spam/abuse
   * NOTE: For compose-forward (user edits content), frontend uses /send endpoint.
   * This endpoint is for quick API forwards. Signature is appended after forwarded content.
   */
  @Post(':id/forward')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async forwardEmail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ForwardEmailRequestDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { signatureId, ...rest } = body;

    // Get original email to find providerId for signature lookup
    const originalEmail = await this.prisma.email.findFirst({
      where: { id, tenantId },
      select: { providerId: true },
    });

    // Get signature content to pass to service (will be appended after forwarded content)
    let signatureContent: string | null = null;
    if (originalEmail) {
      signatureContent = await this.signatureService.getSignatureForSend(
        tenantId,
        userId,
        signatureId,
        originalEmail.providerId,
      );
    }

    return this.emailSendService.forwardEmail(id, tenantId, {
      ...rest,
      attachments: decodeAttachments(rest.attachments),
    }, signatureContent);
  }

  /**
   * PATCH /emails/:id - Update email flags
   */
  @Patch(':id')
  async updateEmail(
    @Req() req: AuthenticatedRequest,
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
    @Req() req: AuthenticatedRequest,
    @Body() data: BulkDeleteDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkDelete(data.emailIds, tenantId);
  }

  /**
   * DELETE /emails/:id - Delete email
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEmail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    await this.emailsService.deleteEmail(id, tenantId);
  }

  /**
   * Create or update a draft (autosave)
   * POST /emails/drafts
   */
  @Post('drafts')
  async saveDraft(
    @Req() req: AuthenticatedRequest,
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
  async getDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getDraft(id, tenantId);
  }

  /**
   * Delete a draft
   * DELETE /emails/drafts/:id
   */
  @Delete('drafts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    await this.emailsService.deleteDraft(id, tenantId);
  }

  /**
   * PATCH /emails/bulk/read - Mark multiple emails as read/unread
   */
  @Patch('bulk/read')
  async bulkUpdateRead(
    @Req() req: AuthenticatedRequest,
    @Body() data: BulkUpdateReadDto,
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
    @Req() req: AuthenticatedRequest,
    @Body() data: BulkUpdateStarDto,
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
    @Req() req: AuthenticatedRequest,
    @Body() data: BulkUpdateFlagDto,
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
    @Req() req: AuthenticatedRequest,
    @Body() data: BulkMoveToFolderDto,
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
    @Req() req: AuthenticatedRequest,
    @Body() data: BulkLabelsDto,
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
    @Req() req: AuthenticatedRequest,
    @Body() data: BulkLabelsDto,
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
  async fetchArchivedEmail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
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
  async runRetentionPolicy(@Req() req: AuthenticatedRequest, @Body() data?: { retentionDays?: number }) {
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
    @Req() req: AuthenticatedRequest,
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
    if (attachment.storageType === 'pending') {
      const result = await this.attachmentOnDemandService.downloadAttachment(attachmentId, tenantId);
      return res.redirect(result.url);
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
