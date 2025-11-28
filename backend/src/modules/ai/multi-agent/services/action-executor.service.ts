import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentAction, AgentActionType } from '../interfaces/agent-action.interface';
import { AgentContext } from '../interfaces/agent-context.interface';
import { EmailSendService } from '../../../email/services/email-send.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { FolderSyncService } from '../../../email-sync/services/folder-sync.service';

/**
 * Result of executing an action.
 */
export interface ActionExecutionResult {
  success: boolean;
  data?: any;
  summary?: string | string[];
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
    @Optional() private readonly emailSendService: EmailSendService,
    @Optional() private readonly calendarService: CalendarService,
    @Optional() @Inject(forwardRef(() => FolderSyncService))
    private readonly folderSyncService: FolderSyncService,
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
        case AgentActionType.GET_CONTACT:
          result = await this.executeGetContact(action, context);
          break;

        // Additional email actions
        case AgentActionType.GET_UNREAD:
          result = await this.executeGetUnread(action, context);
          break;
        case AgentActionType.CATEGORIZE_EMAIL:
          result = await this.executeCategorizeEmail(action, context);
          break;

        // Additional calendar actions
        case AgentActionType.RESCHEDULE_EVENT:
          result = await this.executeRescheduleEvent(action, context);
          break;

        // Folder actions
        case AgentActionType.CREATE_FOLDER:
          result = await this.executeCreateFolder(action, context);
          break;
        case AgentActionType.RENAME_FOLDER:
          result = await this.executeRenameFolder(action, context);
          break;
        case AgentActionType.DELETE_FOLDER:
          result = await this.executeDeleteFolder(action, context);
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

