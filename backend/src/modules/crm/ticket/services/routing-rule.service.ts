import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

/** A single condition in a routing rule */
interface RuleCondition {
  field: 'subject_keyword' | 'sender_domain' | 'priority';
  operator: 'contains' | 'equals' | 'not_equals';
  value: string;
}

/** Action to apply when all conditions match */
interface RuleAction {
  assignTo?: string; // userId
  setPriority?: string; // low | medium | high | urgent
}

/** Ticket data passed to the evaluator */
export interface TicketForRouting {
  subject: string;
  priority: string;
  senderEmail?: string;
}

/**
 * Routing Rule Engine
 *
 * Evaluates active routing rules in priority order against a ticket.
 * First matching rule wins. Supported conditions:
 * - subject_keyword (contains)
 * - sender_domain (equals domain part of sender email)
 * - priority (equals / not_equals)
 */
@Injectable()
export class RoutingRuleService {
  private readonly logger = new Logger(RoutingRuleService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Evaluate routing rules for a ticket.
   * Returns the action from the first matching rule, or null.
   */
  async evaluate(
    tenantId: string,
    ticket: TicketForRouting,
  ): Promise<RuleAction | null> {
    const rules = await this.prisma.routingRule.findMany({
      where: { tenantId, active: true },
      orderBy: { priority: 'desc' }, // higher priority first
    });

    for (const rule of rules) {
      const conditions = rule.conditions as unknown as RuleCondition[];
      if (!Array.isArray(conditions) || conditions.length === 0) continue;

      const allMatch = conditions.every((cond) =>
        this.evaluateCondition(cond, ticket),
      );

      if (allMatch) {
        this.logger.log(
          `Routing rule "${rule.name}" matched for ticket [${ticket.subject}]`,
        );
        return rule.action as unknown as RuleAction;
      }
    }

    return null;
  }

  private evaluateCondition(
    cond: RuleCondition,
    ticket: TicketForRouting,
  ): boolean {
    switch (cond.field) {
      case 'subject_keyword':
        return this.evalSubjectKeyword(cond, ticket.subject);

      case 'sender_domain':
        return this.evalSenderDomain(cond, ticket.senderEmail);

      case 'priority':
        return this.evalPriority(cond, ticket.priority);

      default:
        this.logger.warn(`Unknown routing condition field: ${cond.field}`);
        return false;
    }
  }

  private evalSubjectKeyword(
    cond: RuleCondition,
    subject: string,
  ): boolean {
    const keyword = cond.value.toLowerCase();
    const subjectLower = subject.toLowerCase();

    if (cond.operator === 'contains') {
      return subjectLower.includes(keyword);
    }
    if (cond.operator === 'equals') {
      return subjectLower === keyword;
    }
    if (cond.operator === 'not_equals') {
      return subjectLower !== keyword;
    }
    return false;
  }

  private evalSenderDomain(
    cond: RuleCondition,
    senderEmail?: string,
  ): boolean {
    if (!senderEmail) return false;

    // Extract domain from email
    const atIndex = senderEmail.lastIndexOf('@');
    if (atIndex < 0) return false;
    const domain = senderEmail.substring(atIndex + 1).toLowerCase();
    const condDomain = cond.value.toLowerCase();

    if (cond.operator === 'equals') {
      return domain === condDomain;
    }
    if (cond.operator === 'not_equals') {
      return domain !== condDomain;
    }
    if (cond.operator === 'contains') {
      return domain.includes(condDomain);
    }
    return false;
  }

  private evalPriority(
    cond: RuleCondition,
    priority: string,
  ): boolean {
    const condValue = cond.value.toLowerCase();
    const ticketPriority = priority.toLowerCase();

    if (cond.operator === 'equals') {
      return ticketPriority === condValue;
    }
    if (cond.operator === 'not_equals') {
      return ticketPriority !== condValue;
    }
    return false;
  }
}
