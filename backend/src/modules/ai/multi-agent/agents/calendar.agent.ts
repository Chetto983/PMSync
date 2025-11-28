import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatMistralAI } from '@langchain/mistralai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { BaseAgent } from './base.agent';
import { AgentContext, AgentIntent } from '../interfaces/agent-context.interface';
import { AgentResult } from '../interfaces/agent-result.interface';
import { AgentAction, AgentActionType, ActionSeverity } from '../interfaces/agent-action.interface';

/**
 * CalendarAgent handles all calendar-related tasks for PMS (PMSync):
 * - Creating and scheduling events
 * - Finding availability
 * - Rescheduling and canceling events
 * - Checking schedules
 *
 * Multi-language support: Responds in user's preferred language.
 */
@Injectable()
export class CalendarAgent extends BaseAgent {
  readonly name = 'CalendarAgent';
  readonly description = 'PMS Calendar Agent - Handles calendar events, scheduling, and availability';
  readonly supportedIntents = [AgentIntent.CALENDAR];

  private model: ChatMistralAI | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  private getModel(): ChatMistralAI {
    if (!this.model) {
      const apiKey = this.configService.get<string>('MISTRAL_API_KEY');
      if (!apiKey) {
        throw new Error('MISTRAL_API_KEY is not configured');
      }

      this.model = new ChatMistralAI({
        apiKey,
        model: 'mistral-small-latest',
        temperature: 0.3,
      });
    }
    return this.model;
  }

  async process(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    this.logger.debug(`CalendarAgent processing for tenant ${context.tenantId}`);

    try {
      const analysis = await this.analyzeCalendarRequest(context);
      const { language } = this.getPreferences(context);

      // Handle parse failures - use localized fallback message
      if (!analysis.message) {
        analysis.message = this.getLocalizedErrorMessage('calendar', language);
      }

      if (analysis.needsMoreInfo) {
        return this.createClarificationResponse(
          analysis.message,
          analysis.questions,
        );
      }

      const actions = this.buildCalendarActions(analysis);

      const executionTime = Date.now() - startTime;
      this.logger.log(`CalendarAgent created ${actions.length} actions in ${executionTime}ms`);

      return this.createActionResponse(
        analysis.message,
        actions,
        { executionTimeMs: executionTime },
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`CalendarAgent error: ${err.message}`, err.stack);

      // Return localized error message
      const { language } = this.getPreferences(context);
      return this.createTextResponse(
        this.getLocalizedErrorMessage('calendar', language),
      );
    }
  }

  /**
   * Analyze the calendar request.
   */
  private async analyzeCalendarRequest(context: AgentContext): Promise<{
    action: string;
    confidence: number;
    message: string;
    needsMoreInfo: boolean;
    questions: string[];
    params: Record<string, any>;
  }> {
    const model = this.getModel();
    const { language, timezone } = this.getPreferences(context);

    const eventContext = this.formatRelevantEvents(context.enrichedContext?.relevantEvents);
    const languageName = this.getLanguageName(language);

    const prompt = PromptTemplate.fromTemplate(`
You are PMS (PMSync) Calendar Assistant - a helpful AI that manages calendar and scheduling.

CRITICAL: You MUST respond ONLY in {languageName}. Never respond in a different language.

Current date/time: {currentTime}
User's timezone: {timezone}

Available calendar actions:
- CREATE_EVENT: Create a new event (requires: title, startTime, endTime; optional: attendees, location, description)
- UPDATE_EVENT: Update an existing event (requires: eventId + fields to update)
- DELETE_EVENT: Delete an event (requires: eventId)
- GET_EVENTS: Get events for a time range (requires: startDate, endDate)
- CHECK_AVAILABILITY: Check free/busy time (requires: date or timeRange)
- SCHEDULE_MEETING: Schedule a meeting (requires: title, duration, attendees, preferredTimes)

Conversation history:
{history}

Upcoming events from context:
{eventContext}

User's request:
{userMessage}

Analyze and respond with ONLY a JSON object (no markdown):
{{
  "action": "CREATE_EVENT|UPDATE_EVENT|DELETE_EVENT|GET_EVENTS|CHECK_AVAILABILITY|SCHEDULE_MEETING|UNKNOWN",
  "confidence": 0.0-1.0,
  "message": "Brief message to show user (MUST be in {languageName})",
  "needsMoreInfo": true|false,
  "questions": ["Questions if more info needed (MUST be in {languageName})"],
  "params": {{
    "title": "event title",
    "startTime": "ISO datetime",
    "endTime": "ISO datetime",
    "duration": "duration in minutes",
    "location": "event location",
    "description": "event description",
    "attendees": ["email1@example.com"],
    "eventId": "id of event to modify",
    "startDate": "ISO date for range start",
    "endDate": "ISO date for range end"
  }}
}}
`);

    const chain = prompt.pipe(model).pipe(new StringOutputParser());

    const result = await chain.invoke({
      userMessage: context.userMessage,
      history: this.formatHistory(context.history) || 'No previous messages',
      eventContext: eventContext || 'No upcoming events in context',
      currentTime: new Date().toISOString(),
      timezone,
      languageName,
    });

    return this.parseAnalysisResult(result);
  }

