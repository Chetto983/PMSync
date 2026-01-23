import { Injectable, Logger, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AgentAction, AgentActionType } from '../interfaces/agent-action.interface';
import { AgentContext } from '../interfaces/agent-context.interface';
import { EmailSendService } from '../../../email/services/email-send.service';
import { EmailSyncBackService } from '../../../email/services/email-sync-back.service';
import { CalendarService } from '../../../calendar/services/calendar.service';
import { FolderSyncService } from '../../../email-sync/services/folder-sync.service';
import { BulkOperationsQueueService } from '../../../email-sync/services/bulk-operations-queue.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { CorrelationContext } from '../../../../common/services/correlation-context.service';
import { PiiResolutionService } from '../../guards';
import { AiError, AiErrorCode } from '../../errors';
import { FolderExecutor, FolderExecutorDeps } from './executors/folder-executor';
import { CalendarExecutor, CalendarExecutorDeps } from './executors/calendar-executor';
import { ContactExecutor, ContactExecutorDeps } from './executors/contact-executor';
import { EmailExecutor, EmailExecutorDeps } from './executors/email-executor';
import { BulkEmailExecutor, BulkEmailExecutorDeps } from './executors/bulk-email-executor';

/** Default TTL for idempotency keys (5 minutes) */
const IDEMPOTENCY_TTL_SECONDS = 300;

/**
 * Result of executing an action.
 */
