/**
 * Scheduling Controller
 * Phase 9e: Extracted from voltagent.controller.ts (2026-01-23)
 *
 * Handles calendar conflicts, focus time, and meeting preparation.
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard } from '../../../subscription/guards/quota.guard';
import { CalendarConflictService } from '../services/calendar-conflict.service';
import { FocusTimeService } from '../services/focus-time.service';
import { MeetingPrepService } from '../services/meeting-prep.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

@ApiTags('VoltAgent Scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class SchedulingController {
  private readonly logger = new Logger(SchedulingController.name);

  constructor(
    private readonly calendarConflictService: CalendarConflictService,
    private readonly focusTimeService: FocusTimeService,
    private readonly meetingPrepService: MeetingPrepService,
  ) {}

  // ==========================================================================
  // CALENDAR CONFLICT ENDPOINTS
  // ==========================================================================

  /**
   * Detect calendar conflicts for a proposed event.
   */
  @Post('scheduling/conflicts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Detect calendar conflicts',
    description: `Checks if a proposed event conflicts with existing calendar events.
    Returns conflict details and alternative time slot suggestions.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['title', 'startTime', 'endTime'],
      properties: {
        title: { type: 'string', description: 'Event title' },
        startTime: { type: 'string', format: 'date-time' },
        endTime: { type: 'string', format: 'date-time' },
        duration: { type: 'number', description: 'Duration in minutes' },
        isFlexible: { type: 'boolean', description: 'Can be rescheduled if conflicts' },
        includeSuggestions: { type: 'boolean', description: 'Include alternative slots' },
        numSuggestions: { type: 'number', description: 'Number of suggestions' },
      },
    },
  })
  async detectConflicts(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      title: string;
      startTime: string;
      endTime: string;
      duration?: number;
      isFlexible?: boolean;
      includeSuggestions?: boolean;
      numSuggestions?: number;
    },
  ) {
    const { tenantId, userId } = req.user;

    const proposedEvent = {
      title: body.title,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      duration:
        body.duration ||
        Math.round(
          (new Date(body.endTime).getTime() - new Date(body.startTime).getTime()) / (1000 * 60),
        ),
      isFlexible: body.isFlexible ?? true,
    };

    const result = await this.calendarConflictService.detectConflicts(
      tenantId,
      userId,
      proposedEvent,
      {
        includeSuggestions: body.includeSuggestions,
        numSuggestions: body.numSuggestions,
      },
    );

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Find available time slots for a meeting.
   */
  @Get('scheduling/available-slots')
  @ApiOperation({
    summary: 'Find available time slots',
    description: `Returns available time slots for scheduling a meeting
    within the user's working hours over the next N days.`,
  })
  async findAvailableSlots(
    @Req() req: AuthenticatedRequest,
    @Query('duration') duration?: string,
    @Query('days') days?: string,
    @Query('numSlots') numSlots?: string,
  ) {
    const { tenantId, userId } = req.user;

    const durationMinutes = duration ? parseInt(duration, 10) : 30;
    const lookAheadDays = days ? parseInt(days, 10) : 7;
    const slots = numSlots ? parseInt(numSlots, 10) : 5;

    const availableSlots = await this.calendarConflictService.findAlternativeSlots(
      tenantId,
      userId,
      {
        title: 'New Meeting',
        startTime: new Date(),
        endTime: new Date(Date.now() + durationMinutes * 60 * 1000),
        duration: durationMinutes,
        isFlexible: true,
      },
      slots,
      lookAheadDays,
    );

    return {
      success: true,
      count: availableSlots.length,
      slots: availableSlots,
    };
  }

  /**
   * Get user's scheduling preferences.
   */
  @Get('scheduling/preferences')
  @ApiOperation({
    summary: 'Get scheduling preferences',
    description: 'Returns user scheduling preferences including working hours and days.',
  })
  async getSchedulingPreferences(@Req() req: AuthenticatedRequest) {
    const { tenantId, userId } = req.user;

    const preferences = await this.calendarConflictService.getUserSchedulingPreferences(
      tenantId,
      userId,
    );

    return {
      success: true,
      preferences,
    };
  }

  /**
   * Get day's calendar busy percentage.
   */
  @Get('scheduling/day-load')
  @ApiOperation({
    summary: 'Get calendar load for a day',
    description: 'Returns how busy a specific day is as a percentage of working hours.',
  })
  async getDayLoad(
    @Req() req: AuthenticatedRequest,
    @Query('date') date?: string,
  ) {
    const { tenantId, userId } = req.user;

    const targetDate = date ? new Date(date) : new Date();
    const busyPercentage = await this.calendarConflictService.getDayBusyPercentage(
      tenantId,
      targetDate,
      userId,
    );

    return {
      success: true,
      date: targetDate.toISOString().split('T')[0],
      busyPercentage,
      freePercentage: 100 - busyPercentage,
    };
  }

  // ==========================================================================
  // FOCUS TIME ENDPOINTS
  // ==========================================================================

  /**
   * Find optimal focus time slots.
   */
  @Get('scheduling/focus-time/optimal')
  @ApiOperation({
    summary: 'Find optimal focus time slots',
    description: `Analyzes calendar patterns to find optimal times for focused work.`,
  })
  async findOptimalFocusSlots(
    @Req() req: AuthenticatedRequest,
    @Query('duration') duration?: string,
    @Query('preferredTime') preferredTime?: string,
    @Query('numSlots') numSlots?: string,
  ) {
    const { tenantId, userId } = req.user;

    const preferences = {
      duration: duration ? parseInt(duration, 10) : 120,
      frequency: 'daily' as const,
      preferredTime: (preferredTime as 'morning' | 'afternoon' | 'flexible') || 'flexible',
      minBlockSize: 60,
      protectFromMeetings: true,
      autoDeclineMeetings: false,
    };

    const slots = await this.focusTimeService.findOptimalFocusSlots(
      tenantId,
      userId,
      preferences,
      numSlots ? parseInt(numSlots, 10) : 5,
    );

    return {
      success: true,
      count: slots.length,
      slots,
    };
  }

  /**
   * Get focus time statistics.
   */
  @Get('scheduling/focus-time/stats')
  @ApiOperation({
    summary: 'Get focus time statistics',
    description: 'Returns statistics about calendar patterns and focus time availability.',
  })
  async getFocusTimeStats(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
  ) {
    const { tenantId, userId } = req.user;

    const stats = await this.focusTimeService.getFocusTimeStats(
      tenantId,
      userId,
      days ? parseInt(days, 10) : 30,
    );

    return {
      success: true,
      stats,
    };
  }

  /**
   * Create focus time blocks based on preferences.
   */
  @Post('scheduling/focus-time/create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create focus time blocks',
    description: 'Creates protected focus time blocks based on user preferences.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: 'Duration in minutes (default: 120)' },
        frequency: {
          type: 'string',
          enum: ['daily', 'weekly', 'twice_weekly'],
        },
        preferredTime: {
          type: 'string',
          enum: ['morning', 'afternoon', 'flexible'],
        },
        protectFromMeetings: { type: 'boolean' },
      },
    },
  })
  async createFocusBlocks(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      duration?: number;
      frequency?: 'daily' | 'weekly' | 'twice_weekly';
      preferredTime?: 'morning' | 'afternoon' | 'flexible';
      protectFromMeetings?: boolean;
    },
  ) {
    const { tenantId, userId } = req.user;

    const preferences = {
      duration: body.duration || 120,
      frequency: body.frequency || 'daily',
      preferredTime: body.preferredTime || 'flexible',
      minBlockSize: 60,
      protectFromMeetings: body.protectFromMeetings ?? true,
      autoDeclineMeetings: false,
    };

    const blocks = await this.focusTimeService.createFocusBlocks(tenantId, userId, preferences);

    return {
      success: true,
      count: blocks.length,
      blocks,
    };
  }

  /**
   * Check if current time is during a focus block.
   */
  @Get('scheduling/focus-time/status')
  @ApiOperation({
    summary: 'Check focus time status',
    description: 'Returns whether the current time is during a focus block.',
  })
  async getFocusTimeStatus(@Req() req: AuthenticatedRequest) {
    const { tenantId, userId } = req.user;

    const status = await this.focusTimeService.isInFocusBlock(tenantId, userId, new Date());

    return {
      success: true,
      ...status,
    };
  }

  // ==========================================================================
  // MEETING PREP ENDPOINTS
  // ==========================================================================

  /**
   * Get meeting preparation brief.
   */
  @Get('scheduling/meeting-prep/:eventId')
  @ApiOperation({
    summary: 'Get meeting preparation brief',
    description: `Generates a comprehensive meeting brief including attendee info,
    related emails, previous meetings, and suggested agenda.`,
  })
  @ApiParam({ name: 'eventId', description: 'Calendar event ID' })
  async getMeetingBrief(
    @Req() req: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query('includeEmails') includeEmails?: string,
    @Query('includePreviousMeetings') includePreviousMeetings?: string,
    @Query('includeActionItems') includeActionItems?: string,
  ) {
    const { tenantId, userId } = req.user;

    const brief = await this.meetingPrepService.prepareBrief(tenantId, userId, eventId, {
      includeEmails: includeEmails !== 'false',
      includePreviousMeetings: includePreviousMeetings !== 'false',
      includeActionItems: includeActionItems !== 'false',
    });

    return {
      success: true,
      brief,
    };
  }

  /**
   * Get upcoming meetings needing preparation.
   */
  @Get('scheduling/meeting-prep')
  @ApiOperation({
    summary: 'Get meetings needing prep',
    description: 'Returns upcoming meetings that may need preparation briefs.',
  })
  async getUpcomingMeetingsNeedingPrep(
    @Req() req: AuthenticatedRequest,
    @Query('hoursAhead') hoursAhead?: string,
  ) {
    const { tenantId, userId } = req.user;

    const meetings = await this.meetingPrepService.getUpcomingMeetingsNeedingPrep(
      tenantId,
      userId,
      hoursAhead ? parseInt(hoursAhead, 10) : 24,
    );

    return {
      success: true,
      count: meetings.length,
      meetings,
    };
  }
}
