/**
 * Folder Tools for VoltAgent
 *
 * Provides folder operations as VoltAgent tools with Zod schemas.
 * Uses centralized locale system for translations.
 */
import { createTool } from '@voltagent/core';
import { z } from 'zod';
import { PrismaService } from '../../../../prisma/prisma.service';
import { getToolTranslations, type SupportedLocale } from '../locales';

/**
 * Creates all folder-related tools for VoltAgent.
 *
 * @param prisma - Prisma service for database access
 * @param locale - User's locale for translations
 * @param tenantId - Tenant ID for data isolation
 */
export function createFolderTools(
  prisma: PrismaService,
  locale: SupportedLocale = 'en',
  tenantId: string,
) {
  const t = getToolTranslations(locale);

  return [
    // ========== LIST FOLDERS ==========
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

    // ========== CREATE FOLDER ==========
    createTool({
      name: 'create_folder',
      description:
        'Create a new email folder. Useful for organizing emails into categories.',
      parameters: z.object({
        name: z
          .string()
          .min(1)
          .max(100)
          .describe('Name of the new folder'),
        providerId: z
          .string()
          .describe('Provider ID (email account) where the folder will be created'),
        parentPath: z
          .string()
          .optional()
          .describe('Optional parent folder path for nested folders'),
      }),
      execute: async ({ name, providerId, parentPath }) => {
        // Verify provider belongs to tenant
        const provider = await prisma.providerConfig.findFirst({
          where: { id: providerId, tenantId },
        });

        if (!provider) {
          return {
            success: false,
            error: 'Provider not found or access denied',
          };
        }

        return {
          success: true,
          requiresApproval: true,
          actionType: 'CREATE_FOLDER',
          severity: 'LOW',
          payload: {
            name: name.trim(),
            providerId,
            parentPath,
          },
          summary: t.folder.created(name),
        };
      },
    }),

    // ========== RENAME FOLDER ==========
    createTool({
      name: 'rename_folder',
      description:
        'Rename an existing email folder. Use the folder ID or path to identify the folder.',
      parameters: z.object({
        folderId: z.string().describe('ID of the folder to rename'),
        newName: z
          .string()
          .min(1)
          .max(100)
          .describe('New name for the folder'),
      }),
      execute: async ({ folderId, newName }) => {
        const folder = await prisma.folder.findFirst({
          where: { id: folderId, tenantId },
          select: { id: true, name: true, path: true, providerId: true },
        });

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
      },
    }),

    // ========== DELETE FOLDER ==========
    createTool({
      name: 'delete_folder',
      description:
        'Delete an email folder. WARNING: This may delete all emails in the folder. System folders cannot be deleted.',
      parameters: z.object({
        folderId: z.string().describe('ID of the folder to delete'),
      }),
      execute: async ({ folderId }) => {
        const folder = await prisma.folder.findFirst({
          where: { id: folderId, tenantId },
          select: {
            id: true,
            name: true,
            path: true,
            providerId: true,
            totalCount: true,
          },
        });

        if (!folder) {
          return { success: false, error: t.folder.notFound };
        }

        // Check if it's a system folder (INBOX, Sent, Drafts, etc.)
        const systemFolders = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Junk'];
        if (systemFolders.includes(folder.name)) {
          return {
            success: false,
            error: `Cannot delete system folder "${folder.name}"`,
          };
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
      },
    }),

    // ========== MOVE EMAIL TO FOLDER ==========
    createTool({
      name: 'move_email_to_folder',
      description:
        'Move an email to a different folder. Use this to organize emails.',
      parameters: z.object({
        emailId: z.string().describe('ID of the email to move'),
        folderId: z.string().describe('ID of the destination folder'),
      }),
      execute: async ({ emailId, folderId }) => {
        const email = await prisma.email.findFirst({
          where: { id: emailId, tenantId },
          select: { id: true, subject: true, providerId: true },
        });

        if (!email) {
          return { success: false, error: 'Email not found' };
        }

        const folder = await prisma.folder.findFirst({
          where: { id: folderId, tenantId },
          select: { id: true, name: true, path: true },
        });

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
      },
    }),
  ];
}
