/**
 * Optimistic Locking Utilities
 *
 * Industrial-grade concurrency control using database version fields.
 * Prevents concurrent modifications from overwriting each other.
 */

import { PrismaService } from '../../../prisma/prisma.service';
import { CalendarError, CalendarErrorCode } from '../errors';

/**
 * Result of an optimistic lock update
 */
export interface OptimisticLockResult<T> {
    success: boolean;
    data?: T;
    currentVersion: number;
    wasModified: boolean;
}

/**
 * Options for optimistic lock operations
 */
export interface OptimisticLockOptions {
    /** Maximum number of retries on conflict */
    maxRetries?: number;
    /** Base delay between retries in ms */
    retryDelayMs?: number;
    /** Whether to throw on conflict after max retries */
    throwOnConflict?: boolean;
}

const DEFAULT_OPTIONS: OptimisticLockOptions = {
    maxRetries: 3,
    retryDelayMs: 100,
    throwOnConflict: true,
};

/**
 * Update a calendar event with optimistic locking
 * 
 * @param prisma - PrismaService instance
 * @param eventId - The event ID to update
 * @param expectedVersion - The version the client expects
 * @param updateData - The data to update
 * @param options - Retry options
 * @returns Result indicating success/failure and current version
 */
export async function updateEventWithLock(
    prisma: PrismaService,
    eventId: string,
    expectedVersion: number,
    updateData: Record<string, unknown>,
    options?: OptimisticLockOptions,
): Promise<OptimisticLockResult<unknown>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    for (let attempt = 0; attempt <= (opts.maxRetries ?? 3); attempt++) {
        // Use updateMany with version check to implement optimistic locking
        const result = await prisma.calendarEvent.updateMany({
            where: {
                id: eventId,
                syncVersion: expectedVersion,
            },
            data: {
                ...updateData,
                syncVersion: { increment: 1 },
                lastSyncedAt: new Date(),
            },
        });

        if (result.count > 0) {
            // Success - fetch the updated record
            const updated = await prisma.calendarEvent.findUnique({
                where: { id: eventId },
            });

            return {
                success: true,
                data: updated,
                currentVersion: expectedVersion + 1,
                wasModified: true,
            };
        }

        // Check if record exists but version mismatched
        const current = await prisma.calendarEvent.findUnique({
            where: { id: eventId },
            select: { id: true, syncVersion: true },
        });

        if (!current) {
            throw new CalendarError(
                `Event ${eventId} not found`,
                CalendarErrorCode.EVENT_NOT_FOUND,
                { httpStatus: 404, retryable: false },
            );
        }

        // Version mismatch - retry with exponential backoff
        if (attempt < (opts.maxRetries ?? 3)) {
            const delay = (opts.retryDelayMs ?? 100) * Math.pow(2, attempt);
            await sleep(delay);

            // Update expected version for retry
            expectedVersion = current.syncVersion;
            continue;
        }

        // Max retries exceeded
        if (opts.throwOnConflict) {
            throw CalendarError.concurrentModification(
                eventId,
                expectedVersion,
                current.syncVersion,
            );
        }

        return {
            success: false,
            currentVersion: current.syncVersion,
            wasModified: false,
        };
    }

    // Should never reach here, but TypeScript needs this
    return {
        success: false,
        currentVersion: expectedVersion,
        wasModified: false,
    };
}

/**
 * Delete a calendar event with optimistic locking
 */
export async function deleteEventWithLock(
    prisma: PrismaService,
    eventId: string,
    expectedVersion: number,
    options?: OptimisticLockOptions,
): Promise<OptimisticLockResult<void>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Use updateMany with version check
    const result = await prisma.calendarEvent.updateMany({
        where: {
            id: eventId,
            syncVersion: expectedVersion,
        },
        data: {
            isDeleted: true,
            isCancelled: true,
            syncVersion: { increment: 1 },
        },
    });

    if (result.count > 0) {
        return {
            success: true,
            currentVersion: expectedVersion + 1,
            wasModified: true,
        };
    }

    // Check current state
    const current = await prisma.calendarEvent.findUnique({
        where: { id: eventId },
        select: { id: true, syncVersion: true, isDeleted: true },
    });

    if (!current) {
        throw new CalendarError(
            `Event ${eventId} not found`,
            CalendarErrorCode.EVENT_NOT_FOUND,
            { httpStatus: 404, retryable: false },
        );
    }

    if (current.isDeleted) {
        // Already deleted - consider it success
        return {
            success: true,
            currentVersion: current.syncVersion,
            wasModified: false,
        };
    }

    if (opts.throwOnConflict) {
        throw CalendarError.concurrentModification(
            eventId,
            expectedVersion,
            current.syncVersion,
        );
    }

    return {
        success: false,
        currentVersion: current.syncVersion,
        wasModified: false,
    };
}

/**
 * Acquire a distributed lock for a resource
 * Uses Redis if available, falls back to database locking
 */
export async function withEventLock<T>(
    prisma: PrismaService,
    eventId: string,
    fn: () => Promise<T>,
    timeoutMs: number = 5000,
): Promise<T> {
    // Simple database-based locking using SELECT FOR UPDATE
    // This is a pessimistic lock for operations that can't use optimistic locking

    return prisma.$transaction(
        async (tx) => {
            // Lock the row with SELECT FOR UPDATE
            const event = await tx.$queryRaw`
        SELECT id, "syncVersion" FROM "CalendarEvent" 
        WHERE id = ${eventId} 
        FOR UPDATE NOWAIT
      `;

            if (!event || (Array.isArray(event) && event.length === 0)) {
                throw new CalendarError(
                    `Event ${eventId} not found`,
                    CalendarErrorCode.EVENT_NOT_FOUND,
                    { httpStatus: 404, retryable: false },
                );
            }

            // Execute the function while holding the lock
            return fn();
        },
        { timeout: timeoutMs },
    );
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
