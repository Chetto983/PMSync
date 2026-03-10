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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CalendarService, ListEventsFilters } from '../services/calendar.service';
import { CalendarConflictService } from '../services/calendar-conflict.service';
import { FocusTimeService } from '../services/focus-time.service';
import { MeetingPrepService } from '../services/meeting-prep.service';
import {
  CreateEventDto,
  UpdateEventDto,
  CreateCalendarDto,
  UpdateCalendarPreferencesDto,
  ListEventsQueryDto,
} from '../dto';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { PrismaService } from '../../../prisma/prisma.service';

@ApiTags('Calendar')
@ApiBearerAuth()
@Controller('calendar')
@UseGuards(TenantGuard)
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly calendarConflictService: CalendarConflictService,
    private readonly focusTimeService: FocusTimeService,
    private readonly meetingPrepService: MeetingPrepService,
    private readonly prisma: PrismaService,
  ) { }

  // ─── AI / Intelligence Endpoints ─────────────────────────────

  /**
   * Detect calendar scheduling conflicts
   * GET /api/calendar/conflicts
   */
  @Get('conflicts')
  @ApiOperation({ summary: 'Detect calendar scheduling conflicts' })
  @ApiResponse({ status: 200, description: 'Conflicts returned successfully' })
  async getConflicts(
    @Req() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.user.tenantId;
    const conflicts = await this.calendarConflictService.detectConflicts(
      tenantId,
      {
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    );
    return { success: true, conflicts, total: conflicts.length };
  }

  /**
   * Suggest focus time blocks
   * GET /api/calendar/focus-time
   */
  @Get('focus-time')
  @ApiOperation({ summary: 'Suggest focus time blocks' })
  @ApiResponse({ status: 200, description: 'Focus blocks returned successfully' })
  async getFocusTime(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('minDuration') minDuration?: string,
  ) {
    const tenantId = req.user.tenantId;
    const blocks = await this.focusTimeService.suggestFocusBlocks(
      tenantId,
      {
        date: date ? new Date(date) : undefined,
        minDurationMinutes: minDuration ? parseInt(minDuration, 10) : 60,
      },
    );
    return { success: true, blocks, total: blocks.length };
  }

  /**
   * Get pre-meeting briefing for a calendar event
   * GET /api/calendar/meeting-prep/:eventId
   */
  @Get('meeting-prep/:eventId')
  @ApiOperation({ summary: 'Get pre-meeting briefing for a calendar event' })
  @ApiParam({ name: 'eventId', description: 'Calendar event ID' })
  @ApiResponse({ status: 200, description: 'Meeting prep returned successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  async getMeetingPrep(
    @Req() req: any,
    @Param('eventId') eventId: string,
  ) {
    const tenantId = req.user.tenantId;
    const prep = await this.meetingPrepService.prepareMeeting(tenantId, eventId);
    return { success: true, prep };
  }

  // ─── Calendar Management Endpoints ─────────────────────────

  /**
   * List all calendars from all providers
   * GET /api/calendar/calendars
   */
  @Get('calendars')
  @ApiOperation({ summary: 'List all calendars', description: 'Returns all calendars from all providers' })
  @ApiResponse({ status: 200, description: 'Calendars returned successfully' })
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
  @ApiOperation({ summary: 'Create calendar', description: 'Creates a new calendar' })
  @ApiBody({ type: CreateCalendarDto })
  @ApiResponse({ status: 201, description: 'Calendar created successfully' })
  async createCalendar(@Req() req: any, @Body() data: CreateCalendarDto) {
    const tenantId = req.user.tenantId;
    return this.calendarService.createCalendar(tenantId, data);
  }

  /**
   * Update calendar preferences (name, color)
   * PATCH /api/calendar/calendars/:providerId/:calendarId
   */
  @Patch('calendars/:providerId/:calendarId')
  @ApiOperation({ summary: 'Update calendar preferences', description: 'Updates calendar name or color' })
  @ApiParam({ name: 'providerId', description: 'Provider ID' })
  @ApiParam({ name: 'calendarId', description: 'Calendar ID' })
  @ApiBody({ type: UpdateCalendarPreferencesDto })
  @ApiResponse({ status: 200, description: 'Calendar updated successfully' })
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
  @ApiOperation({ summary: 'List calendar events', description: 'Returns calendar events with filters' })
  @ApiResponse({ status: 200, description: 'Events returned successfully' })
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
  @ApiOperation({ summary: 'Get event by ID', description: 'Returns a single calendar event' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Event returned successfully' })
  @ApiResponse({ status: 404, description: 'Event not found' })
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
  @ApiOperation({ summary: 'Create event', description: 'Creates a new calendar event' })
  @ApiBody({ type: CreateEventDto })
  @ApiResponse({ status: 201, description: 'Event created successfully' })
  async createEvent(@Req() req: any, @Body() data: CreateEventDto) {
    const tenantId = req.user.tenantId;
    return this.calendarService.createEvent(tenantId, data);
  }

  /**
   * Update a calendar event
   * PATCH /api/calendar/events/:id
   */
  @Patch('events/:id')
  @ApiOperation({ summary: 'Update event', description: 'Updates a calendar event' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiBody({ type: UpdateEventDto })
  @ApiResponse({ status: 200, description: 'Event updated successfully' })
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
  @ApiOperation({ summary: 'Delete event', description: 'Deletes a calendar event' })
  @ApiParam({ name: 'id', description: 'Event ID' })
  @ApiResponse({ status: 204, description: 'Event deleted successfully' })
  async deleteEvent(@Req() req: any, @Param('id') eventId: string) {
    const tenantId = req.user.tenantId;
    await this.calendarService.deleteEvent(tenantId, eventId);
  }

  /**
   * Trigger manual sync for a provider's calendars
   * POST /api/calendar/sync/:providerId
   */
  @Post('sync/:providerId')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Sync provider calendars', description: 'Triggers manual sync for a provider' })
  @ApiParam({ name: 'providerId', description: 'Provider ID' })
  @ApiResponse({ status: 200, description: 'Sync started successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
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
  @ApiOperation({ summary: 'List event attachments', description: 'Returns attachments for an event' })
  @ApiParam({ name: 'eventId', description: 'Event ID' })
  @ApiResponse({ status: 200, description: 'Attachments returned successfully' })
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
  @ApiOperation({ summary: 'Get event attachment', description: 'Returns attachment metadata and download URL' })
  @ApiParam({ name: 'eventId', description: 'Event ID' })
  @ApiParam({ name: 'attachmentId', description: 'Attachment ID' })
  @ApiResponse({ status: 200, description: 'Attachment returned successfully' })
  async getEventAttachment(
    @Req() req: any,
    @Param('eventId') eventId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.calendarService.getEventAttachment(tenantId, eventId, attachmentId);
  }
}