export interface ActionExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
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
    @Optional() private readonly emailSyncBackService: EmailSyncBackService,
    @Optional() private readonly calendarService: CalendarService,
    @Optional() @Inject(forwardRef(() => FolderSyncService))
    private readonly folderSyncService: FolderSyncService,
    @Optional() private readonly bulkOperationsQueue: BulkOperationsQueueService,
    @Optional() private readonly cacheService?: CacheService,
    @Optional() private readonly piiResolutionService?: PiiResolutionService,
  ) { }

  /**
   * Resolve provider ID - returns provided ID or finds default active provider.
   * Consolidates repeated provider lookup pattern (audit 2.2).
   */
  private async resolveProviderId(
    tenantId: string,
    providerId: string | undefined,
    type: 'email' | 'calendar',
  ): Promise<string> {
    if (providerId) return providerId;

    const whereClause = type === 'email'
      ? { tenantId, supportsEmail: true, isActive: true }
      : { tenantId, supportsCalendar: true, isActive: true };

    const provider = await this.prisma.providerConfig.findFirst({ where: whereClause });
    if (!provider) {
      throw new AiError(`No ${type} provider available`, AiErrorCode.PROVIDER_UNAVAILABLE);
    }

    return provider.id;
  }

  /**
   * Get dependencies for FolderExecutor (Phase 9a extraction).
   */
  private getFolderDeps(): FolderExecutorDeps {
    return {
      folderSyncService: this.folderSyncService,
      prisma: this.prisma,
      logger: this.logger,
      resolveProviderId: this.resolveProviderId.bind(this),
    };
  }

  /**
   * Get dependencies for CalendarExecutor (Phase 9b extraction).
   */
  private getCalendarDeps(): CalendarExecutorDeps {
    return {
      calendarService: this.calendarService,
      prisma: this.prisma,
      logger: this.logger,
      resolveProviderId: this.resolveProviderId.bind(this),
    };
  }

  /**
   * Get dependencies for ContactExecutor (Phase 9c extraction).
   */
  private getContactDeps(): ContactExecutorDeps {
    return {
      prisma: this.prisma,
      logger: this.logger,
    };
  }

  /**
   * Get dependencies for EmailExecutor (Phase 9d extraction).
   */
  private getEmailDeps(): EmailExecutorDeps {
    return {
      emailSendService: this.emailSendService,
      emailSyncBackService: this.emailSyncBackService,
      prisma: this.prisma,
      logger: this.logger,
      resolveProviderId: this.resolveProviderId.bind(this),
    };
  }

  /**
   * Get dependencies for BulkEmailExecutor (Phase 9d extraction).
   */
  private getBulkEmailDeps(): BulkEmailExecutorDeps {
    return {
      bulkOperationsQueue: this.bulkOperationsQueue,
      prisma: this.prisma,
      logger: this.logger,
    };
  }

  /**
   * Execute an action and return the result.
   * Routes to appropriate handler based on action type.
   *
   * Supports idempotency keys to prevent duplicate execution on retries.
   * If an action has an idempotencyKey and was already executed within
   * the TTL window, returns the cached result instead of re-executing.
   */
  async execute(
    action: AgentAction,
    context: AgentContext,
  ): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    // Get correlation ID from context or global context
    const corrId = context.correlationId || CorrelationContext.getCorrelationId();
    const logPrefix = `[${corrId}] [tenant:${context.tenantId}]`;

    this.logger.log(
      `${logPrefix} Executing action ${action.type}`,
    );

    // Check idempotency key if provided
    if (action.idempotencyKey && this.cacheService) {
      const existingResult = await this.checkIdempotency(action.idempotencyKey);
      if (existingResult) {
        this.logger.log(
          `${logPrefix} Action ${action.type} skipped - idempotency key already executed`,
        );
        return existingResult;
      }
    }

    // Resolve PII placeholders in action payload before execution
    // Converts [EMAIL_REDACTED] back to actual email addresses
    if (this.piiResolutionService && context.sessionId) {
      const resolvedPayload = await this.piiResolutionService.resolvePayload(
        context.tenantId,
        context.sessionId,
        action.payload,
      );
      if (resolvedPayload !== action.payload) {
        this.logger.debug(`${logPrefix} Resolved PII placeholders in action payload`);
        action.payload = resolvedPayload;
      }
    }

    try {
      let result: ActionExecutionResult;

      // Route to appropriate executor based on action type
      switch (action.type) {
        // Email actions (Phase 9d: delegated to EmailExecutor)
        case AgentActionType.SEND_EMAIL:
          result = await EmailExecutor.executeSendEmail(action, context, this.getEmailDeps());
          break;
        case AgentActionType.REPLY_EMAIL:
          result = await EmailExecutor.executeReplyEmail(action, context, this.getEmailDeps());
          break;
        case AgentActionType.FORWARD_EMAIL:
          result = await EmailExecutor.executeForwardEmail(action, context, this.getEmailDeps());
          break;
        case AgentActionType.DELETE_EMAIL:
          result = await EmailExecutor.executeDeleteEmail(action, context, this.getEmailDeps());
          break;
        case AgentActionType.ARCHIVE_EMAIL:
          result = await EmailExecutor.executeArchiveEmail(action, context, this.getEmailDeps());
          break;
        case AgentActionType.MARK_READ:
        case AgentActionType.MARK_UNREAD:
          result = await EmailExecutor.executeMarkEmail(action, context, this.getEmailDeps());
          break;
        case AgentActionType.STAR_EMAIL:
        case AgentActionType.UNSTAR_EMAIL:
          result = await EmailExecutor.executeStarEmail(action, context, this.getEmailDeps());
          break;
        case AgentActionType.SEARCH_EMAILS:
          result = await EmailExecutor.executeSearchEmails(action, context, this.getEmailDeps());
          break;
        case AgentActionType.LABEL_EMAIL:
          result = await EmailExecutor.executeLabelEmail(action, context, this.getEmailDeps());
          break;

        // Calendar actions (Phase 9b: delegated to CalendarExecutor)
        case AgentActionType.CREATE_EVENT:
          result = await CalendarExecutor.executeCreateEvent(action, context, this.getCalendarDeps());
          break;
        case AgentActionType.UPDATE_EVENT:
          result = await CalendarExecutor.executeUpdateEvent(action, context, this.getCalendarDeps());
          break;
        case AgentActionType.DELETE_EVENT:
          result = await CalendarExecutor.executeDeleteEvent(action, context, this.getCalendarDeps());
          break;
        case AgentActionType.GET_EVENTS:
          result = await CalendarExecutor.executeGetEvents(action, context, this.getCalendarDeps());
          break;
        case AgentActionType.CHECK_AVAILABILITY:
          result = await CalendarExecutor.executeCheckAvailability(action, context, this.getCalendarDeps());
          break;

        // Contact actions (Phase 9c: delegated to ContactExecutor)
        case AgentActionType.CREATE_CONTACT:
          result = await ContactExecutor.executeCreateContact(action, context, this.getContactDeps());
          break;
        case AgentActionType.UPDATE_CONTACT:
          result = await ContactExecutor.executeUpdateContact(action, context, this.getContactDeps());
          break;
        case AgentActionType.DELETE_CONTACT:
          result = await ContactExecutor.executeDeleteContact(action, context, this.getContactDeps());
          break;
        case AgentActionType.SEARCH_CONTACTS:
          result = await ContactExecutor.executeSearchContacts(action, context, this.getContactDeps());
          break;
        case AgentActionType.MERGE_CONTACTS:
          result = await ContactExecutor.executeMergeContacts(action, context, this.getContactDeps());
          break;
        case AgentActionType.GET_CONTACT:
          result = await ContactExecutor.executeGetContact(action, context, this.getContactDeps());
          break;

        // Additional email actions (Phase 9d: delegated to EmailExecutor)
        case AgentActionType.GET_UNREAD:
          result = await EmailExecutor.executeGetUnread(action, context, this.getEmailDeps());
          break;
        case AgentActionType.CATEGORIZE_EMAIL:
          result = await EmailExecutor.executeCategorizeEmail(action, context, this.getEmailDeps());
          break;

        // Additional calendar actions (Phase 9b: delegated to CalendarExecutor)
        case AgentActionType.RESCHEDULE_EVENT:
          result = await CalendarExecutor.executeRescheduleEvent(action, context, this.getCalendarDeps());
          break;

        // Folder actions (Phase 9a: delegated to FolderExecutor)
        case AgentActionType.CREATE_FOLDER:
          result = await FolderExecutor.executeCreateFolder(action, context, this.getFolderDeps());
          break;
        case AgentActionType.RENAME_FOLDER:
          result = await FolderExecutor.executeRenameFolder(action, context, this.getFolderDeps());
          break;
        case AgentActionType.DELETE_FOLDER:
          result = await FolderExecutor.executeDeleteFolder(action, context, this.getFolderDeps());
          break;

        // Bulk email actions (Phase 9d: delegated to BulkEmailExecutor)
        case AgentActionType.BULK_DELETE_EMAILS:
        case AgentActionType.EMPTY_FOLDER:
          result = await BulkEmailExecutor.executeBulkDeleteEmails(action, context, this.getBulkEmailDeps());
          break;
        case AgentActionType.BULK_ARCHIVE_EMAILS:
          result = await BulkEmailExecutor.executeBulkArchiveEmails(action, context, this.getBulkEmailDeps());
          break;
        case AgentActionType.BULK_MARK_READ:
          result = await BulkEmailExecutor.executeBulkMarkRead(action, context, this.getBulkEmailDeps());
          break;
        case AgentActionType.BULK_MOVE_EMAILS:
          result = await BulkEmailExecutor.executeBulkMoveEmails(action, context, this.getBulkEmailDeps());
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
        `${logPrefix} Action ${action.type} completed in ${result.executionTimeMs}ms, success: ${result.success}`,
      );

      // Store idempotency key if action succeeded and key was provided
      if (result.success && action.idempotencyKey && this.cacheService) {
        await this.storeIdempotencyResult(action.idempotencyKey, result);
      }

      return result;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`${logPrefix} Action ${action.type} failed: ${err.message}`, err.stack);
      return {
        success: false,
        error: err.message,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  // ===============================
  // IDEMPOTENCY HELPERS
  // ===============================

  /**
   * Check if an action with this idempotency key was already executed.
   * Returns the cached result if found, null otherwise.
   */
  private async checkIdempotency(
    idempotencyKey: string,
  ): Promise<ActionExecutionResult | null> {
    if (!this.cacheService) return null;

    try {
      const cached = await this.cacheService.get<ActionExecutionResult>(
        idempotencyKey,
        { namespace: CacheNamespace.ACTION_IDEMPOTENCY },
      );
      return cached ?? null;
    } catch (error) {
      // Log but don't fail - idempotency is best-effort
      this.logger.warn(
        `Failed to check idempotency key ${idempotencyKey}: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  /**
   * Store the result of an action execution for idempotency.
   */
  private async storeIdempotencyResult(
    idempotencyKey: string,
    result: ActionExecutionResult,
  ): Promise<void> {
    if (!this.cacheService) return;

    try {
      await this.cacheService.set(idempotencyKey, result, {
        namespace: CacheNamespace.ACTION_IDEMPOTENCY,
        ttl: IDEMPOTENCY_TTL_SECONDS,
      });
      this.logger.debug(`Stored idempotency key ${idempotencyKey} (TTL: ${IDEMPOTENCY_TTL_SECONDS}s)`);
    } catch (error) {
      // Log but don't fail - idempotency storage is best-effort
      this.logger.warn(
        `Failed to store idempotency key ${idempotencyKey}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Generate an idempotency key for an action based on its type and payload.
   * Use this helper to create consistent keys for actions.
   */
  static generateIdempotencyKey(
    tenantId: string,
    actionType: AgentActionType,
    payloadHash: string,
  ): string {
    return `${tenantId}:${actionType}:${payloadHash}`;
  }

  // ===============================
  // EMAIL ACTION EXECUTORS - Moved to executors/email-executor.ts (Phase 9d)
  // ===============================

  // ===============================
  // BULK EMAIL ACTION EXECUTORS - Moved to executors/bulk-email-executor.ts (Phase 9d)
  // ===============================
}
