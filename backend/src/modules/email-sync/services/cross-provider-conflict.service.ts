import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type ConflictStrategy =
  | 'LAST_WRITE_WINS' // Most recent update wins
  | 'UNION' // Merge all states (read if any is read, starred if any is starred)
  | 'INTERSECTION' // Only apply if all agree (read only if all are read)
  | 'PRIORITY_BASED'; // Provider with highest priority wins

export interface EmailState {
  emailId: string;
  providerId: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  labels: string[];
  updatedAt: Date;
}

export interface ConflictResolution {
  resolvedIsRead: boolean;
  resolvedIsStarred: boolean;
  resolvedFolder: string;
  resolvedLabels: string[];
  hasConflict: boolean;
  conflictDetails?: {
    readConflict: boolean;
    starredConflict: boolean;
    folderConflict: boolean;
    strategy: ConflictStrategy;
  };
}

@Injectable()
export class CrossProviderConflictService {
  private readonly logger = new Logger(CrossProviderConflictService.name);
  private readonly providerPriority: Record<string, number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    // Priorità provider configurabile via env CROSS_PROVIDER_PRIORITY_JSON (es. {"google":1,"microsoft":2,"generic":3})
    const raw = this.config.get<string>('CROSS_PROVIDER_PRIORITY_JSON');
    if (raw) {
      try {
        this.providerPriority = JSON.parse(raw);
      } catch (error) {
        this.logger.warn(
          `Failed to parse CROSS_PROVIDER_PRIORITY_JSON: ${
            error instanceof Error ? error.message : String(error)
          } - using defaults.`,
        );
        this.providerPriority = {
          google: 1,
          microsoft: 2,
          generic: 3,
        };
      }
    } else {
      this.providerPriority = {
        google: 1,
        microsoft: 2,
        generic: 3,
      };
    }
  }

  /**
   * Elenco conflitti recenti per tenant (per report/diagnostica)
   */
  async listRecentConflicts(
    tenantId: string,
    limit = 50,
  ): Promise<
    Array<{
      linkId: string;
      lastConflictAt: Date | null;
      lastConflict?: Record<string, any> | null;
    }>
  > {
    const links = await this.prisma.emailCrossProviderLink.findMany({
      where: {
        tenantId,
        lastConflict: { not: Prisma.JsonNull },
      },
      orderBy: { lastConflictAt: 'desc' },
      take: limit,
      select: {
        id: true,
        lastConflictAt: true,
        lastConflict: true,
      },
    });

    return links.map((l) => ({
      linkId: l.id,
      lastConflictAt: l.lastConflictAt,
      lastConflict: l.lastConflict as Record<string, any> | null,
    }));
  }

  /**
   * Resolve conflicts between email states from different providers
   */
  async resolveConflicts(
    crossProviderLinkId: string,
    states: EmailState[],
    strategy: ConflictStrategy = 'LAST_WRITE_WINS',
  ): Promise<ConflictResolution> {
    if (states.length === 0) {
      throw new Error('No states provided for conflict resolution');
    }

    if (states.length === 1) {
      // No conflict - single state
      const state = states[0];
      return {
        resolvedIsRead: state.isRead,
        resolvedIsStarred: state.isStarred,
        resolvedFolder: state.folder,
        resolvedLabels: state.labels,
        hasConflict: false,
      };
    }

    // Detect conflicts
    const readStates = new Set(states.map((s) => s.isRead));
    const starredStates = new Set(states.map((s) => s.isStarred));
    const folderStates = new Set(states.map((s) => s.folder));

    const hasReadConflict = readStates.size > 1;
    const hasStarredConflict = starredStates.size > 1;
    const hasFolderConflict = folderStates.size > 1;
    const hasConflict =
      hasReadConflict || hasStarredConflict || hasFolderConflict;

    let resolution: ConflictResolution;

    switch (strategy) {
      case 'LAST_WRITE_WINS':
        resolution = this.resolveLastWriteWins(states);
        break;
      case 'UNION':
        resolution = this.resolveUnion(states);
        break;
      case 'INTERSECTION':
        resolution = this.resolveIntersection(states);
        break;
      case 'PRIORITY_BASED':
        resolution = this.resolvePriorityBased(states);
        break;
      default:
        resolution = this.resolveLastWriteWins(states);
    }

    if (hasConflict) {
      resolution.hasConflict = true;
      resolution.conflictDetails = {
        readConflict: hasReadConflict,
        starredConflict: hasStarredConflict,
        folderConflict: hasFolderConflict,
        strategy,
      };

      // Log conflict
      await this.logConflict(crossProviderLinkId, states, resolution);

      this.logger.debug(
        `Resolved conflict for link ${crossProviderLinkId} using ${strategy}: ` +
          `read=${resolution.resolvedIsRead}, starred=${resolution.resolvedIsStarred}, folder=${resolution.resolvedFolder}`,
      );
    }

    // Update cross-provider link with merged state
    await this.prisma.emailCrossProviderLink.update({
      where: { id: crossProviderLinkId },
      data: {
        mergedIsRead: resolution.resolvedIsRead,
        mergedIsStarred: resolution.resolvedIsStarred,
        mergedFolder: resolution.resolvedFolder,
        mergedLabels: resolution.resolvedLabels,
        lastSyncedAt: new Date(),
        lastConflictAt: hasConflict ? new Date() : undefined,
      },
    });

    return resolution;
  }

  /**
   * Strategy: Last Write Wins
   * The most recently updated state wins
   */
  private resolveLastWriteWins(states: EmailState[]): ConflictResolution {
    const mostRecent = states.reduce((latest, current) =>
      current.updatedAt > latest.updatedAt ? current : latest,
    );

    return {
      resolvedIsRead: mostRecent.isRead,
      resolvedIsStarred: mostRecent.isStarred,
      resolvedFolder: mostRecent.folder,
      resolvedLabels: mostRecent.labels,
      hasConflict: false,
    };
  }

  /**
   * Strategy: Union
   * If any provider says "read" or "starred", consider it read/starred
   */
  private resolveUnion(states: EmailState[]): ConflictResolution {
    const isReadAny = states.some((s) => s.isRead);
    const isStarredAny = states.some((s) => s.isStarred);

    // For folder, use the most recent state's folder (folder conflicts resolved by last write)
    // Note: We don't normalize folder names here - actual folder paths are preserved
    const sortedByDate = [...states].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
    const folder = sortedByDate[0].folder;

    // Union of all labels
    const allLabels = [...new Set(states.flatMap((s) => s.labels))];

    return {
      resolvedIsRead: isReadAny,
      resolvedIsStarred: isStarredAny,
      resolvedFolder: folder,
      resolvedLabels: allLabels,
      hasConflict: false,
    };
  }

  /**
   * Strategy: Intersection
   * Only mark as read/starred if ALL providers agree
   */
  private resolveIntersection(states: EmailState[]): ConflictResolution {
    const isReadAll = states.every((s) => s.isRead);
    const isStarredAll = states.every((s) => s.isStarred);

    // For folder, only use if all agree, otherwise use most recent
    // Note: We don't normalize folder names - actual folder paths are preserved
    const folders = new Set(states.map((s) => s.folder));
    let folder: string;
    if (folders.size === 1) {
      folder = states[0].folder;
    } else {
      // If folders don't agree, use the most recently updated state's folder
      const sortedByDate = [...states].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      );
      folder = sortedByDate[0].folder;
    }

    // Intersection of labels (only labels present in all states)
    const labelSets = states.map((s) => new Set(s.labels));
    const commonLabels = [...labelSets[0]].filter((label) =>
      labelSets.every((set) => set.has(label)),
    );

    return {
      resolvedIsRead: isReadAll,
      resolvedIsStarred: isStarredAll,
      resolvedFolder: folder,
      resolvedLabels: commonLabels,
      hasConflict: false,
    };
  }

  /**
   * Strategy: Priority Based
   * Google > Microsoft > IMAP
   */
  private resolvePriorityBased(states: EmailState[]): ConflictResolution {
    // Define provider priority (lower number = higher priority)
    const getProviderPriority = (providerId: string): number => {
      const lower = providerId.toLowerCase();
      if (this.providerPriority[lower] !== undefined) {
        return this.providerPriority[lower];
      }
      if (lower.includes('google')) return this.providerPriority['google'] ?? 1;
      if (lower.includes('microsoft')) return this.providerPriority['microsoft'] ?? 2;
      return this.providerPriority['generic'] ?? 3;
    };

    const sortedStates = [...states].sort(
      (a, b) =>
        getProviderPriority(a.providerId) - getProviderPriority(b.providerId),
    );

    const highestPriority = sortedStates[0];

    return {
      resolvedIsRead: highestPriority.isRead,
      resolvedIsStarred: highestPriority.isStarred,
      resolvedFolder: highestPriority.folder,
      resolvedLabels: highestPriority.labels,
      hasConflict: false,
    };
  }

  /**
   * Log conflict details to database
   */
  private async logConflict(
    crossProviderLinkId: string,
    states: EmailState[],
    resolution: ConflictResolution,
  ): Promise<void> {
    const conflictData = {
      timestamp: new Date().toISOString(),
      states: states.map((s) => ({
        providerId: s.providerId,
        isRead: s.isRead,
        isStarred: s.isStarred,
        folder: s.folder,
        updatedAt: s.updatedAt.toISOString(),
      })),
      resolution: {
        isRead: resolution.resolvedIsRead,
        isStarred: resolution.resolvedIsStarred,
        folder: resolution.resolvedFolder,
      },
    };

    await this.prisma.emailCrossProviderLink.update({
      where: { id: crossProviderLinkId },
      data: {
        lastConflict: conflictData,
      },
    });
  }

  /**
   * Apply resolved state to all linked emails
   */
  async applyResolvedState(
    crossProviderLinkId: string,
    resolution: ConflictResolution,
  ): Promise<number> {
    const result = await this.prisma.email.updateMany({
      where: { crossProviderLinkId },
      data: {
        isRead: resolution.resolvedIsRead,
        isStarred: resolution.resolvedIsStarred,
        folder: resolution.resolvedFolder,
      },
    });

    this.logger.verbose(
      `Applied resolved state to ${result.count} emails in link ${crossProviderLinkId}`,
    );

    return result.count;
  }

  /**
   * Get conflict statistics for a tenant
   */
  async getConflictStats(tenantId: string): Promise<{
    totalConflicts: number;
    recentConflicts: number;
    avgResolutionTime: number;
  }> {
    const links = await this.prisma.emailCrossProviderLink.findMany({
      where: {
        tenantId,
        lastConflictAt: { not: null },
      },
      select: {
        lastConflictAt: true,
        lastSyncedAt: true,
      },
    });

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    const recentConflicts = links.filter(
      (link) =>
        link.lastConflictAt &&
        link.lastConflictAt.getTime() > oneHourAgo,
    ).length;

    // LB-8 Fix: Filter out negative resolution times that can occur due to race conditions
    // (when lastSyncedAt is before lastConflictAt)
    const resolutionTimes = links
      .filter(
        (link) => link.lastConflictAt && link.lastSyncedAt,
      )
      .map(
        (link) =>
          link.lastSyncedAt.getTime() - link.lastConflictAt!.getTime(),
      )
      .filter((time) => time >= 0); // Only include non-negative resolution times

    const avgResolutionTime =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce((sum, time) => sum + time, 0) /
          resolutionTimes.length
        : 0;

    return {
      totalConflicts: links.length,
      recentConflicts,
      avgResolutionTime: Math.round(avgResolutionTime),
    };
  }
}
