/**
 * Folder Tools for VoltAgent
 *
 * Provides folder operations as VoltAgent tools with Zod schemas.
 * Uses centralized locale system for translations.
 *
 * Performance optimizations (2025-12-14):
 * - Redis caching for folder metadata lookups (tenant-scoped)
 * - Memory fallback when Redis unavailable
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../../common/services/cache.service';
import { getToolTranslations, type SupportedLocale } from '../locales';
import { JUNK_FOLDERS, SYSTEM_FOLDERS } from '../../../email/email.helpers';

/**
 * Folder metadata for caching
 */
interface FolderMetadata {
  id: string;
  name: string;
  path: string;
  providerId: string;
  totalCount: number;
  isSystem: boolean;
  specialUse: string | null;
}

/**
 * Cache configuration
 */
const FOLDER_METADATA_CACHE_TTL = 300; // 5 minutes

/**
 * Get folder metadata with Redis caching
 */
async function getFolderMetadata(
  prisma: PrismaService,
  tenantId: string,
  folderId: string,
  cacheService?: CacheService,
): Promise<FolderMetadata | null> {
  const cacheKey = `${tenantId}:folder:${folderId}`;

  // Try Redis cache first
  if (cacheService?.isHealthy()) {
    try {
      const cached = await cacheService.get<FolderMetadata>(cacheKey, {
        namespace: CacheNamespace.FOLDER_METADATA,
      });
      if (cached) return cached;
    } catch {
      // Fall through to DB
    }
  }

  // Query database
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, tenantId },
    select: { id: true, name: true, path: true, providerId: true, totalCount: true, isSystem: true, specialUse: true },
  });

  // Cache the result
  if (folder && cacheService?.isHealthy()) {
    try {
      await cacheService.set(cacheKey, folder, {
        namespace: CacheNamespace.FOLDER_METADATA,
        ttl: FOLDER_METADATA_CACHE_TTL,
      });
    } catch {
      // Ignore cache errors
    }
  }

  return folder;
}

/**
 * Creates all folder-related tools for VoltAgent.
 *
 * @param prisma - Prisma service for database access
 * @param locale - User's locale for translations
 * @param tenantId - Tenant ID for data isolation
 * @param cacheService - Optional cache service for Redis caching
 */
