/**
 * TriageRuleService — Manages onboarding-driven triage rules per tenant.
 *
 * Rules define domain/sender/keyword/phrase patterns that map to actions
 * (important, customer-vip, system-alert, review-later, suppress).
 * These rules are injected into the LLM system prompt during email analysis.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface TriageRule {
  type: 'domain' | 'sender' | 'keyword' | 'phrase';
  pattern: string; // e.g. "acme.com", "billing@", "project alpha"
  action: 'important' | 'customer-vip' | 'system-alert' | 'review-later' | 'suppress';
  labelName?: string; // optional label to apply
}

const MAX_RULES = 50;

const VALID_RULE_TYPES = new Set<TriageRule['type']>([
  'domain',
  'sender',
  'keyword',
  'phrase',
]);

const VALID_RULE_ACTIONS = new Set<TriageRule['action']>([
  'important',
  'customer-vip',
  'system-alert',
  'review-later',
  'suppress',
]);

@Injectable()
export class TriageRuleService {
  private readonly logger = new Logger(TriageRuleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get triage rules for a tenant.
   */
  async getTriageRules(tenantId: string): Promise<TriageRule[]> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { triageRules: true },
    });

    return this.parseRules(tenant.triageRules);
  }

  /**
   * Set triage rules for a tenant. Validates shape and max count.
   */
  async setTriageRules(
    tenantId: string,
    rules: TriageRule[],
  ): Promise<TriageRule[]> {
    const validated = this.validateRules(rules);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { triageRules: validated as unknown as any },
    });

    return validated;
  }

  /**
   * Build full triage context for LLM prompt injection.
   * Merges onboarding rules with label aiPrompts and metadata.
   */
  async buildTriageContext(tenantId: string): Promise<string> {
    const [rules, labels] = await Promise.all([
      this.getTriageRules(tenantId),
      this.prisma.userLabel.findMany({
        where: { tenantId, isArchived: false },
        select: {
          name: true,
          aiPrompt: true,
          category: true,
          suppressUrgency: true,
          mutuallyExclusiveWith: true,
          defaultLane: true,
        },
        orderBy: { orderIndex: 'asc' },
      }),
    ]);

    const parts: string[] = [];

    // Label metadata section
    const labelLines = labels
      .filter((l) => l.aiPrompt || l.defaultLane || l.suppressUrgency)
      .map((l) => {
        const meta: string[] = [];
        if (l.category !== 'custom') meta.push(`category=${l.category}`);
        if (l.suppressUrgency) meta.push('suppressUrgency=true');
        if (l.defaultLane) meta.push(`defaultLane=${l.defaultLane}`);
        if (l.mutuallyExclusiveWith.length > 0) {
          meta.push(`excludes=[${l.mutuallyExclusiveWith.join(',')}]`);
        }
        const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
        return `- ${l.name}${metaStr}: ${l.aiPrompt ?? ''}`;
      });

    if (labelLines.length > 0) {
      parts.push(`<LABEL_METADATA>\n${labelLines.join('\n')}\n</LABEL_METADATA>`);
    }

    // Triage rules section
    if (rules.length > 0) {
      const ruleLines = rules.map((r) => {
        const labelSuffix = r.labelName ? ` → label:${r.labelName}` : '';
        return `- [${r.type}] "${r.pattern}" → ${r.action}${labelSuffix}`;
      });
      parts.push(
        `<TRIAGE_RULES>\n${ruleLines.join('\n')}\n</TRIAGE_RULES>`,
      );
    }

    return parts.join('\n\n');
  }

  private parseRules(raw: unknown): TriageRule[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (r): r is TriageRule =>
        r &&
        typeof r === 'object' &&
        VALID_RULE_TYPES.has(r.type) &&
        VALID_RULE_ACTIONS.has(r.action) &&
        typeof r.pattern === 'string' &&
        r.pattern.length > 0,
    );
  }

  private validateRules(rules: unknown): TriageRule[] {
    if (!Array.isArray(rules)) {
      throw new Error('triageRules must be an array');
    }

    if (rules.length > MAX_RULES) {
      throw new Error(`Maximum ${MAX_RULES} triage rules allowed`);
    }

    return rules.map((r, i) => {
      if (!r || typeof r !== 'object') {
        throw new Error(`Rule at index ${i} is not an object`);
      }
      if (!VALID_RULE_TYPES.has(r.type)) {
        throw new Error(
          `Rule at index ${i}: invalid type "${r.type}". Must be one of: ${[...VALID_RULE_TYPES].join(', ')}`,
        );
      }
      if (!VALID_RULE_ACTIONS.has(r.action)) {
        throw new Error(
          `Rule at index ${i}: invalid action "${r.action}". Must be one of: ${[...VALID_RULE_ACTIONS].join(', ')}`,
        );
      }
      if (typeof r.pattern !== 'string' || r.pattern.trim().length === 0) {
        throw new Error(`Rule at index ${i}: pattern must be a non-empty string`);
      }
      if (r.pattern.length > 200) {
        throw new Error(`Rule at index ${i}: pattern exceeds 200 characters`);
      }
      if (r.labelName !== undefined && typeof r.labelName !== 'string') {
        throw new Error(`Rule at index ${i}: labelName must be a string`);
      }

      return {
        type: r.type as TriageRule['type'],
        pattern: r.pattern.trim(),
        action: r.action as TriageRule['action'],
        ...(r.labelName ? { labelName: r.labelName } : {}),
      };
    });
  }
}
