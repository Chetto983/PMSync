/**
 * CRM Segmentation Engine
 *
 * Transforms JSON rule definitions into Prisma where clauses.
 * Supports standard contact fields + custom fields via subquery.
 * Operators: eq, neq, contains, gt, gte, lt, lte, in, isNull.
 * Logical groups: AND, OR.
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export type SegmentOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'isNull';

export interface SegmentRule {
  field: string;
  operator: SegmentOperator;
  value: any;
}

export interface SegmentGroup {
  logic: 'AND' | 'OR';
  rules: Array<SegmentRule | SegmentGroup>;
}

/** Standard contact fields allowed in segmentation */
const ALLOWED_FIELDS = new Set([
  'firstName',
  'lastName',
  'displayName',
  'company',
  'jobTitle',
  'department',
  'notes',
  'isStarred',
  'isFavorite',
  'isVip',
  'tags',
  'createdAt',
  'updatedAt',
  'lastInteractedAt',
  'relationshipScore',
  'totalInteractions',
  'sentCount',
  'receivedCount',
]);

const ALLOWED_OPERATORS = new Set<SegmentOperator>([
  'eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'in', 'isNull',
]);

@Injectable()
export class SegmentService {
  private readonly logger = new Logger(SegmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Query contacts matching a segment definition
   */
  async querySegment(
    tenantId: string,
    segment: SegmentGroup,
    options?: { limit?: number; offset?: number },
  ) {
    const where = this.buildWhere(segment);

    return this.prisma.contact.findMany({
      where: { tenantId, isDeleted: false, ...where },
      orderBy: { displayName: 'asc' },
      take: options?.limit ?? 100,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Count contacts matching a segment
   */
  async countSegment(tenantId: string, segment: SegmentGroup) {
    const where = this.buildWhere(segment);

    return this.prisma.contact.count({
      where: { tenantId, isDeleted: false, ...where },
    });
  }

  /**
   * Build Prisma where clause from a segment group
   */
  buildWhere(group: SegmentGroup): Prisma.ContactWhereInput {
    this.validateGroup(group);

    const conditions = group.rules.map((rule) => {
      if ('logic' in rule) {
        return this.buildWhere(rule);
      }
      return this.buildRuleCondition(rule);
    });

    if (group.logic === 'AND') {
      return { AND: conditions };
    }
    return { OR: conditions };
  }

  private buildRuleCondition(rule: SegmentRule): Prisma.ContactWhereInput {
    if (!ALLOWED_FIELDS.has(rule.field)) {
      throw new BadRequestException(
        `Field "${rule.field}" is not allowed in segmentation`,
      );
    }
    if (!ALLOWED_OPERATORS.has(rule.operator)) {
      throw new BadRequestException(
        `Operator "${rule.operator}" is not allowed`,
      );
    }

    switch (rule.operator) {
      case 'eq':
        return { [rule.field]: { equals: rule.value } };
      case 'neq':
        return { [rule.field]: { not: rule.value } };
      case 'contains':
        return { [rule.field]: { contains: String(rule.value), mode: 'insensitive' } };
      case 'gt':
        return { [rule.field]: { gt: rule.value } };
      case 'gte':
        return { [rule.field]: { gte: rule.value } };
      case 'lt':
        return { [rule.field]: { lt: rule.value } };
      case 'lte':
        return { [rule.field]: { lte: rule.value } };
      case 'in':
        if (!Array.isArray(rule.value)) {
          throw new BadRequestException(
            `"in" operator requires an array value`,
          );
        }
        return { [rule.field]: { in: rule.value } };
      case 'isNull':
        return { [rule.field]: rule.value ? null : { not: null } };
      default:
        throw new BadRequestException(`Unknown operator: ${rule.operator}`);
    }
  }

  private validateGroup(group: SegmentGroup): void {
    if (!group.logic || !['AND', 'OR'].includes(group.logic)) {
      throw new BadRequestException('Segment group must have logic: "AND" or "OR"');
    }
    if (!Array.isArray(group.rules) || group.rules.length === 0) {
      throw new BadRequestException('Segment group must have at least one rule');
    }
    // Prevent deeply nested groups (max 3 levels)
    this.checkDepth(group, 0, 3);
  }

  private checkDepth(group: SegmentGroup, current: number, max: number): void {
    if (current > max) {
      throw new BadRequestException(
        `Segment nesting too deep (max ${max} levels)`,
      );
    }
    for (const rule of group.rules) {
      if ('logic' in rule) {
        this.checkDepth(rule, current + 1, max);
      }
    }
  }
}
