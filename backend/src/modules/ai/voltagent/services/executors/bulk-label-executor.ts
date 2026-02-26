/**
 * Bulk Label & Follow-Up Executor - Handles bulk label application and follow-up creation.
 * Phase 18: AI Triage & Bulk Operations (2026-02-26)
 *
 * Static methods to avoid additional DI complexity.
 * Dependencies passed via BulkLabelExecutorDeps interface.
 *
 * CRITICAL: All label operations go through LabelsService.addEmailsToLabel()
 * which uses the EmailLabel join table. Do NOT touch Email.labels String[].
 */
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { LabelsService } from '../../../../labels/services/labels.service';
import { TriageSuggestionService } from '../../../services/triage-suggestion.service';
import { FollowUpCrudService } from '../follow-up-crud.service';
import { AgentAction } from '../../interfaces/agent-action.interface';
import { AgentContext } from '../../interfaces/agent-context.interface';
import { ActionExecutionResult } from '../action-executor.service';
import { getLocale, actionSummaries as t } from '../../locales/action-summaries';

/** Dependencies required for bulk label executor methods */
export interface BulkLabelExecutorDeps {
  labelsService: LabelsService | null;
  triageSuggestionService: TriageSuggestionService | null;
  followUpCrudService: FollowUpCrudService | null;
  prisma: PrismaService;
  logger: Logger;
}

/**
 * Static executor for bulk label and follow-up operations.
 * Keeps ActionExecutorService as thin orchestrator.
 */
export class BulkLabelExecutor {
  /**
   * Apply labels to multiple emails.
   *
   * Supports two modes:
   * - labelNames: AI label strings resolved to UserLabel IDs via TriageSuggestionService
   * - labelIds: Direct UserLabel IDs used as-is
   */
  static async executeBulkApplyLabels(
    action: AgentAction,
    context: AgentContext,
    deps: BulkLabelExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const { emailIds, labelNames, labelIds } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!deps.labelsService) {
      return {
        success: false,
        error: 'Labels service not available',
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (!emailIds || emailIds.length === 0) {
      return {
        success: false,
        error: 'No emails provided for label application',
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Resolve label IDs
    let resolvedLabelIds: string[] = [];
    let labelDisplayNames: string[] = [];

    if (labelNames?.length && deps.triageSuggestionService) {
      // Resolve AI label strings to UserLabel IDs (auto-creates under "AI Triage")
      const labelMap = await deps.triageSuggestionService.resolveAiLabelsToUserLabels(
        context.tenantId,
        labelNames,
      );
      resolvedLabelIds = Array.from(labelMap.values());
      labelDisplayNames = labelNames;
    } else if (labelIds?.length) {
      resolvedLabelIds = labelIds;
      labelDisplayNames = labelIds; // Will show IDs if no names available
    } else {
      return {
        success: false,
        error: 'No labelNames or labelIds provided',
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Apply each label to all emails
    let appliedCount = 0;
    let failedCount = 0;

    for (const labelId of resolvedLabelIds) {
      try {
        await deps.labelsService.addEmailsToLabel(
          context.tenantId,
          labelId,
          { emailIds },
        );
        appliedCount++;
      } catch (error) {
        failedCount++;
        deps.logger.warn(
          `[${context.tenantId}] Failed to apply label ${labelId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const labelsStr = labelDisplayNames.join(', ');
    const summary = t.bulkApplyLabelsQueued?.[lang]
      ? t.bulkApplyLabelsQueued[lang](emailIds.length, labelsStr)
      : `Applied labels [${labelsStr}] to ${emailIds.length} email${emailIds.length === 1 ? '' : 's'}.`;

    return {
      success: appliedCount > 0,
      data: {
        appliedLabels: appliedCount,
        failedLabels: failedCount,
        emailCount: emailIds.length,
        labels: labelDisplayNames,
      },
      summary,
      executionTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Create follow-ups for multiple emails.
   *
   * Skips emails that already have active follow-ups (PENDING/REMINDED).
   * Uses FollowUpCrudService which handles dedup internally.
   */
  static async executeBulkCreateFollowUps(
    action: AgentAction,
    context: AgentContext,
    deps: BulkLabelExecutorDeps,
  ): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const { emailIds, reason, dueDays } = action.payload;
    const lang = getLocale(context.preferences?.language);

    if (!deps.followUpCrudService) {
      return {
        success: false,
        error: 'Follow-up service not available',
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (!emailIds || emailIds.length === 0) {
      return {
        success: false,
        error: 'No emails provided for follow-up creation',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const dueDate = new Date(Date.now() + (dueDays || 3) * 86400000);
    let createdCount = 0;
    let skippedCount = 0;

    for (const emailId of emailIds) {
      try {
        const followUp = await deps.followUpCrudService.createFollowUp({
          tenantId: context.tenantId,
          userId: context.userId,
          emailId,
          reason: reason || 'AI bulk follow-up',
          dueDate,
          followUpType: 'TODO',
        });

        // FollowUpCrudService returns existing follow-up if already exists
        // Check if it was newly created (createdAt within last few seconds)
        const isNew = Date.now() - new Date(followUp.createdAt).getTime() < 5000;
        if (isNew) {
          createdCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        skippedCount++;
        deps.logger.warn(
          `[${context.tenantId}] Failed to create follow-up for email ${emailId}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const summary = t.bulkCreateFollowUpsQueued?.[lang]
      ? t.bulkCreateFollowUpsQueued[lang](createdCount, skippedCount)
      : `Created follow-ups for ${createdCount} email${createdCount === 1 ? '' : 's'}${skippedCount > 0 ? ` (${skippedCount} already tracked)` : ''}.`;

    return {
      success: createdCount > 0 || skippedCount > 0,
      data: {
        created: createdCount,
        skipped: skippedCount,
        total: emailIds.length,
        dueDate: dueDate.toISOString(),
      },
      summary,
      executionTimeMs: Date.now() - startTime,
    };
  }
}
