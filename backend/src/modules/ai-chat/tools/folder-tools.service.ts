import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * PII resolve function type -- provided by AiChatService closure.
 */
type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

/**
 * FolderToolsService -- 2 folder tools for the AI chat pipeline.
 *
 * Tools: list_folders, create_folder
 *
 * Uses PrismaService directly for folder operations since
 * EmailFolderService is primarily a query-builder/cache utility.
 *
 * Phase 25: Tools & RAG
 */
@Injectable()
export class FolderToolsService {
  private readonly logger = new Logger(FolderToolsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns all folder tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    _conversationId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      list_folders: this.buildListFolders(tenantId, piiResolve),
      create_folder: this.buildCreateFolder(tenantId, piiResolve),
    };
  }

  private buildListFolders(tenantId: string, _piiResolve: PiiResolveFn) {
    return tool({
      description:
        'List all email folders for the user (Inbox, Sent, Drafts, custom folders, etc.). ' +
        'Example: list_folders({})',
      inputSchema: z.object({}),
      execute: async () => {
        const folders = await this.prisma.folder.findMany({
          where: { tenantId },
          select: {
            id: true,
            name: true,
            path: true,
            specialUse: true,
            unreadCount: true,
          },
          orderBy: { name: 'asc' },
        });

        const mapped = folders.map((f: {
          id: string;
          name: string;
          path: string;
          specialUse: string | null;
          unreadCount: number;
        }) => ({
          id: f.id,
          name: f.name,
          path: f.path,
          type: f.specialUse ?? 'custom',
          unreadCount: f.unreadCount,
        }));

        return { folders: mapped, count: mapped.length };
      },
    });
  }

  private buildCreateFolder(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Create a new email folder. ' +
        'Example: create_folder({ name: "Project Alpha" })',
      inputSchema: z.object({
        name: z.string().describe('Name for the new folder'),
      }),
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        // Get default email provider for the tenant
        const provider = await this.prisma.providerConfig.findFirst({
          where: { tenantId, isActive: true, supportsEmail: true },
        });

        if (!provider) {
          throw new Error('No active email provider found for tenant');
        }

        const folder = await this.prisma.folder.create({
          data: {
            tenantId,
            providerId: provider.id,
            name: resolved.name,
            path: resolved.name,
          },
        });

        return {
          id: folder.id,
          name: folder.name,
          path: folder.path,
          status: 'created',
        };
      },
    });
  }
}
