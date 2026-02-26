/**
 * Draft Feedback Service
 * Phase 19: AI Draft Generation
 *
 * Tracks accept/edit/reject feedback for AI-generated email drafts.
 * Computes edit distance between AI draft and user-sent version.
 * Provides aggregate quality statistics for the settings panel.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export type DraftAction = 'accepted' | 'edited' | 'rejected' | 'regenerated';

export interface RecordFeedbackParams {
  draftId: string;
  tenantId: string;
  action: DraftAction;
  sentBody?: string;
}

export interface DraftStats {
  totalDrafts: number;
  acceptRate: number;
  editRate: number;
  rejectRate: number;
  avgEditDistance: number;
}

@Injectable()
export class DraftFeedbackService {
  private readonly logger = new Logger(DraftFeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record feedback for an AI-generated draft.
   * Computes edit distance if sentBody is provided.
   */
  async recordFeedback(params: RecordFeedbackParams): Promise<void> {
    const { draftId, tenantId, action, sentBody } = params;

    const draft = await this.prisma.aiDraftFeedback.findFirst({
      where: { id: draftId, tenantId },
    });

    if (!draft) {
      throw new NotFoundException(`Draft not found: ${draftId}`);
    }

    const updateData: Record<string, unknown> = {
      action,
      sentBody: sentBody ?? null,
    };

    // Compute edit distance if user sent a modified version
    if (sentBody && action === 'edited') {
      const distance = this.computeEditDistance(draft.draftBody, sentBody);
      const maxLen = Math.max(draft.draftBody.length, sentBody.length);
      updateData.editDistance = maxLen > 0 ? distance / maxLen : 0;
    } else if (action === 'accepted') {
      updateData.editDistance = 0; // Identical
    }

    await this.prisma.aiDraftFeedback.update({
      where: { id: draftId },
      data: updateData,
    });

    this.logger.log(
      `Recorded feedback for draft ${draftId}: action=${action}`,
    );
  }

  /**
   * Get aggregate draft quality statistics for a user.
   */
  async getDraftStats(tenantId: string, userId: string): Promise<DraftStats> {
    const drafts = await this.prisma.aiDraftFeedback.findMany({
      where: { tenantId, userId },
      select: {
        action: true,
        editDistance: true,
      },
    });

    const totalDrafts = drafts.length;

    if (totalDrafts === 0) {
      return {
        totalDrafts: 0,
        acceptRate: 0,
        editRate: 0,
        rejectRate: 0,
        avgEditDistance: 0,
      };
    }

    // Count by action (exclude 'pending' and 'regenerated' from rates)
    const accepted = drafts.filter((d) => d.action === 'accepted').length;
    const edited = drafts.filter((d) => d.action === 'edited').length;
    const rejected = drafts.filter((d) => d.action === 'rejected').length;
    const resolved = accepted + edited + rejected;

    // Average edit distance from edited drafts only
    const editedDrafts = drafts.filter(
      (d) => d.action === 'edited' && d.editDistance != null,
    );
    const avgEditDistance = editedDrafts.length > 0
      ? editedDrafts.reduce((sum, d) => sum + (d.editDistance ?? 0), 0) / editedDrafts.length
      : 0;

    return {
      totalDrafts,
      acceptRate: resolved > 0 ? accepted / resolved : 0,
      editRate: resolved > 0 ? edited / resolved : 0,
      rejectRate: resolved > 0 ? rejected / resolved : 0,
      avgEditDistance,
    };
  }

  /**
   * Get recent edited drafts with corrections for learning context.
   */
  async getRecentCorrections(
    tenantId: string,
    userId: string,
    limit: number = 10,
  ) {
    return this.prisma.aiDraftFeedback.findMany({
      where: {
        tenantId,
        userId,
        action: 'edited',
        sentBody: { not: null },
      },
      select: {
        id: true,
        draftBody: true,
        sentBody: true,
        editDistance: true,
        corrections: true,
        tone: true,
        locale: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Compute character-level Levenshtein distance between two strings.
   * Simple implementation suitable for draft comparison.
   * For production with large texts, consider diff-match-patch later.
   */
  private computeEditDistance(a: string, b: string): number {
    const aLen = a.length;
    const bLen = b.length;

    // Optimization: if one string is empty, distance is the other's length
    if (aLen === 0) return bLen;
    if (bLen === 0) return aLen;

    // Use two-row optimization to reduce memory from O(m*n) to O(min(m,n))
    const shorter = aLen < bLen ? a : b;
    const longer = aLen < bLen ? b : a;
    const shortLen = shorter.length;
    const longLen = longer.length;

    let prevRow = new Array<number>(shortLen + 1);
    let currRow = new Array<number>(shortLen + 1);

    // Initialize first row
    for (let j = 0; j <= shortLen; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= longLen; i++) {
      currRow[0] = i;

      for (let j = 1; j <= shortLen; j++) {
        const cost = longer[i - 1] === shorter[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          currRow[j - 1] + 1,       // insertion
          prevRow[j] + 1,           // deletion
          prevRow[j - 1] + cost,    // substitution
        );
      }

      // Swap rows
      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[shortLen];
  }
}
