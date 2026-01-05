/**
 * Email Helpers
 *
 * Common utilities for email queries across the application.
 */

/**
 * Folders that contain junk/deleted emails and should be excluded
 * from analytics, insights, briefings, and AI features.
 * Note: includes both 'SPAM' and 'JUNK' for compatibility with different providers
 * (folder-sync uses 'JUNK' as specialUse, some providers use 'SPAM')
 */
export const JUNK_FOLDERS: string[] = ['SPAM', 'JUNK', 'TRASH'];

/**
 * Prisma where clause to exclude junk folders (SPAM, TRASH)
 * Use this in all email queries for analytics, insights, briefings, etc.
 *
 * @example
 * const emails = await prisma.email.findMany({
 *   where: {
 *     tenantId,
 *     folder: EXCLUDE_JUNK_FOLDERS,
 *   },
 * });
 */
export const EXCLUDE_JUNK_FOLDERS = { notIn: JUNK_FOLDERS };

/**
 * Build a Prisma where clause that excludes junk folders.
 * Optionally allows specifying additional folders to exclude.
 *
 * @param additionalExclude - Additional folders to exclude (e.g., 'SENT' for received-only queries)
 * @returns Prisma notIn clause
 *
 * @example
 * // Exclude SPAM, TRASH, and SENT
 * const receivedEmails = await prisma.email.findMany({
 *   where: {
 *     tenantId,
 *     folder: excludeJunkFolders('SENT'),
 *   },
 * });
 */
export function excludeJunkFolders(...additionalExclude: string[]) {
  return { notIn: [...JUNK_FOLDERS, ...additionalExclude] };
}

/**
 * Check if a folder is a junk folder (SPAM or TRASH)
 *
 * @param folder - The folder name to check
 * @returns true if the folder is SPAM or TRASH
 */
export function isJunkFolder(folder: string): boolean {
  return JUNK_FOLDERS.includes(folder);
}

/**
 * System folders that have special behavior
 */
export const SYSTEM_FOLDERS = [
  'INBOX',
  'SENT',
  'DRAFTS',
  'TRASH',
  'SPAM',
  'ARCHIVE',
  'IMPORTANT',
  'STARRED',
  'SOCIAL',
  'PROMOTIONS',
  'UPDATES',
  'FORUMS',
] as const;

export type SystemFolder = (typeof SYSTEM_FOLDERS)[number];
export type JunkFolder = (typeof JUNK_FOLDERS)[number];

/**
 * Check if an email is recent (within the last 7 days)
 * Used to determine if AI features should run on the email
 * to avoid processing old emails during full syncs.
 *
 * @param date - The date to check
 * @returns true if the date is within the last 7 days
 */
export function isRecentEmail(date: Date): boolean {
  if (!date) return false;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  return diff < SEVEN_DAYS;
}
