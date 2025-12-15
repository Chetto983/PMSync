/**
 * Email Helpers
 *
 * Common utilities for email queries across the application.
 */

/**
 * Folders that contain junk/deleted emails and should be excluded
 * from analytics, insights, briefings, and AI features.
 */
export const JUNK_FOLDERS: string[] = ['SPAM', 'TRASH'];

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