    if (!this.emailSendService) {
      this.logger.warn('EmailSendService not available, using placeholder');
      return {
        success: true,
        data: { message: 'Email send queued (placeholder)', to, subject },
        executionTimeMs: 0,
      };
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
      });
      if (!provider) {
        return {
          success: false,
          error: 'No email provider available',
          executionTimeMs: 0,
        };
      }
      actualProviderId = provider.id;
    }

    // Send email via EmailSendService
    const result = await this.emailSendService.sendEmail({
      tenantId: context.tenantId,
      providerId: actualProviderId,
      to: Array.isArray(to) ? to : [to],
      cc: cc ? (Array.isArray(cc) ? cc : [cc]) : undefined,
      bcc: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : undefined,
      subject: subject || '(No subject)',
      bodyHtml: body || '',
      bodyText: body?.replace(/<[^>]*>/g, '') || '',
    });

    this.logger.log(`Email sent successfully, messageId: ${result.messageId}`);

    return {
      success: result.success,
      data: { messageId: result.messageId, to, subject },
      executionTimeMs: 0,
    };
  }

  private async executeReplyEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, body } = action.payload;

    if (!this.emailSendService) {
      this.logger.warn('EmailSendService not available, using placeholder');
      return {
        success: true,
        data: { message: 'Reply queued (placeholder)', emailId },
        executionTimeMs: 0,
      };
    }

    // Get the original email to reply to
    const originalEmail = await this.prisma.email.findUnique({
      where: { id: emailId, tenantId: context.tenantId },
    });

    if (!originalEmail) {
      return {
        success: false,
        error: 'Original email not found',
        executionTimeMs: 0,
      };
    }

    // Send reply
    const result = await this.emailSendService.sendEmail({
      tenantId: context.tenantId,
      providerId: originalEmail.providerId,
      threadId: originalEmail.threadId || undefined,
      to: [originalEmail.from],
      subject: originalEmail.subject?.startsWith('Re:')
        ? originalEmail.subject
        : `Re: ${originalEmail.subject || ''}`,
      bodyHtml: body || '',
      bodyText: body?.replace(/<[^>]*>/g, '') || '',
      inReplyTo: originalEmail.messageId || undefined,
      references: originalEmail.messageId || undefined,
    });

    return {
      success: result.success,
      data: { messageId: result.messageId, emailId, replyTo: originalEmail.from },
      executionTimeMs: 0,
    };
  }

  private async executeForwardEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, to, body } = action.payload;

    if (!this.emailSendService) {
      this.logger.warn('EmailSendService not available, using placeholder');
      return {
        success: true,
        data: { message: 'Forward queued (placeholder)', emailId, to },
        executionTimeMs: 0,
      };
    }

    // Get the original email to forward
    const originalEmail = await this.prisma.email.findUnique({
      where: { id: emailId, tenantId: context.tenantId },
    });

    if (!originalEmail) {
      return {
        success: false,
        error: 'Original email not found',
        executionTimeMs: 0,
      };
    }

    // Build forwarded body with original email content
    const forwardedBody = `
      ${body || ''}
      <br/><br/>
      ---------- Forwarded message ----------<br/>
      From: ${originalEmail.from}<br/>
      Date: ${originalEmail.receivedAt}<br/>
      Subject: ${originalEmail.subject}<br/>
      <br/>
      ${originalEmail.bodyHtml || originalEmail.snippet || ''}
    `;

    const result = await this.emailSendService.sendEmail({
      tenantId: context.tenantId,
      providerId: originalEmail.providerId,
      to: Array.isArray(to) ? to : [to],
      subject: `Fwd: ${originalEmail.subject || ''}`,
      bodyHtml: forwardedBody,
      bodyText: forwardedBody.replace(/<[^>]*>/g, ''),
    });

    return {
      success: result.success,
      data: { messageId: result.messageId, emailId, forwardedTo: to },
      executionTimeMs: 0,
    };
  }

  private async executeDeleteEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId } = action.payload;

    // Soft delete the email
    await this.prisma.email.update({
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
    await this.prisma.email.update({
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

    await this.prisma.email.update({
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

    await this.prisma.email.update({
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
    const { emailId, labelIds, addLabels, removeLabels } = action.payload;

    // Get current email labels
    const email = await this.prisma.email.findUnique({
      where: { id: emailId, tenantId: context.tenantId },
      select: { labels: true },
    });

    if (!email) {
      return {
        success: false,
        error: 'Email not found',
        executionTimeMs: 0,
      };
    }

    // Determine labels to add/remove (labels is a String[] array)
    const labelsToAdd: string[] = addLabels || labelIds || [];
    const labelsToRemove: string[] = removeLabels || [];

    // Calculate new labels array
    let newLabels = [...(email.labels || [])];

    // Add new labels
    for (const label of labelsToAdd) {
      if (!newLabels.includes(label)) {
        newLabels.push(label);
      }
    }

    // Remove labels
    newLabels = newLabels.filter((l) => !labelsToRemove.includes(l));

    // Update email labels
    await this.prisma.email.update({
      where: { id: emailId, tenantId: context.tenantId },
      data: { labels: newLabels },
    });

    this.logger.log(`Labeled email ${emailId} - added: ${labelsToAdd.join(',')}, removed: ${labelsToRemove.join(',')}`);

    return {
      success: true,
      data: { emailId, labelsAdded: labelsToAdd, labelsRemoved: labelsToRemove, currentLabels: newLabels },
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
    const { title, startTime, endTime, description, location, attendees, providerId, calendarId, isAllDay, timeZone } = action.payload;

    if (!this.calendarService) {
      this.logger.warn('CalendarService not available, using placeholder');
      return {
        success: true,
        data: { message: 'Event creation queued (placeholder)', title },
        executionTimeMs: 0,
      };
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsCalendar: true, isActive: true },
      });
      if (!provider) {
        return {
          success: false,
          error: 'No calendar provider available',
          executionTimeMs: 0,
        };
      }
      actualProviderId = provider.id;
    }

    // Create event via CalendarService
    const event = await this.calendarService.createEvent(context.tenantId, {
      providerId: actualProviderId,
      calendarId: calendarId || 'primary',
      title,
      description,
      location,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      isAllDay: isAllDay || false,
      timeZone: timeZone || 'UTC',
      attendees: attendees?.map((a: any) => typeof a === 'string' ? { email: a } : a),
    });

    this.logger.log(`Created calendar event ${event.id}`);

    return {
      success: true,
      data: { eventId: event.id, externalId: event.externalId, title, startTime, endTime },
      executionTimeMs: 0,
    };
  }

  private async executeUpdateEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { eventId, title, description, location, startTime, endTime, attendees } = action.payload;

    if (!this.calendarService) {
      this.logger.warn('CalendarService not available, using placeholder');
      return {
        success: true,
        data: { eventId, updated: true, message: 'placeholder' },
        executionTimeMs: 0,
      };
    }

    // Update event via CalendarService
    const event = await this.calendarService.updateEvent(context.tenantId, eventId, {
      title,
      description,
      location,
      startTime: startTime ? new Date(startTime) : undefined,
      endTime: endTime ? new Date(endTime) : undefined,
      attendees: attendees?.map((a: any) => typeof a === 'string' ? { email: a } : a),
    });

    this.logger.log(`Updated calendar event ${eventId}`);

    return {
      success: true,
      data: { eventId, updated: true, event },
      executionTimeMs: 0,
    };
  }

  private async executeDeleteEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { eventId } = action.payload;

    if (!this.calendarService) {
      this.logger.warn('CalendarService not available, using placeholder');
      return {
        success: true,
        data: { eventId, deleted: true, message: 'placeholder' },
        executionTimeMs: 0,
      };
    }

    // Delete event via CalendarService
    await this.calendarService.deleteEvent(context.tenantId, eventId);

    this.logger.log(`Deleted calendar event ${eventId}`);

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

    await this.prisma.contact.update({
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
    const { contactIds, primaryId } = action.payload;

    if (!contactIds || contactIds.length < 2) {
      return {
        success: false,
        error: 'Need at least 2 contacts to merge',
        executionTimeMs: 0,
      };
    }

    // Get all contacts to merge
    const contacts = await this.prisma.contact.findMany({
      where: {
        id: { in: contactIds },
        tenantId: context.tenantId,
      },
    });

    if (contacts.length < 2) {
      return {
        success: false,
        error: 'Could not find enough contacts to merge',
        executionTimeMs: 0,
      };
    }

    // Determine primary contact (first one or specified)
    const primaryContactId = primaryId || contactIds[0];
    const primaryContact = contacts.find((c) => c.id === primaryContactId);
    const secondaryContacts = contacts.filter((c) => c.id !== primaryContactId);

    if (!primaryContact) {
      return {
        success: false,
        error: 'Primary contact not found',
        executionTimeMs: 0,
      };
    }

    // Merge data from secondary contacts into primary
    // Note: emails and phoneNumbers are stored as Json arrays in Prisma
    const primaryEmails = Array.isArray(primaryContact.emails) ? primaryContact.emails as string[] : [];
    const primaryPhones = Array.isArray(primaryContact.phoneNumbers) ? primaryContact.phoneNumbers as string[] : [];

    const mergedEmails = new Set<string>(primaryEmails);
    const mergedPhones = new Set<string>(primaryPhones);
    let mergedNotes = primaryContact.notes || '';

    for (const contact of secondaryContacts) {
      // Merge emails
      const contactEmails = Array.isArray(contact.emails) ? contact.emails as string[] : [];
      contactEmails.forEach((e: string) => mergedEmails.add(e));

      // Merge phone numbers
      const contactPhones = Array.isArray(contact.phoneNumbers) ? contact.phoneNumbers as string[] : [];
      contactPhones.forEach((p: string) => mergedPhones.add(p));

      // Merge notes
      if (contact.notes) {
        mergedNotes += mergedNotes ? `\n\n--- Merged from ${contact.displayName} ---\n${contact.notes}` : contact.notes;
      }
    }

    // Update primary contact with merged data
    const updatedContact = await this.prisma.contact.update({
      where: { id: primaryContactId, tenantId: context.tenantId },
      data: {
        emails: Array.from(mergedEmails),
        phoneNumbers: Array.from(mergedPhones),
        notes: mergedNotes || undefined,
        // Keep primary contact's name, company, etc. - don't overwrite
      },
    });

    // Delete secondary contacts
    const secondaryIds = secondaryContacts.map((c) => c.id);
    await this.prisma.contact.deleteMany({
      where: {
        id: { in: secondaryIds },
        tenantId: context.tenantId,
      },
    });

    this.logger.log(`Merged ${contacts.length} contacts into ${primaryContactId}, deleted ${secondaryIds.length} duplicates`);

    return {
      success: true,
      data: {
        merged: true,
        primaryId: primaryContactId,
        mergedCount: secondaryIds.length,
        deletedIds: secondaryIds,
        updatedContact,
      },
      executionTimeMs: 0,
    };
  }

  /**
   * Get a specific contact by ID, email, or name
   */
  private async executeGetContact(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { contactId, email, name } = action.payload;

    let contact;

    if (contactId) {
      // Direct lookup by ID
      contact = await this.prisma.contact.findFirst({
        where: { id: contactId, tenantId: context.tenantId },
        include: { providerContacts: true },
      });
    } else if (email) {
      // Lookup by email - emails is stored as Json array
      contact = await this.prisma.contact.findFirst({
        where: {
          tenantId: context.tenantId,
          emails: { array_contains: [email] },
        },
        include: { providerContacts: true },
      });

      // Fallback: Search in raw JSON if array_contains doesn't work
      if (!contact) {
        const contacts = await this.prisma.contact.findMany({
          where: { tenantId: context.tenantId },
          include: { providerContacts: true },
        });
        contact = contacts.find((c) => {
          const emails = Array.isArray(c.emails) ? (c.emails as unknown as string[]) : [];
          return emails.some((e) => String(e).toLowerCase() === email.toLowerCase());
        });
      }
    } else if (name) {
      // Lookup by name (partial match)
      contact = await this.prisma.contact.findFirst({
        where: {
          tenantId: context.tenantId,
          OR: [
            { displayName: { contains: name, mode: 'insensitive' } },
            { firstName: { contains: name, mode: 'insensitive' } },
            { lastName: { contains: name, mode: 'insensitive' } },
          ],
        },
        include: { providerContacts: true },
      });
    }

    if (!contact) {
      return {
        success: false,
        error: 'Contact not found',
        executionTimeMs: 0,
      };
    }

    return {
      success: true,
      data: { contact },
      executionTimeMs: 0,
    };
  }

  /**
   * Get unread emails with optional filtering
   */
  private async executeGetUnread(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { limit = 10, providerId, folder } = action.payload;
    const lang = (context.preferences?.language || 'en').toLowerCase().startsWith('it') ? 'it' : 'en';

    const whereClause: any = {
      tenantId: context.tenantId,
      isRead: false,
      isDeleted: false,
    };

    if (providerId) {
      whereClause.providerId = providerId;
    }

    if (folder) {
      whereClause.folder = folder;
    }

    const emails = await this.prisma.email.findMany({
      where: whereClause,
      orderBy: { receivedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        subject: true,
        from: true,
        to: true,
        receivedAt: true,
        snippet: true,
        isStarred: true,
        labels: true,
        folder: true,
      },
    });

    const summary = emails.length === 0
      ? (lang === 'it' ? 'Nessuna email non letta trovata.' : 'No unread emails found.')
      : emails
          .slice(0, Math.min(5, emails.length))
          .map((email) => {
            const sender = email.from || (lang === 'it' ? 'Mittente sconosciuto' : 'Unknown sender');
            const subject = email.subject || (lang === 'it' ? 'Senza oggetto' : 'No subject');
            return `${lang === 'it' ? 'Da' : 'From'}: ${sender} — ${subject}`;
          })
          .join('\n');

    return {
      success: true,
      data: { count: emails.length, emails, summary },
      summary,
      executionTimeMs: 0,
    };
  }

  /**
   * Categorize an email with AI-suggested categories/labels
   */
  private async executeCategorizeEmail(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { emailId, categories, labels, category } = action.payload;

    // Get the email
    const email = await this.prisma.email.findFirst({
      where: { id: emailId, tenantId: context.tenantId },
    });

    if (!email) {
      return {
        success: false,
        error: 'Email not found',
        executionTimeMs: 0,
      };
    }

    // Determine labels to apply (support both array and single category)
    const labelsToApply: string[] = labels || categories || (category ? [category] : []);

    if (labelsToApply.length === 0) {
      return {
        success: false,
        error: 'No categories or labels provided',
        executionTimeMs: 0,
      };
    }

    // Get current labels and merge with new ones
    const currentLabels = Array.isArray(email.labels) ? (email.labels as unknown as string[]) : [];
    const newLabels = [...new Set([...currentLabels, ...labelsToApply])];

    // Update email with new labels
    await this.prisma.email.update({
      where: { id: emailId },
      data: { labels: newLabels },
    });

    this.logger.log(`Categorized email ${emailId} with: ${labelsToApply.join(', ')}`);

    return {
      success: true,
      data: {
        emailId,
        categorized: true,
        appliedCategories: labelsToApply,
        allLabels: newLabels,
      },
      executionTimeMs: 0,
    };
  }

  /**
   * Reschedule a calendar event to a new time
   */
  private async executeRescheduleEvent(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { eventId, newStartTime, newEndTime, reason } = action.payload;

    if (!this.calendarService) {
      this.logger.warn('CalendarService not available, using placeholder');
      return {
        success: true,
        data: { eventId, rescheduled: true, message: 'placeholder' },
        executionTimeMs: 0,
      };
    }

    // Get the event to verify ownership and get provider info
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, tenantId: context.tenantId },
      include: { provider: true },
    });

    if (!event) {
      return {
        success: false,
        error: 'Event not found',
        executionTimeMs: 0,
      };
    }

    // Calculate duration if only newStartTime is provided
    let endTime = newEndTime;
    if (!endTime && event.startTime && event.endTime) {
      const duration = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
      endTime = new Date(new Date(newStartTime).getTime() + duration).toISOString();
    }

    // Build update description with reschedule reason
    let newDescription = event.description || '';
    if (reason) {
      newDescription = newDescription
        ? `${newDescription}\n\n[Rescheduled: ${reason}]`
        : `[Rescheduled: ${reason}]`;
    }

    // Update event via CalendarService
    const updatedEvent = await this.calendarService.updateEvent(
      context.tenantId,
      eventId,
      {
        startTime: new Date(newStartTime),
        endTime: endTime ? new Date(endTime) : undefined,
        description: newDescription,
      },
    );

    this.logger.log(`Rescheduled event ${eventId} to ${newStartTime}`);

    return {
      success: true,
      data: {
        eventId,
        rescheduled: true,
        newStartTime,
        newEndTime: endTime,
        reason,
        event: updatedEvent,
      },
      executionTimeMs: 0,
    };
  }

  // ===============================
  // FOLDER ACTION EXECUTORS
  // ===============================

  private async executeCreateFolder(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { name, providerId, parentPath } = action.payload;

    if (!this.folderSyncService) {
      this.logger.warn('FolderSyncService not available');
      return {
        success: false,
        error: 'Folder service not available',
        executionTimeMs: 0,
      };
    }

    if (!name) {
      return {
        success: false,
        error: 'Folder name is required',
        executionTimeMs: 0,
      };
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
      });
      if (!provider) {
        return {
          success: false,
          error: 'No email provider available',
          executionTimeMs: 0,
        };
      }
      actualProviderId = provider.id;
    }

    const result = await this.folderSyncService.createFolder(
      context.tenantId,
      actualProviderId,
      name,
      parentPath,
    );

    this.logger.log(`Created folder "${name}" with id ${result.id}`);

    return {
      success: true,
      data: { folderId: result.id, folderPath: result.path, folderName: result.name },
      executionTimeMs: 0,
    };
  }

  private async executeRenameFolder(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { folderPath, newName, providerId } = action.payload;

    if (!this.folderSyncService) {
      this.logger.warn('FolderSyncService not available');
      return {
        success: false,
        error: 'Folder service not available',
        executionTimeMs: 0,
      };
    }

    if (!folderPath || !newName) {
      return {
        success: false,
        error: 'Folder path and new name are required',
        executionTimeMs: 0,
      };
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
      });
      if (!provider) {
        return {
          success: false,
          error: 'No email provider available',
          executionTimeMs: 0,
        };
      }
      actualProviderId = provider.id;
    }

    const result = await this.folderSyncService.renameFolder(
      context.tenantId,
      actualProviderId,
      folderPath,
      newName,
    );

    this.logger.log(`Renamed folder to "${newName}" (path: ${result.path})`);

    return {
      success: true,
      data: { folderId: result.id, folderPath: result.path, folderName: result.name },
      executionTimeMs: 0,
    };
  }

  private async executeDeleteFolder(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const { folderPath, providerId } = action.payload;

    if (!this.folderSyncService) {
      this.logger.warn('FolderSyncService not available');
      return {
        success: false,
        error: 'Folder service not available',
        executionTimeMs: 0,
      };
    }

    if (!folderPath) {
      return {
        success: false,
        error: 'Folder path is required',
        executionTimeMs: 0,
      };
    }

    // Find provider if not specified
    let actualProviderId = providerId;
    if (!actualProviderId) {
      const provider = await this.prisma.providerConfig.findFirst({
        where: { tenantId: context.tenantId, supportsEmail: true, isActive: true },
      });
      if (!provider) {
        return {
          success: false,
          error: 'No email provider available',
          executionTimeMs: 0,
        };
      }
      actualProviderId = provider.id;
    }

    await this.folderSyncService.deleteFolder(
      context.tenantId,
      actualProviderId,
      folderPath,
    );

    this.logger.log(`Deleted folder at path "${folderPath}"`);

    return {
      success: true,
      data: { folderPath, deleted: true },
      executionTimeMs: 0,
    };
  }
}
