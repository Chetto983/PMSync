/**
 * TriageRuleService - Manages onboarding-driven triage rules per tenant.
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
  action:
    | 'important'
    | 'customer-vip'
    | 'system-alert'
    | 'review-later'
    | 'suppress'
    | 'billing'
    | 'follow-up';
  labelName?: string; // optional label to apply
}

export interface BuildTriageContextOptions {
  includeLabelPrompts?: boolean;
  includeLabelMetadata?: boolean;
  maxLength?: number;
  maxRules?: number;
  maxLineLength?: number;
  maxLabelPromptLength?: number;
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
  'billing',
  'follow-up',
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
   * Build triage context for LLM prompt injection.
   * Can emit either the full context or a compact, length-bounded variant.
   */
  async buildTriageContext(
    tenantId: string,
    options: BuildTriageContextOptions = {},
  ): Promise<string> {
    const {
      includeLabelPrompts = true,
      includeLabelMetadata = true,
      maxLength,
      maxRules = MAX_RULES,
      maxLineLength = 220,
      maxLabelPromptLength = 180,
    } = options;

    const [rules, labels] = await Promise.all([
      this.getTriageRules(tenantId),
      includeLabelMetadata
        ? this.prisma.userLabel.findMany({
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
          })
        : Promise.resolve([]),
    ]);

    const labelLines = labels
      .filter((label) => label.aiPrompt || label.defaultLane || label.suppressUrgency)
      .map((label) => {
        const meta: string[] = [];
        if (label.category !== 'custom') meta.push(`category=${label.category}`);
        if (label.suppressUrgency) meta.push('suppressUrgency=true');
        if (label.defaultLane) meta.push(`defaultLane=${label.defaultLane}`);
        if (label.mutuallyExclusiveWith.length > 0) {
          meta.push(`excludes=[${label.mutuallyExclusiveWith.join(',')}]`);
        }
        const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
        const promptSuffix = includeLabelPrompts && label.aiPrompt
          ? `: ${this.truncateText(label.aiPrompt, maxLabelPromptLength)}`
          : '';
        return this.truncateText(`- ${label.name}${metaStr}${promptSuffix}`, maxLineLength);
      });

    const ruleLines = rules
      .slice(0, maxRules)
      .map((rule) => {
        const labelSuffix = rule.labelName ? ` -> label:${rule.labelName}` : '';
        return this.truncateText(
          `- [${rule.type}] "${rule.pattern}" -> ${rule.action}${labelSuffix}`,
          maxLineLength,
        );
      });

    const sections: string[] = [];
    if (maxLength) {
      const wantsLabels = labelLines.length > 0;
      const wantsRules = ruleLines.length > 0;
      const labelBudget = wantsLabels
        ? Math.floor(maxLength * (wantsRules ? 0.45 : 1))
        : 0;
      const ruleBudget = wantsRules
        ? maxLength - labelBudget - (wantsLabels ? 2 : 0)
        : 0;

      const labelSection = this.buildSection('LABEL_METADATA', labelLines, labelBudget || undefined);
      if (labelSection) sections.push(labelSection);

      const remainingBudget = ruleBudget > 0
        ? ruleBudget
        : Math.max(0, maxLength - sections.join('\n\n').length - (sections.length > 0 ? 2 : 0));
      const ruleSection = this.buildSection('TRIAGE_RULES', ruleLines, remainingBudget || undefined);
      if (ruleSection) sections.push(ruleSection);
    } else {
      const labelSection = this.buildSection('LABEL_METADATA', labelLines);
      if (labelSection) sections.push(labelSection);

      const ruleSection = this.buildSection('TRIAGE_RULES', ruleLines);
      if (ruleSection) sections.push(ruleSection);
    }

    const context = sections.join('\n\n');
    if (maxLength && context.length > maxLength) {
      this.logger.warn(`Triage context exceeded budget after compaction: ${context.length}/${maxLength}`);
      return context.slice(0, maxLength);
    }
    return context;
  }

  private buildSection(
    tag: string,
    lines: string[],
    maxLength?: number,
  ): string {
    if (lines.length === 0) return '';

    const open = `<${tag}>`;
    const close = `</${tag}>`;
    const limit = typeof maxLength === 'number' ? maxLength : Number.MAX_SAFE_INTEGER;
    const overhead = open.length + close.length + 2;
    if (limit <= overhead) return '';

    const accepted: string[] = [];
    let currentLength = overhead;

    for (const line of lines) {
      const normalized = line.trim();
      if (!normalized) continue;

      const lineCost = normalized.length + (accepted.length > 0 ? 1 : 0);
      if (currentLength + lineCost > limit) {
        const available = limit - currentLength - (accepted.length > 0 ? 1 : 0);
        if (available > 6) {
          accepted.push(this.truncateText(normalized, available));
        }
        break;
      }

      accepted.push(normalized);
      currentLength += lineCost;
    }

    if (accepted.length === 0) return '';
    return `${open}\n${accepted.join('\n')}\n${close}`;
  }

  private truncateText(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (maxLength <= 0) return '';
    if (normalized.length <= maxLength) return normalized;
    if (maxLength <= 3) return normalized.slice(0, maxLength);
    return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
  }

  private parseRules(raw: unknown): TriageRule[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (rule): rule is TriageRule =>
        Boolean(rule)
        && typeof rule === 'object'
        && VALID_RULE_TYPES.has(rule.type)
        && VALID_RULE_ACTIONS.has(rule.action)
        && typeof rule.pattern === 'string'
        && rule.pattern.length > 0,
    );
  }

  private validateRules(rules: unknown): TriageRule[] {
    if (!Array.isArray(rules)) {
      throw new Error('triageRules must be an array');
    }

    if (rules.length > MAX_RULES) {
      throw new Error(`Maximum ${MAX_RULES} triage rules allowed`);
    }

    return rules.map((rule, index) => {
      if (!rule || typeof rule !== 'object') {
        throw new Error(`Rule at index ${index} is not an object`);
      }
      if (!VALID_RULE_TYPES.has(rule.type)) {
        throw new Error(
          `Rule at index ${index}: invalid type "${rule.type}". Must be one of: ${[...VALID_RULE_TYPES].join(', ')}`,
        );
      }
      if (!VALID_RULE_ACTIONS.has(rule.action)) {
        throw new Error(
          `Rule at index ${index}: invalid action "${rule.action}". Must be one of: ${[...VALID_RULE_ACTIONS].join(', ')}`,
        );
      }
      if (typeof rule.pattern !== 'string' || rule.pattern.trim().length === 0) {
        throw new Error(`Rule at index ${index}: pattern must be a non-empty string`);
      }
      if (rule.pattern.length > 200) {
        throw new Error(`Rule at index ${index}: pattern exceeds 200 characters`);
      }
      if (rule.labelName !== undefined && typeof rule.labelName !== 'string') {
        throw new Error(`Rule at index ${index}: labelName must be a string`);
      }

      return {
        type: rule.type as TriageRule['type'],
        pattern: rule.pattern.trim(),
        action: rule.action as TriageRule['action'],
        ...(rule.labelName ? { labelName: rule.labelName } : {}),
      };
    });
  }
}
