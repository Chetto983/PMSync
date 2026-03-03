import { Injectable, Logger } from '@nestjs/common';
import {
  IAiTool,
  IToolContext,
} from '../../../common/interfaces/tool-registry.interface';
import { CalendarEventsService } from '../services/calendar-events.service';

/**
 * IAiTool wrapper for calendar event search/listing.
 * Registered via OnModuleInit in CalendarModule.
 * AiChatModule discovers this through ToolRegistryService.
 *
 * Phase 32: Architecture decoupling -- domain modules own their tool metadata.
 */
@Injectable()
export class CalendarTool implements IAiTool {
  readonly name = 'view_calendar';
  readonly description =
    'View calendar events within a date range. Returns event titles, times, and locations.';
  readonly parameters: Record<string, unknown> = {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'Start of date range (ISO 8601)' },
      endDate: { type: 'string', description: 'End of date range (ISO 8601)' },
      limit: { type: 'number', description: 'Max events (default 20, max 50)' },
    },
    required: [],
  };

  private readonly logger = new Logger(CalendarTool.name);

  constructor(
    private readonly calendarEventsService: CalendarEventsService,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: IToolContext,
  ): Promise<unknown> {
    const limit = Math.min((input.limit as number) ?? 20, 50);

    const { events } = await this.calendarEventsService.listEvents(
      context.tenantId,
      {
        startTime: input.startDate
          ? new Date(input.startDate as string)
          : undefined,
        endTime: input.endDate
          ? new Date(input.endDate as string)
          : undefined,
        limit,
      },
    );

    const mapped = events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.startTime,
      end: e.endTime,
      location: e.location,
      isAllDay: e.isAllDay,
    }));

    return { events: mapped, count: mapped.length };
  }
}
