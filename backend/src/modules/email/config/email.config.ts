import { registerAs } from '@nestjs/config';

/**
 * Email Module Configuration
 *
 * Centralizes all hardcoded values into environment-configurable settings.
 * FIX (BUG-013): Extracted from email-cleanup.service.ts and other services.
 *
 * @see EMAIL_MODULE_ROADMAP.md Phase 4.2 Configuration Extraction
 */
export const emailConfig = registerAs('email', () => ({
    retention: {
        /** Days before soft-deleted emails are permanently purged (default: 30) */
        trashPurgeDays: parseInt(process.env.EMAIL_TRASH_PURGE_DAYS || '30', 10),
        /** Days before orphaned S3 keys expire from tracking (default: 7) */
        orphanRetryDays: parseInt(process.env.EMAIL_ORPHAN_RETRY_DAYS || '7', 10),
    },
    limits: {
        /** Maximum emails per list request (default: 1000) */
        maxListLimit: parseInt(process.env.EMAIL_LIST_MAX_LIMIT || '1000', 10),
        /** Maximum attachment size in bytes (default: 25MB) */
        maxAttachmentSize: parseInt(process.env.EMAIL_MAX_ATTACHMENT_SIZE || '26214400', 10),
        /** Maximum IMAP message download size in bytes (default: 10MB) */
        maxImapMessageSize: parseInt(process.env.IMAP_MAX_MESSAGE_SIZE || '10485760', 10),
        /** Maximum emails in a conversation thread (default: 10000) */
        conversationLimit: parseInt(process.env.EMAIL_CONVERSATION_LIMIT || '10000', 10),
        /** Maximum bulk operation size (default: 500) */
        maxBulkOperationSize: parseInt(process.env.EMAIL_MAX_BULK_SIZE || '500', 10),
    },
    rateLimit: {
        /** Maximum emails sent per minute (default: 30) */
        sendPerMinute: parseInt(process.env.EMAIL_SEND_RATE_LIMIT || '30', 10),
        /** Maximum bulk operations per minute (default: 10) */
        bulkOpsPerMinute: parseInt(process.env.EMAIL_BULK_RATE_LIMIT || '10', 10),
    },
}));

export type EmailConfig = ReturnType<typeof emailConfig>;
