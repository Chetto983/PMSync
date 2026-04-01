import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Data access audit input (AUDIT-01: HTTP data access logging)
 */
export interface LogDataAccessInput {
  tenantId: string;
  userId?: string;
  action: string; // HTTP method (GET, POST, etc.)
  entity: string; // Controller class name
  entityId?: string; // Route param :id
  path: string; // Request path
  ipAddress?: string;
}

/**
 * Tool execution audit input (AUDIT-02: AI tool execution logging)
 */
export interface LogToolExecutionInput {
  tenantId: string;
  userId?: string;
  toolName: string;
  agentName: string;
  inputSummary: string;
  outputSummary: string;
  durationMs: number;
  status: 'success' | 'error';
}

/**
 * PII access audit input (SEC-H3: PII unmasking audit trail)
 */
export interface LogPiiAccessInput {
  tenantId: string;
  userId?: string;
  sessionId: string;
  piiTypes: string[];
  piiCount: number;
  accessContext: 'tool_execution' | 'text_resolution' | 'payload_resolution' | 'direct_lookup';
  entityType?: string; // e.g., 'email', 'contact'
  entityId?: string;
}

/**
 * HITL decision audit input (HITL-04: approval/rejection logging)
 */
export interface LogHitlDecisionInput {
  tenantId: string;
  userId: string;
  toolName: string;
  toolCallId: string;
  decision: 'approved' | 'rejected';
  conversationId: string;
}

@Injectable()
export class AuditService {
  private logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Log an audit event (legacy method, kept for backward compatibility)
   */
  async logAudit(
    tenantId: string,
    userId: string | null,
    action: string,
    entity: string,
    entityId: string,
    changes?: any,
    ipAddress?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userId,
          action,
          entity,
          entityId,
          changes,
          ipAddress,
        },
      });

      this.logger.log(`Audit logged: ${action} on ${entity} (${entityId})`);
    } catch (error) {
      this.logger.error('Failed to log audit:', error);
    }
  }

  /**
   * AUDIT-01: Log HTTP data access event.
   *
   * Fire-and-forget: errors are logged but NEVER thrown.
   * Caller should NOT await in the hot path.
   */
  async logDataAccess(data: LogDataAccessInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId ?? null,
          action: `DATA_ACCESS:${data.action}`,
          entity: data.entity,
          entityId: data.entityId ?? 'N/A',
          changes: { path: data.path },
          ipAddress: data.ipAddress,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log data access: ${error}`);
    }
  }

  /**
   * AUDIT-02: Log AI tool execution event.
   *
   * CRITICAL: Truncates inputSummary and outputSummary to 200 chars
   * to prevent PII leakage. Only stores tool arg KEYS for input summary.
   *
   * Fire-and-forget: errors are logged but NEVER thrown.
   * Caller should NOT await in the hot path.
   */
  async logToolExecution(data: LogToolExecutionInput): Promise<void> {
    try {
      const truncatedInput = data.inputSummary.slice(0, 200);
      const truncatedOutput = data.outputSummary.slice(0, 200);

      await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId ?? null,
          action: `AI_TOOL:${data.toolName}`,
          entity: 'AiChat',
          entityId: data.agentName,
          changes: {
            inputSummary: truncatedInput,
            outputSummary: truncatedOutput,
            durationMs: data.durationMs,
            status: data.status,
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log tool execution: ${error}`);
    }
  }

  /**
   * HITL-04: Log HITL approval/rejection decision.
   *
   * Fire-and-forget: errors are logged but NEVER thrown.
   */
  async logHitlDecision(data: LogHitlDecisionInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          action: `HITL:${data.decision.toUpperCase()}`,
          entity: 'AiChat',
          entityId: data.toolCallId,
          changes: { toolName: data.toolName, conversationId: data.conversationId },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log HITL decision: ${error}`);
    }
  }

  /**
   * SEC-H3: Log PII access/unmasking event.
   *
   * Records who accessed PII, when, which types, and in what context.
   * GDPR accountability: audit trail for PII resolution (unmasking).
   *
   * Fire-and-forget: errors are logged but NEVER thrown.
   * CRITICAL: Never log the actual PII values — only types and counts.
   */
  async logPiiAccess(data: LogPiiAccessInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId ?? null,
          action: `PII_ACCESS:${data.accessContext.toUpperCase()}`,
          entity: data.entityType ?? 'PiiResolution',
          entityId: data.entityId ?? data.sessionId,
          changes: {
            sessionId: data.sessionId,
            piiTypes: data.piiTypes,
            piiCount: data.piiCount,
            context: data.accessContext,
          },
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log PII access: ${error}`);
    }
  }
}
