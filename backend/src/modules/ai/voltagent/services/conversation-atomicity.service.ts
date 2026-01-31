/**
 * ConversationAtomicityService (RACE-03)
 *
 * Provides compensating transaction pattern for VoltAgent operations.
 * Since VoltAgent Memory API is external to Prisma transactions,
 * we use a two-phase approach:
 * 1. Execute Prisma operations in transaction
 * 2. Execute Memory API operations
 * 3. If Memory fails, compensate by rolling back Prisma changes
 *
 * @see https://microservices.io/patterns/data/saga.html
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CorrelationContext } from '../../../../common/services/correlation-context.service';
import { AiError, AiErrorCode } from '../../errors';

export interface AtomicOperationResult<T> {
  success: boolean;
  result?: T;
  compensated?: boolean;
  error?: Error;
}

export interface PrismaOperation<T> {
  /** Execute Prisma operations in transaction, return result */
  execute: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<T>;
  /** Compensate/rollback if memory operation fails */
  compensate: (result: T) => Promise<void>;
}

export interface MemoryOperation<T, R> {
  /** Execute Memory API operation using Prisma result */
  execute: (prismaResult: T) => Promise<R>;
}

@Injectable()
export class ConversationAtomicityService {
  private readonly logger = new Logger(ConversationAtomicityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Execute operations atomically with compensating transaction pattern.
   *
   * Flow:
   * 1. Execute Prisma transaction
   * 2. Execute Memory operation with Prisma result
   * 3. If Memory fails, run compensation to rollback Prisma changes
   *
   * @param prismaOp - Prisma operation with execute and compensate functions
   * @param memoryOp - Memory operation that depends on Prisma result
   * @param context - Logging context (userId, conversationId, etc.)
   * @returns AtomicOperationResult with success flag and optional result
   */
  async withAtomicity<T, R>(
    prismaOp: PrismaOperation<T>,
    memoryOp: MemoryOperation<T, R>,
    context: { userId?: string; conversationId?: string; operation?: string } = {},
  ): Promise<AtomicOperationResult<R>> {
    const correlationId = CorrelationContext.getContext()?.correlationId || 'no-correlation';
    const logPrefix = `[RACE-03][${context.operation || 'atomic'}][${correlationId}]`;

    let prismaResult: T | undefined;

    try {
      // Phase 1: Prisma transaction
      prismaResult = await this.prisma.$transaction(
        async (tx) => {
          return prismaOp.execute(tx);
        },
        {
          maxWait: 5000, // 5s to acquire connection
          timeout: 30000, // 30s transaction timeout
        },
      );

      this.logger.debug(`${logPrefix} Prisma transaction completed`);
    } catch (prismaError) {
      // Prisma failed - no compensation needed, transaction auto-rolled back
      this.logger.error(
        `${logPrefix} Prisma transaction failed: ${prismaError instanceof Error ? prismaError.message : prismaError}`,
      );
      return {
        success: false,
        error: prismaError instanceof Error ? prismaError : new Error(String(prismaError)),
      };
    }

    try {
      // Phase 2: Memory operation (external, non-transactional)
      const memoryResult = await memoryOp.execute(prismaResult);

      this.logger.debug(`${logPrefix} Memory operation completed`);

      return {
        success: true,
        result: memoryResult,
      };
    } catch (memoryError) {
      // Phase 3: Memory failed - compensate Prisma changes
      this.logger.warn(
        `${logPrefix} Memory operation failed, compensating Prisma changes: ${memoryError instanceof Error ? memoryError.message : memoryError}`,
      );

      try {
        await prismaOp.compensate(prismaResult);
        this.logger.log(`${logPrefix} Compensation successful`);

        return {
          success: false,
          compensated: true,
          error: memoryError instanceof Error ? memoryError : new Error(String(memoryError)),
        };
      } catch (compensationError) {
        // Critical: compensation failed - log for manual intervention
        this.logger.error(
          `${logPrefix} CRITICAL: Compensation failed! Manual intervention required. ` +
            `PrismaResult: ${JSON.stringify(prismaResult)}. ` +
            `CompensationError: ${compensationError instanceof Error ? compensationError.message : compensationError}`,
        );

        return {
          success: false,
          compensated: false,
          error: new AiError(
            'Atomic operation failed and compensation failed - data may be inconsistent',
            AiErrorCode.INTERNAL_ERROR,
            { retryable: false },
          ),
        };
      }
    }
  }
}
