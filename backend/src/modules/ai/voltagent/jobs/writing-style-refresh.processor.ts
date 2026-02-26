/**
 * Writing Style Refresh Processor (Phase 19)
 *
 * Weekly cron job that re-analyzes sent emails for all users with existing
 * writing style profiles. Runs every Sunday at 3 AM to keep style
 * profiles current as user writing evolves.
 *
 * Per-provider profiles are refreshed independently, so work email
 * style stays separate from personal email style.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../../../prisma/prisma.service';
import { WritingStyleService } from '../services/writing-style.service';

@Injectable()
export class WritingStyleRefreshProcessor {
  private readonly logger = new Logger(WritingStyleRefreshProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writingStyleService: WritingStyleService,
  ) {}

  /**
   * Weekly style refresh: re-analyze sent emails for all users with existing profiles.
   * Runs every Sunday at 3 AM (same time slot as other maintenance crons).
   */
  @Cron('0 3 * * 0') // Sunday 3 AM
  async refreshAllProfiles(): Promise<void> {
    this.logger.log('Starting weekly writing style refresh...');

    // Fetch all distinct (tenantId, userId, providerId) combinations with existing profiles
    const profiles = await this.prisma.writingStyleProfile.findMany({
      select: { tenantId: true, userId: true, providerId: true },
    });

    let refreshed = 0;
    let errors = 0;

    for (const profile of profiles) {
      try {
        await this.writingStyleService.analyzeUserEmails(
          profile.tenantId,
          profile.userId,
          50,
          profile.providerId ?? undefined,
        );
        refreshed++;
      } catch (error) {
        errors++;
        this.logger.warn(
          `Failed to refresh style for user ${profile.userId} provider ${profile.providerId}: ${error}`,
        );
      }
    }

    this.logger.log(
      `Weekly style refresh complete: ${refreshed} refreshed, ${errors} errors, ${profiles.length} total`,
    );
  }
}
