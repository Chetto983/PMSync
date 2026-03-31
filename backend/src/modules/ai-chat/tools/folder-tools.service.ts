import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { FolderOperationsQueueService } from '../../email-sync/services/folder-operations-queue.service';
import { truncateToolResult } from '../utils/tool-result-truncator';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

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
const schemas = {
  list_folders: z.object({}),
  create_folder: z.object({ name: z.string().describe('Name for the new folder') }),
};

@Injectable()
export class FolderToolsService implements OnModuleInit {
  private readonly logger = new Logger(FolderToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly folderQueue: FolderOperationsQueueService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      { name: 'list_folders', description: 'List all email folders', riskLevel: 'LOW' as const, requiresApproval: false, inputSchema: schemas.list_folders },
      { name: 'create_folder', description: 'Create a new custom email folder', riskLevel: 'MEDIUM' as const, requiresApproval: false, inputSchema: schemas.create_folder },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name, description: t.description, parameters: {}, execute: noop,
        domain: 'email', riskLevel: t.riskLevel, requiresApproval: t.requiresApproval, inputSchema: t.inputSchema,
      });
    }
  }

  /**
   * Returns all folder tools with PII resolution via closure.
   */
  getTools(
    tenantId: string,
    piiResolve: PiiResolveFn,
  ) {
    return {
      list_folders: this.buildListFolders(tenantId),
      create_folder: this.buildCreateFolder(tenantId, piiResolve),
    };
  }

  private buildListFolders(tenantId: string) {
    return tool({
      description:
        'List all email folders for the user (Inbox, Sent, Drafts, Archive, and custom folders). ' +
        'Use before move_email to verify the target folder exists. ' +
        'Returns: array of { id, name, path, type, unreadCount }.',
      inputSchema: schemas.list_folders,
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

        return truncateToolResult({ folders: mapped, count: mapped.length });
      },
    });
  }

  private buildCreateFolder(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        'Create a new custom email folder. ' +
        'Use list_folders first to check if a similar folder already exists. ' +
        'Returns: { id, name, path, status: "created" }.',
      inputSchema: schemas.create_folder,
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;
        const requestedAt = new Date(Date.now() - 5000);

        // Get default email provider for the tenant
        const provider = await this.prisma.providerConfig.findFirst({
          where: { tenantId, isActive: true, supportsEmail: true },
          orderBy: { createdAt: 'asc' },
        });

        if (!provider) {
          throw new Error('No active email provider found for tenant');
        }

        const providerType = provider.providerType === 'imap'
          ? 'generic'
          : provider.providerType as 'google' | 'microsoft' | 'generic';

        const jobId = await this.folderQueue.addCreateFolderJob(
          tenantId,
          provider.id,
          providerType,
          provider.email,
          resolved.name.trim(),
        );

        const result = await this.folderQueue.waitForJob(jobId, 30000);

        if (!result) {
          const fallbackFolder = await this.findCreatedFolderFallback(
            tenantId,
            provider.id,
            resolved.name,
            requestedAt,
          );

          if (!fallbackFolder) {
            throw new Error('Failed to create folder: job did not complete');
          }

          return truncateToolResult({
            id: fallbackFolder.id,
            name: fallbackFolder.name,
            path: fallbackFolder.path,
            status: 'created',
          });
        }

        if (!result.success) {
          throw new Error(result.error || 'Failed to create folder');
        }

        return truncateToolResult({
          id: result.folderId || '',
          name: result.folderName || resolved.name.trim(),
          path: result.folderPath || resolved.name.trim(),
          status: 'created',
        });
      },
    });
  }

  private async findCreatedFolderFallback(
    tenantId: string,
    providerId: string,
    folderName: string,
    requestedAt: Date,
  ) {
    const trimmedName = folderName.trim();
    return this.prisma.folder.findFirst({
      where: {
        tenantId,
        providerId,
        updatedAt: { gte: requestedAt },
        OR: [
          { path: trimmedName },
          { name: trimmedName },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        path: true,
        name: true,
      },
    });
  }
}
