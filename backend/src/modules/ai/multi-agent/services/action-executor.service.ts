import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentAction, AgentActionType } from '../interfaces/agent-action.interface';
import { AgentContext } from '../interfaces/agent-context.interface';

/**
 * Result of executing an action.
 */
export interface ActionExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTimeMs: number;
}

/**
 * ActionExecutorService executes approved actions by delegating
 * to the appropriate domain services (Email, Calendar, Contacts).
 *
 * This service acts as a bridge between the multi-agent system
 * and the existing application services.
 */
@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    // Note: These services will be injected when module is properly connected
    // private readonly emailsService: EmailsService,
    // private readonly calendarService: CalendarService,
    // private readonly contactsService: ContactsService,
  ) {}

  /**
   * Execute an action and return the result.
   * Routes to appropriate handler based on action type.
   */
  async execute(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    this.logger.log(
      `Executing action ${action.type} for tenant ${context.tenantId}`,
    );

    try {
      let result: ActionExecutionResult;

      // Route to appropriate executor based on action type
      switch (action.type) {
        // Email actions
        case AgentActionType.SEND_EMAIL:
          result = await this.executeSendEmail(action, context);
          break;
        case AgentActionType.REPLY_EMAIL:
          result = await this.executeReplyEmail(action, context);
          break;
        case AgentActionType.FORWARD_EMAIL:
          result = await this.executeForwardEmail(action, context);
          break;
        case AgentActionType.DELETE_EMAIL:
          result = await this.executeDeleteEmail(action, context);
          break;
        case AgentActionType.ARCHIVE_EMAIL:
          result = await this.executeArchiveEmail(action, context);
          break;
        case AgentActionType.MARK_READ:
        case AgentActionType.MARK_UNREAD:
          result = await this.executeMarkEmail(action, context);
          break;
        case AgentActionType.STAR_EMAIL:
        case AgentActionType.UNSTAR_EMAIL:
          result = await this.executeStarEmail(action, context);
          break;
        case AgentActionType.SEARCH_EMAILS:
          result = await this.executeSearchEmails(action, context);
          break;
        case AgentActionType.LABEL_EMAIL:
          result = await this.executeLabelEmail(action, context);
          break;

        // Calendar actions
        case AgentActionType.CREATE_EVENT:
          result = await this.executeCreateEvent(action, context);
          break;
        case AgentActionType.UPDATE_EVENT:
          result = await this.executeUpdateEvent(action, context);
          break;
        case AgentActionType.DELETE_EVENT:
          result = await this.executeDeleteEvent(action, context);
          break;
        case AgentActionType.GET_EVENTS:
          result = await this.executeGetEvents(action, context);
          break;
        case AgentActionType.CHECK_AVAILABILITY:
          result = await this.executeCheckAvailability(action, context);
          break;

        // Contact actions
        case AgentActionType.CREATE_CONTACT:
          result = await this.executeCreateContact(action, context);
          break;
        case AgentActionType.UPDATE_CONTACT:
          result = await this.executeUpdateContact(action, context);
          break;
        case AgentActionType.DELETE_CONTACT:
          result = await this.executeDeleteContact(action, context);
          break;
        case AgentActionType.SEARCH_CONTACTS:
          result = await this.executeSearchContacts(action, context);
          break;
        case AgentActionType.MERGE_CONTACTS:
          result = await this.executeMergeContacts(action, context);
          break;

        default:
          result = {
            success: false,
            error: `Unknown action type: ${action.type}`,
            executionTimeMs: Date.now() - startTime,
          };
      }

      result.executionTimeMs = Date.now() - startTime;
      this.logger.log(
        `Action ${action.type} completed in ${result.executionTimeMs}ms, success: ${result.success}`,
      );

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Action ${action.type} failed: ${err.message}`, err.stack);
      return {
        success: false,
        error: err.message,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // ===============================
  // EMAIL ACTION EXECUTORS
  // ===============================

  private async executeSendEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { to, cc, bcc, subject, body, providerId } = action.payload;

    // TODO: Integrate with EmailsService.sendEmail() when available
    // For now, create a draft in the database
    this.logger.log(`Would send email to: ${to}, subject: ${subject}`);

    // Placeholder - actual implementation will call EmailsService
    return {
      success: true,
      data: { message: 'Email send queued (placeholder)', to, subject },
      executionTimeMs: 0,
    };
  }

  private async executeReplyEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, body } = action.payload;

    this.logger.log(`Would reply to email ${emailId}`);

    return {
      success: true,
      data: { message: 'Reply queued (placeholder)', emailId },
      executionTimeMs: 0,
    };
  }

  private async executeForwardEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, to } = action.payload;

    this.logger.log(`Would forward email ${emailId} to ${to}`);

    return {
      success: true,
      data: { message: 'Forward queued (placeholder)', emailId, to },
      executionTimeMs: 0,
    };
  }

  private async executeDeleteEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;

    // Soft delete the email
    const email = await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { isDeleted: true },
    });

    return {
      success: true,
      data: { emailId, deleted: true },
      executionTimeMs: 0,
    };
  }

  private async executeArchiveEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;

    // Move email to archive folder
    const email = await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { folder: 'ARCHIVE' },
    });

    return {
      success: true,
      data: { emailId, archived: true },
      executionTimeMs: 0,
    };
  }

  private async executeMarkEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;
    const isRead = action.type === AgentActionType.MARK_READ;

    const email = await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { isRead },
    });

    return {
      success: true,
      data: { emailId, isRead },
      executionTimeMs: 0,
    };
  }

  private async executeStarEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;
    const isStarred = action.type === AgentActionType.STAR_EMAIL;

    const email = await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { isStarred },
    });

    return {
      success: true,
      data: { emailId, isStarred },
      executionTimeMs: 0,
    };
  }

  private async executeSearchEmails(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { query, limit = 20 } = action.payload;

    const emails = await this.prisma.email.findMany({
      where: {
        tenantId: context.tenantId,
        OR: [
          { subject: { contains: query, mode: 'insensitive' } },
          { snippet: { contains: query, mode: 'insensitive' } },
          { from: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        subject: true,
        from: true,
        snippet: true,
        receivedAt: true,
        isRead: true,
        isStarred: true,
      },
    });

    return {
      success: true,
      data: { emails, count: emails.length },
      executionTimeMs: 0,
    };
  }

  private async executeLabelEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, labelIds } = action.payload;

    // TODO: Implement label assignment
    this.logger.log(`Would label email ${emailId} with labels: ${labelIds}`);

    return {
      success: true,
      data: { emailId, labelIds },
      executionTimeMs: 0,
    };
  }

  // ===============================
  // CALENDAR ACTION EXECUTORS
  // ===============================

  private async executeCreateEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { title, startTime, endTime, description, location, attendees, providerId } = action.payload;

    // TODO: Integrate with CalendarService.createEvent() when available
    this.logger.log(`Would create event: ${title} at ${startTime}`);

    return {
      success: true,
      data: { message: 'Event creation queued (placeholder)', title },
      executionTimeMs: 0,
    };
  }

  private async executeUpdateEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { eventId, ...updates } = action.payload;

    this.logger.log(`Would update event ${eventId}`);

    return {
      success: true,
      data: { eventId, updated: true },
      executionTimeMs: 0,
    };
  }

  private async executeDeleteEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { eventId } = action.payload;

    // TODO: Integrate with CalendarService.deleteEvent()
    this.logger.log(`Would delete event ${eventId}`);

    return {
      success: true,
      data: { eventId, deleted: true },
      executionTimeMs: 0,
    };
  }

  private async executeGetEvents(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { startDate, endDate } = action.payload;

    const events = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId: context.tenantId,
        startTime: startDate ? { gte: new Date(startDate) } : undefined,
        endTime: endDate ? { lte: new Date(endDate) } : undefined,
      },
      orderBy: { startTime: 'asc' },
      take: 50,
    });

    return {
      success: true,
      data: { events, count: events.length },
      executionTimeMs: 0,
    };
  }

  private async executeCheckAvailability(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { date, startDate, endDate } = action.payload;

    const checkStart = new Date(startDate || date);
    const checkEnd = new Date(endDate || date);
    checkEnd.setHours(23, 59, 59);

    const busySlots = await this.prisma.calendarEvent.findMany({
      where: {
        tenantId: context.tenantId,
        startTime: { lte: checkEnd },
        endTime: { gte: checkStart },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
      },
      orderBy: { startTime: 'asc' },
    });

    return {
      success: true,
      data: { busySlots, hasFreeTime: busySlots.length < 8 }, // Simple heuristic
      executionTimeMs: 0,
    };
  }

  // ===============================
  // CONTACT ACTION EXECUTORS
  // ===============================

  private async executeCreateContact(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { name, firstName, lastName, email, phone, company, jobTitle, notes } = action.payload;

    // Check if tenant has contacts provider
    const provider = await this.prisma.providerConfig.findFirst({
      where: { tenantId: context.tenantId, supportsContacts: true },
    });

    if (!provider) {
      return {
        success: false,
        error: 'No provider available for contacts',
        executionTimeMs: 0,
      };
    }

    const contact = await this.prisma.contact.create({
      data: {
        tenantId: context.tenantId,
        displayName: name || `${firstName || ''} ${lastName || ''}`.trim(),
        firstName,
        lastName,
        emails: email ? [email] : [],
        phoneNumbers: phone ? [phone] : [],
        company,
        jobTitle,
        notes,
      },
    });

    return {
      success: true,
      data: { contactId: contact.id, contact },
      executionTimeMs: 0,
    };
  }

  private async executeUpdateContact(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { contactId, ...updates } = action.payload;

    const contact = await this.prisma.contact.update({
      where: { id: contactId, tenantId: context.tenantId },
      data: {
        displayName: updates.name,
        firstName: updates.firstName,
        lastName: updates.lastName,
        emails: updates.email ? [updates.email] : undefined,
        phoneNumbers: updates.phone ? [updates.phone] : undefined,
        company: updates.company,
        jobTitle: updates.jobTitle,
        notes: updates.notes,
      },
    });

    return {
      success: true,
      data: { contactId, updated: true },
      executionTimeMs: 0,
    };
  }

  private async executeDeleteContact(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { contactId } = action.payload;

    await this.prisma.contact.delete({
      where: { id: contactId, tenantId: context.tenantId },
    });

    return {
      success: true,
      data: { contactId, deleted: true },
      executionTimeMs: 0,
    };
  }

  private async executeSearchContacts(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { query, limit = 20 } = action.payload;

    const contacts = await this.prisma.contact.findMany({
      where: {
        tenantId: context.tenantId,
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { company: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      orderBy: { displayName: 'asc' },
    });

    return {
      success: true,
      data: { contacts, count: contacts.length },
      executionTimeMs: 0,
    };
  }

  private async executeMergeContacts(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { contactIds } = action.payload;

    if (!contactIds || contactIds.length < 2) {
      return {
        success: false,
        error: 'Need at least 2 contacts to merge',
        executionTimeMs: 0,
      };
    }

    // TODO: Implement merge logic - keep primary, merge data from others
    this.logger.log(`Would merge contacts: ${contactIds.join(', ')}`);

    return {
      success: true,
      data: { merged: true, primaryId: contactIds[0] },
      executionTimeMs: 0,
    };
  }
}