export function createFolderTools(
  prisma: PrismaService,
  locale: SupportedLocale = 'en',
  tenantId: string,
  cacheService?: CacheService,
) {
  const t = getToolTranslations(locale);

  return [
    // ========================================================================
    // TOOL #1: list_folders (read-only, kept as-is)
    // ========================================================================
    createTool({
      name: 'list_folders',
      description:
        'List all email folders for the user. Use this to see available folders and their structure.',
      parameters: z.object({
        providerId: z
          .string()
          .optional()
          .describe('Optional provider ID to filter folders by email account'),
      }),
      execute: async ({ providerId }) => {
        const whereClause: { tenantId: string; providerId?: string } = { tenantId };
        if (providerId) {
          whereClause.providerId = providerId;
        }

        const folders = await prisma.folder.findMany({
          where: whereClause,
          orderBy: [{ level: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            path: true,
            level: true,
            unreadCount: true,
            totalCount: true,
            providerId: true,
          },
        });

        return {
          success: true,
          folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            path: f.path,
            level: f.level,
            unreadCount: f.unreadCount,
            totalCount: f.totalCount,
            providerId: f.providerId,
          })),
          count: folders.length,
        };
      },
    }),

    // ========================================================================
    // CONSOLIDATED TOOL #2: manage_folder
    // Combines: create_folder, rename_folder, delete_folder, move_email_to_folder
    // All actions require HITL approval
    // ========================================================================
    createTool({
      name: 'manage_folder',
      description: `Manage email folders. CONSOLIDATED TOOL - handles create, rename, delete, and move operations.

Actions:
- "create": Create new folder (requires name, providerId; optional parentPath)
- "rename": Rename folder (requires folderId, newName)
- "delete": Delete folder (requires folderId; system folders protected)
- "move_email": Move email to folder (requires emailId, folderId)

All actions require user approval (HITL).`,
      parameters: z.object({
        action: z.enum(['create', 'rename', 'delete', 'move_email'])
          .describe('Action to perform'),
        // Folder identification
        folderId: z.string().optional().describe('Folder ID (for rename/delete/move_email)'),
        // Create params
        name: z.string().optional().describe('Folder name (for create)'),
        providerId: z.string().optional().describe('Provider ID (for create)'),
        parentPath: z.string().optional().describe('Parent folder path (for create)'),
        // Rename params
        newName: z.string().optional().describe('New folder name (for rename)'),
        // Move email params
        emailId: z.string().optional().describe('Email ID (for move_email)'),
      }),
      execute: async (params) => {
        const { action, folderId, name, providerId, parentPath, newName, emailId } = params;

        switch (action) {
          case 'create': {
            if (!name || !providerId) {
              return { success: false, error: 'create requires name and providerId' };
            }

            const provider = await prisma.providerConfig.findFirst({
              where: { id: providerId, tenantId },
            });

            if (!provider) {
              return { success: false, error: 'Provider not found or access denied' };
            }

            return {
              success: true,
              requiresApproval: true,
              actionType: 'CREATE_FOLDER',
              severity: 'LOW',
              payload: { name: name.trim(), providerId, parentPath },
              summary: t.folder.created(name),
            };
          }

          case 'rename': {
            if (!folderId || !newName) {
              return { success: false, error: 'rename requires folderId and newName' };
            }

            const folder = await getFolderMetadata(prisma, tenantId, folderId, cacheService);
            if (!folder) {
              return { success: false, error: t.folder.notFound };
            }

            return {
              success: true,
              requiresApproval: true,
              actionType: 'RENAME_FOLDER',
              severity: 'LOW',
              payload: {
                folderId,
                providerId: folder.providerId,
                folderPath: folder.path,
                oldName: folder.name,
                newName: newName.trim(),
              },
              summary: t.folder.renamed(folder.name, newName),
            };
          }

          case 'delete': {
            if (!folderId) {
              return { success: false, error: 'delete requires folderId' };
            }

            const folder = await getFolderMetadata(prisma, tenantId, folderId, cacheService);
            if (!folder) {
              return { success: false, error: t.folder.notFound };
            }

            const normalizedName = folder.name.toUpperCase();
            const normalizedSpecialUse = folder.specialUse?.toUpperCase();
            const isProtected =
              folder.isSystem ||
              (normalizedSpecialUse
                ? SYSTEM_FOLDERS.includes(normalizedSpecialUse as typeof SYSTEM_FOLDERS[number])
                  || JUNK_FOLDERS.includes(normalizedSpecialUse)
                : false)
              || SYSTEM_FOLDERS.includes(normalizedName as typeof SYSTEM_FOLDERS[number])
              || JUNK_FOLDERS.includes(normalizedName);

            if (isProtected) {
              return { success: false, error: `Cannot delete system folder "${folder.name}"` };
            }

            return {
              success: true,
              requiresApproval: true,
              actionType: 'DELETE_FOLDER',
              severity: 'HIGH',
              payload: {
                folderId,
                providerId: folder.providerId,
                folderPath: folder.path,
                folderName: folder.name,
                emailCount: folder.totalCount,
              },
              summary: t.folder.deleted(folder.name),
            };
          }

          case 'move_email': {
            if (!emailId || !folderId) {
              return { success: false, error: 'move_email requires emailId and folderId' };
            }

            const email = await prisma.email.findFirst({
              where: { id: emailId, tenantId },
              select: { id: true, subject: true, providerId: true },
            });

            if (!email) {
              return { success: false, error: 'Email not found' };
            }

            const folder = await getFolderMetadata(prisma, tenantId, folderId, cacheService);
            if (!folder) {
              return { success: false, error: t.folder.notFound };
            }

            return {
              success: true,
              requiresApproval: true,
              actionType: 'MOVE_EMAIL',
              severity: 'MEDIUM',
              payload: {
                emailId,
                folderId,
                folderPath: folder.path,
                folderName: folder.name,
                emailSubject: email.subject,
              },
              summary: t.folder.emailMoved(email.subject || '(No subject)', folder.name),
            };
          }

          default:
            return { success: false, error: `Unknown action: ${action}` };
        }
      },
    }),
  ];
}
