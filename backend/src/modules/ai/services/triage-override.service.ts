import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type OverrideType = 'sender' | 'domain' | 'thread';
export type OverrideAction =
  | 'always-important'
  | 'always-review-later'
  | 'always-system-alert'
  | 'never-follow-up'
  | 'always-customer-vip';

export interface TriageOverride {
  id: string;
  tenantId: string;
  type: OverrideType;
  pattern: string;
  action: OverrideAction;
  createdAt: Date;
}

export interface OverrideResult {
  matched: boolean;
  override?: TriageOverride;
  lane?: string;
  suppressFollowUp?: boolean;
}

const VALID_TYPES: OverrideType[] = ['sender', 'domain', 'thread'];
const VALID_ACTIONS: OverrideAction[] = [
  'always-important',
  'always-review-later',
  'always-system-alert',
  'never-follow-up',
  'always-customer-vip',
];

export const ACTION_TO_LANE: Record<string, string | undefined> = {
  'always-important': 'action-now',
  'always-review-later': 'review-later',
  'always-system-alert': 'system-alerts',
  'always-customer-vip': 'customer-vip',
};

// Phase 147 Plan 05 D-06: inverse of ACTION_TO_LANE. Used by TriagePromotionService
// to translate a lane_correction suggestion's `target` (lane name) back into the
// override `action` that TriageOverride.addOverride accepts. Both maps must stay
// inverse — if you add a lane here, add it to ACTION_TO_LANE too.
export const LANE_TO_ACTION: Record<string, string | undefined> = {
  'action-now': 'always-important',
  'review-later': 'always-review-later',
  'system-alerts': 'always-system-alert',
  'customer-vip': 'always-customer-vip',
};

// Phase 147 D-07: muting actions skip the LLM call entirely. never-follow-up
// additionally suppresses the post-triage follow-up creation.
export const MUTING_ACTIONS: ReadonlySet<string> = new Set([
  'always-system-alert',
  'never-follow-up',
]);

const MAX_OVERRIDES_PER_TENANT = 100;

@Injectable()
export class TriageOverrideService {
  private readonly logger = new Logger(TriageOverrideService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOverrides(tenantId: string): Promise<TriageOverride[]> {
    const rows = await this.prisma.triageOverride.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows as TriageOverride[];
  }

  async addOverride(
    tenantId: string,
    type: string,
    pattern: string,
    action: string,
  ): Promise<TriageOverride> {
    if (!VALID_TYPES.includes(type as OverrideType)) {
      throw new BadRequestException(`Invalid override type: ${type}`);
    }
    if (!VALID_ACTIONS.includes(action as OverrideAction)) {
      throw new BadRequestException(`Invalid override action: ${action}`);
    }
    if (!pattern || pattern.length > 255) {
      throw new BadRequestException('Pattern must be 1-255 characters');
    }

    const count = await this.prisma.triageOverride.count({ where: { tenantId } });
    if (count >= MAX_OVERRIDES_PER_TENANT) {
      throw new BadRequestException(`Max ${MAX_OVERRIDES_PER_TENANT} overrides per tenant`);
    }

    const normalizedPattern = pattern.toLowerCase().trim();

    const row = await this.prisma.triageOverride.upsert({
      where: {
        tenantId_type_pattern: { tenantId, type, pattern: normalizedPattern },
      },
      update: { action },
      create: { tenantId, type, pattern: normalizedPattern, action },
    });

    this.logger.log(`Override created: ${type}:${normalizedPattern} → ${action} (tenant=${tenantId})`);
    return row as TriageOverride;
  }

  async removeOverride(tenantId: string, id: string): Promise<void> {
    await this.prisma.triageOverride.deleteMany({
      where: { id, tenantId },
    });
  }

  async applyOverrides(
    tenantId: string,
    email: { from: string; threadId?: string | null },
  ): Promise<OverrideResult> {
    const overrides = await this.getOverrides(tenantId);
    if (overrides.length === 0) return { matched: false };

    const fromLower = email.from.toLowerCase();
    const senderEmail = extractEmail(fromLower);
    const senderDomain = senderEmail ? senderEmail.split('@')[1] : null;

    for (const override of overrides) {
      let matches = false;

      switch (override.type) {
        case 'sender':
          matches = senderEmail === override.pattern || fromLower.includes(override.pattern);
          break;
        case 'domain':
          matches = senderDomain === override.pattern;
          break;
        case 'thread':
          matches = email.threadId === override.pattern;
          break;
      }

      if (matches) {
        return {
          matched: true,
          override,
          lane: ACTION_TO_LANE[override.action],
          suppressFollowUp: override.action === 'never-follow-up',
        };
      }
    }

    return { matched: false };
  }
}

export function extractEmail(from: string): string | null {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  if (from.includes('@')) return from.toLowerCase().trim();
  return null;
}
