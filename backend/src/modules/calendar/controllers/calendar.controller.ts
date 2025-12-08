import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CalendarService, ListEventsFilters } from '../services/calendar.service';
import {
  CreateEventDto,
  UpdateEventDto,
  CreateCalendarDto,
  UpdateCalendarPreferencesDto,
  ListEventsQueryDto,
} from '../dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('calendar')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * List all calendars from all providers
   * GET /api/calendar/calendars
   */
  @Get('calendars')
  @SkipThrottle()
  async listCalendars(@Req() req: any) {
    const tenantId = req.user.tenantId;
    return this.calendarService.listCalendars(tenantId);
  }

  /**
   * Create a new calendar
   * POST /api/calendar/calendars
   */
  @Post('calendars')
  @HttpCode(HttpStatus.CREATED)
  async createCalendar(@Req() req: any, @Body() data: CreateCalendarDto) {
    const tenantId = req.user.tenantId;
    return this.calendarService.createCalendar(tenantId, data);
  }

  /**
   * Update calendar preferences (name, color)
   * PATCH /api/calendar/calendars/:providerId/:calendarId
   */
  @Patch('calendars/:providerId/:calendarId')
  async updateCalendarPreferences(
    @Req() req: any,
    @Param('providerId') providerId: string,
    @Param('calendarId') calendarId: string,
    @Body() data: UpdateCalendarPreferencesDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.calendarService.updateCalendarPreferences(tenantId, providerId, calendarId, data);
  }

  /**
   * List calendar events
   * GET /api/calendar/events
   */
  @Get('events')
  @SkipThrottle()
  async listEvents(@Req() req: any, @Query() query: ListEventsQueryDto) {
    const tenantId = req.user.tenantId;

    const filters: ListEventsFilters = {
      providerId: query.providerId,
      calendarId: query.calendarId,
      startTime: query.startTime ? new Date(query.startTime) : undefined,
      endTime: query.endTime ? new Date(query.endTime) : undefined,
      limit: query.limit,
      offset: query.offset,
    };

    return this.calendarService.listEvents(tenantId, filters);
  }

  /**
   * Get a single calendar event
   * GET /api/calendar/events/:id
   */
  @Get('events/:id')
  @SkipThrottle()
  async getEvent(@Req() req: any, @Param('id') eventId: string) {
    const tenantId = req.user.tenantId;
    return this.calendarService.getEvent(tenantId, eventId);
  }

  /**
   * Create a new calendar event
   * POST /api/calendar/events
   */
  @Post('events')
  @HttpCode(HttpStatus.CREATED)
  async createEvent(@Req() req: any, @Body() data: CreateEventDto) {
    const tenantId = req.user.tenantId;
    return this.calendarService.createEvent(tenantId, data);
  }

  /**
   * Update a calendar event
   * PATCH /api/calendar/events/:id
   */
  @Patch('events/:id')
  async updateEvent(
    @Req() req: any,
    @Param('id') eventId: string,
    @Body() data: UpdateEventDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.calendarService.updateEvent(tenantId, eventId, data);
  }

  /**
   * Delete a calendar event
   * DELETE /api/calendar/events/:id
   */
  @Delete('events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEvent(@Req() req: any, @Param('id') eventId: string) {
    const tenantId = req.user.tenantId;
    await this.calendarService.deleteEvent(tenantId, eventId);
  }

  /**
   * Trigger manual sync for a provider's calendars
   * POST /api/calendar/sync/:providerId
   */
  @Post('sync/:providerId')
  async syncProvider(@Req() req: any, @Param('providerId') providerId: string) {
    const tenantId = req.user.tenantId;

    // ✅ SECURITY: Verify provider ownership before syncing
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { tenantId: true },
    });

    if (!provider) {
      throw new ForbiddenException('Provider not found');
    }

    if (provider.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: You can only sync your own providers');
    }

    return this.calendarService.syncProvider(tenantId, providerId);
  }

  /**
   * List attachments for a calendar event
   * GET /api/calendar/events/:eventId/attachments
   */
  @Get('events/:eventId/attachments')
  @SkipThrottle()
  async listEventAttachments(@Req() req: any, @Param('eventId') eventId: string) {
    const tenantId = req.user.tenantId;
    return this.calendarService.listEventAttachments(tenantId, eventId);
  }

  /**
   * Get a specific attachment for a calendar event
   * Returns attachment metadata and download URL (if available)
   * GET /api/calendar/events/:eventId/attachments/:attachmentId
   */
  @Get('events/:eventId/attachments/:attachmentId')
  @SkipThrottle()
  async getEventAttachment(
    @Req() req: any,
    @Param('eventId') eventId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.calendarService.getEventAttachment(tenantId, eventId, attachmentId);
  }
}