  /**
   * Parse the LLM analysis result.
   */
  private parseAnalysisResult(result: string): {
    action: string;
    confidence: number;
    message: string;
    needsMoreInfo: boolean;
    questions: string[];
    params: Record<string, any>;
  } {
    try {
      let cleaned = result.trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      return {
        action: parsed.action || 'UNKNOWN',
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5)),
        message: parsed.message || '',
        needsMoreInfo: Boolean(parsed.needsMoreInfo),
        questions: Array.isArray(parsed.questions) ? parsed.questions : [],
        params: parsed.params || {},
      };
    } catch {
      this.logger.warn(`Failed to parse calendar analysis: ${result}`);
      return {
        action: 'UNKNOWN',
        confidence: 0.3,
        message: '', // Will be replaced with localized message in process()
        needsMoreInfo: true,
        questions: [],
        params: {},
      };
    }
  }

  /**
   * Build calendar actions from analysis result.
   */
  private buildCalendarActions(analysis: {
    action: string;
    confidence: number;
    params: Record<string, any>;
  }): AgentAction[] {
    const actions: AgentAction[] = [];

    switch (analysis.action) {
      case 'CREATE_EVENT':
        if (analysis.params.title && analysis.params.startTime) {
          actions.push(this.buildAction(
            AgentActionType.CREATE_EVENT,
            {
              title: analysis.params.title,
              startTime: analysis.params.startTime,
              endTime: analysis.params.endTime,
              location: analysis.params.location,
              description: analysis.params.description,
              attendees: analysis.params.attendees,
            },
            analysis.confidence,
            'User requested to create a calendar event',
          ));
        }
        break;

      case 'UPDATE_EVENT':
        if (analysis.params.eventId) {
          actions.push(this.buildAction(
            AgentActionType.UPDATE_EVENT,
            {
              eventId: analysis.params.eventId,
              title: analysis.params.title,
              startTime: analysis.params.startTime,
              endTime: analysis.params.endTime,
              location: analysis.params.location,
              description: analysis.params.description,
              attendees: analysis.params.attendees,
            },
            analysis.confidence,
            'User requested to update a calendar event',
          ));
        }
        break;

      case 'DELETE_EVENT':
        if (analysis.params.eventId) {
          actions.push(this.buildAction(
            AgentActionType.DELETE_EVENT,
            { eventId: analysis.params.eventId },
            analysis.confidence,
            'User requested to delete a calendar event',
          ));
        }
        break;

      case 'GET_EVENTS':
        actions.push(this.buildAction(
          AgentActionType.GET_EVENTS,
          {
            startDate: analysis.params.startDate,
            endDate: analysis.params.endDate,
          },
          analysis.confidence,
          'User requested to view calendar events',
        ));
        break;

      case 'CHECK_AVAILABILITY':
        actions.push(this.buildAction(
          AgentActionType.CHECK_AVAILABILITY,
          {
            date: analysis.params.startDate,
            startDate: analysis.params.startDate,
            endDate: analysis.params.endDate,
          },
          analysis.confidence,
          'User requested to check availability',
        ));
        break;

      case 'SCHEDULE_MEETING':
        if (analysis.params.title && analysis.params.attendees) {
          actions.push(this.buildAction(
            AgentActionType.SCHEDULE_MEETING,
            {
              title: analysis.params.title,
              duration: analysis.params.duration || 60,
              attendees: analysis.params.attendees,
              preferredStartTime: analysis.params.startTime,
              preferredEndTime: analysis.params.endTime,
            },
            analysis.confidence,
            'User requested to schedule a meeting',
          ));
        }
        break;
    }

    return actions;
  }

  /**
   * Override severity for calendar actions.
   */
  protected determineSeverity(
    actionType: string,
    payload: Record<string, any>,
  ): ActionSeverity {
    // High severity for creating/deleting events
    if (['CREATE_EVENT', 'DELETE_EVENT', 'SCHEDULE_MEETING'].includes(actionType)) {
      // Higher if has external attendees
      if (payload.attendees && Array.isArray(payload.attendees) && payload.attendees.length > 0) {
        return ActionSeverity.HIGH;
      }
      return ActionSeverity.MEDIUM;
    }

    // Medium for updates
    if (actionType === 'UPDATE_EVENT') {
      return ActionSeverity.MEDIUM;
    }

    // Low for read operations
    return ActionSeverity.LOW;
  }

  /**
   * Format relevant events for context.
   */
  private formatRelevantEvents(
    events?: Array<{
      id: string;
      title: string;
      startTime: Date;
      endTime: Date;
    }>,
  ): string {
    if (!events || events.length === 0) {
      return '';
    }

    return events
      .slice(0, 5)
      .map(
        (e) =>
          `- ${e.title}\n  Start: ${e.startTime}\n  End: ${e.endTime}\n  ID: ${e.id}`,
      )
      .join('\n\n');
  }
}
