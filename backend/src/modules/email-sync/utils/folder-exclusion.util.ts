import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Utility to check if a folder should be excluded from embedding.
 * Excludes spam, trash/deleted, and archive folders across all providers.
 *
 * Primary method: Use specialUse field from folders table (standardized)
 * Fallback: Pattern matching on folder names (for unmapped folders)
 */

/**
 * Folder types (specialUse values) to exclude from embedding
 */
export const EXCLUDED_SPECIAL_USE = ['SPAM', 'TRASH', 'ARCHIVE', 'JUNK', 'DELETED'] as const;

/**
 * Folder name patterns to exclude (case-insensitive) - FALLBACK only
 * Used when specialUse is not available
 */
export const EXCLUDED_FOLDER_PATTERNS = [
  // English
  'spam', 'junk', 'trash', 'deleted', 'archive',
  // Italian (use root to match both singular/plural)
  'posta indesiderata', 'cestino', 'eliminat', 'archivi',
  // Gmail specific
  '[gmail]/spam', '[gmail]/trash', '[gmail]/all mail',
  // Microsoft/Outlook specific
  'deleted items', 'junk email', 'junk e-mail',
  // Generic
  'bin', 'recycle',
] as const;

/**
 * Check if a specialUse value indicates the folder should be excluded
 * @param specialUse - The specialUse value from folder metadata
 * @returns true if folder should be excluded from embedding
 */
export function shouldExcludeBySpecialUse(specialUse: string | null | undefined): boolean {
  if (!specialUse) {
    return false;
  }

  const upperSpecialUse = specialUse.toUpperCase();
  return EXCLUDED_SPECIAL_USE.some(excluded => upperSpecialUse.includes(excluded));
}

/**
 * Fallback: Check if a folder should be excluded based on name/path patterns
 * @param folderNameOrPath - The folder name or path to check
 * @returns true if folder should be excluded from embedding
 */
export function shouldExcludeFolderFromEmbedding(folderNameOrPath: string | null | undefined): boolean {
  if (!folderNameOrPath) {
    return false;
  }

  const lowerFolder = folderNameOrPath.toLowerCase();

  for (const pattern of EXCLUDED_FOLDER_PATTERNS) {
    if (lowerFolder.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Combined check for folder exclusion using both specialUse and name patterns
 * @param folderNameOrPath - The folder name or path
 * @param specialUse - The specialUse value (optional)
 * @returns true if folder should be excluded from embedding
 */
export function shouldExcludeFolder(
  folderNameOrPath: string | null | undefined,
  specialUse?: string | null  ,
): boolean {
  // Primary: check specialUse first (most reliable)
  if (shouldExcludeBySpecialUse(specialUse)) {
    return true;
  }
  // Fallback: check folder name patterns
  return shouldExcludeFolderFromEmbedding(folderNameOrPath);
}

/**
 * Lookup folder specialUse from database and check if excluded
 * This is the preferred method for batch processors
 *
 * @param prisma - PrismaService instance
 * @param providerId - Provider config ID
 * @param folderNameOrPath - The folder name/path/externalId
 * @returns true if folder should be excluded from embedding
 */
export async function shouldExcludeFolderWithLookup(
  prisma: PrismaService,
  providerId: string,
  folderNameOrPath: string | null | undefined,
): Promise<boolean> {
  if (!folderNameOrPath) {
    return false;
  }

  // Lookup folder in database to get specialUse
  const folder = await prisma.folder.findFirst({
    where: {
      providerId,
      OR: [
        { path: folderNameOrPath },
        { name: folderNameOrPath },
        { externalId: folderNameOrPath },
      ],
    },
    select: { specialUse: true },
  });

  // Check specialUse first (primary method)
  if (folder?.specialUse && shouldExcludeBySpecialUse(folder.specialUse)) {
    return true;
  }

  // Fallback to pattern matching
  return shouldExcludeFolderFromEmbedding(folderNameOrPath);
}
