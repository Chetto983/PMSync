/**
 * TriageSuggestionService - Bridges AI label strings to UserLabel IDs.
 *
 * Phase 18: AI Triage & Bulk Operations
 *
 * Resolves freeform aiLabels strings (from VoltAgent tools) into
 * actual UserLabel IDs. Auto-creates labels under an "AI Triage"
 * parent when no existing match is found.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LabelsService } from '../../labels/services/labels.service';

@Injectable()
export class TriageSuggestionService {
  private readonly logger = new Logger(TriageSuggestionService.name);

  /** Cache of triage parent IDs per tenant (in-memory, request-scoped optimization) */
  private readonly triageParentCache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly labelsService: LabelsService,
  ) {}

  /**
   * Resolve AI label strings to UserLabel IDs.
   * Auto-creates labels under "AI Triage" parent if they don't exist.
   *
   * @param tenantId - Tenant ID for data isolation
   * @param aiLabels - Array of freeform label strings from AI
   * @returns Map of aiLabel string -> UserLabel ID
   */
  async resolveAiLabelsToUserLabels(
    tenantId: string,
    aiLabels: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();

    for (const aiLabel of aiLabels) {
      try {
        const slug = this.generateSlug(aiLabel);
        if (!slug) {
          this.logger.warn(`[${tenantId}] Skipping empty slug for aiLabel: "${aiLabel}"`);
          continue;
        }

        // Try to find existing label by slug
        const existing = await this.prisma.userLabel.findFirst({
          where: { tenantId, slug, isArchived: false },
          select: { id: true },
        });

        if (existing) {
          result.set(aiLabel, existing.id);
          continue;
        }

        // No existing label: create under AI Triage parent
        const parent = await this.getOrCreateTriageParent(tenantId);
        const capitalizedName = this.capitalize(aiLabel);

        const newLabel = await this.labelsService.create(tenantId, {
          name: capitalizedName,
          parentId: parent.id,
        });

        result.set(aiLabel, newLabel.id);
        this.logger.log(
          `[${tenantId}] Auto-created label "${capitalizedName}" (${newLabel.id}) under AI Triage`,
        );
      } catch (error) {
        // ConflictException means slug collision (race condition) - try to find again
        if ((error as any)?.status === 409) {
          const slug = this.generateSlug(aiLabel);
          const existing = await this.prisma.userLabel.findFirst({
            where: { tenantId, slug, isArchived: false },
            select: { id: true },
          });
          if (existing) {
            result.set(aiLabel, existing.id);
            continue;
          }
        }
        this.logger.error(
          `[${tenantId}] Failed to resolve aiLabel "${aiLabel}": ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return result;
  }

  /**
   * Get or create the "AI Triage" parent label for a tenant.
   * Caches the parent ID in-memory to avoid repeated lookups.
   */
  private async getOrCreateTriageParent(
    tenantId: string,
  ): Promise<{ id: string }> {
    // Check in-memory cache first
    const cached = this.triageParentCache.get(tenantId);
    if (cached) {
      return { id: cached };
    }

    // Try to find existing AI Triage parent
    const existing = await this.prisma.userLabel.findFirst({
      where: { tenantId, slug: 'ai-triage', isArchived: false, parentId: null },
      select: { id: true },
    });

    if (existing) {
      this.triageParentCache.set(tenantId, existing.id);
      return existing;
    }

    // Create the AI Triage root label
    const parent = await this.labelsService.create(tenantId, {
      name: 'AI Triage',
    });

    this.triageParentCache.set(tenantId, parent.id);
    this.logger.log(`[${tenantId}] Created "AI Triage" parent label: ${parent.id}`);

    return { id: parent.id };
  }

  /**
   * Generate a URL-friendly slug from an AI label string.
   */
  private generateSlug(aiLabel: string): string {
    return aiLabel
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Capitalize the first letter of each word.
   */
  private capitalize(text: string): string {
    return text
      .trim()
      .split(/\s+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}
