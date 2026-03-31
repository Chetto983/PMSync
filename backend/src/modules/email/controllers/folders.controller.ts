import {
  Controller,
  Get,
  Header,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { FolderSyncService } from '../../email-sync/services/folder-sync.service';
import { FolderOperationsQueueService } from '../../email-sync/services/folder-operations-queue.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { isSystemFolder } from '../../email-sync/drivers/interfaces/canonical.types';
import { FolderOperationError } from '../../email-sync/drivers/interfaces/folder-errors';

// DTOs for folder operations
export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsString()
  providerId: string;

  @IsOptional()
  @IsString()
  parentPath?: string;
}

export class RenameFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  newName: string;
}

export class MoveFolderDto {
  @IsOptional()
  @IsString()
  parentId?: string | null;
}

export class FolderResponseDto {
  id: string;
  path: string;
  name: string;
}

/**
 * Canonical folder types exposed to frontend
 * Avoids code duplication between frontend and backend
 */
export const CANONICAL_FOLDER_TYPES = {
  // RFC 6154 standard special-use attributes
  INBOX: 'INBOX',
  SENT: 'SENT',
  DRAFTS: 'DRAFTS',
  TRASH: 'TRASH',
  SPAM: 'SPAM',
  JUNK: 'JUNK',
  ARCHIVE: 'ARCHIVE',
  ALL: 'ALL',
  FLAGGED: 'FLAGGED',
  STARRED: 'STARRED',
  IMPORTANT: 'IMPORTANT',
  // Microsoft Graph wellKnownName values
  OUTBOX: 'OUTBOX',
  CONVERSATIONHISTORY: 'CONVERSATIONHISTORY',
  CLUTTER: 'CLUTTER',
  SCHEDULED: 'SCHEDULED',
  // Gmail categories
  CATEGORY_PERSONAL: 'CATEGORY_PERSONAL',
  CATEGORY_SOCIAL: 'CATEGORY_SOCIAL',
  CATEGORY_PROMOTIONS: 'CATEGORY_PROMOTIONS',
  CATEGORY_UPDATES: 'CATEGORY_UPDATES',
  CATEGORY_FORUMS: 'CATEGORY_FORUMS',
} as const;

/**
 * Localized folder name mappings for display name to canonical type conversion
 * Used when IMAP servers don't provide RFC 6154 special-use flags
 */
export const LOCALIZED_FOLDER_NAMES: Record<string, keyof typeof CANONICAL_FOLDER_TYPES> = {
  // English
  'inbox': 'INBOX',
  'sent': 'SENT',
  'sent items': 'SENT',
  'sent mail': 'SENT',
  'drafts': 'DRAFTS',
  'draft': 'DRAFTS',
  'trash': 'TRASH',
  'deleted items': 'TRASH',
  'bin': 'TRASH',
  'spam': 'SPAM',
  'junk': 'SPAM',
  'junk email': 'SPAM',
  'archive': 'ARCHIVE',
  'all mail': 'ALL',
  'important': 'IMPORTANT',
  'starred': 'STARRED',
  'flagged': 'FLAGGED',
  'outbox': 'OUTBOX',
  // Italian
  'posta in arrivo': 'INBOX',
  'posta inviata': 'SENT',
  'inviata': 'SENT',
  'elementi inviati': 'SENT',
  'bozze': 'DRAFTS',
  'cestino': 'TRASH',
  'posta eliminata': 'TRASH',
  'posta indesiderata': 'SPAM',
  'archivio': 'ARCHIVE',
  'posta in uscita': 'OUTBOX',
  // German
  'posteingang': 'INBOX',
  'gesendet': 'SENT',
  'gesendete objekte': 'SENT',
  'entwürfe': 'DRAFTS',
  'papierkorb': 'TRASH',
  'gelöschte objekte': 'TRASH',
  'junk-e-mail': 'SPAM',
  'archiv': 'ARCHIVE',
  'postausgang': 'OUTBOX',
  // French
  'boîte de réception': 'INBOX',
  'éléments envoyés': 'SENT',
  'envoyés': 'SENT',
  'brouillons': 'DRAFTS',
  'corbeille': 'TRASH',
  'courrier indésirable': 'SPAM',
  'archives': 'ARCHIVE',
  "boîte d'envoi": 'OUTBOX',
  // Spanish
  'bandeja de entrada': 'INBOX',
  'elementos enviados': 'SENT',
  'enviados': 'SENT',
  'borradores': 'DRAFTS',
  'papelera': 'TRASH',
  'eliminados': 'TRASH',
  'correo no deseado': 'SPAM',
  'archivo': 'ARCHIVE',
  'bandeja de salida': 'OUTBOX',
};

@ApiTags('Folders')
@Controller('folders')
@UseGuards(TenantGuard, RolesGuard)
@ApiCookieAuth()
export class FoldersController {
  constructor(
    private readonly folderSyncService: FolderSyncService,
    private readonly folderQueue: FolderOperationsQueueService,
    private readonly prisma: PrismaService,
  ) {}

  private async findCreatedFolderFallback(
    tenantId: string,
    providerId: string,
    folderName: string,
    requestedAt: Date,
    parentPath?: string,
  ): Promise<FolderResponseDto | null> {
    const trimmedName = folderName.trim();
    const expectedPath = parentPath?.trim()
      ? `${parentPath.trim().replace(/[\\/]+$/, '')}/${trimmedName}`
      : trimmedName;

    const createdFolder = await this.prisma.folder.findFirst({
      where: {
        tenantId,
        providerId,
        updatedAt: { gte: requestedAt },
        OR: [
          { path: expectedPath },
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

    return createdFolder ?? null;
  }

  /**
   * Get canonical folder type metadata
   * Returns folder type definitions and localized name mappings
   * Frontend can use this to avoid duplicating folder type logic
   */
  @Get('metadata')
  @ApiOperation({
    summary: 'Get canonical folder type metadata',
    description: `Returns folder type definitions and localized name mappings.

**Canonical Types**: RFC 6154 special-use attributes, Microsoft Graph wellKnownName values, Gmail system labels.

**Localized Names**: Display name to canonical type mappings for English, Italian, German, French, Spanish.

**Display Mapping**: Maps provider-specific types to canonical display types (e.g., CATEGORY_PERSONAL → INBOX).

Frontend can use this to avoid duplicating folder type logic.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Folder type metadata',
    schema: {
      type: 'object',
      properties: {
        canonicalTypes: {
          type: 'object',
          description: 'All canonical folder type constants',
          example: { INBOX: 'INBOX', SENT: 'SENT', DRAFTS: 'DRAFTS' },
        },
        localizedNames: {
          type: 'object',
          description: 'Localized folder names mapped to canonical types',
          example: { 'posta in arrivo': 'INBOX', 'bozze': 'DRAFTS' },
        },
        displayMapping: {
          type: 'object',
          description: 'Maps provider-specific folder types to canonical display types',
          example: { CATEGORY_PERSONAL: 'INBOX', CATEGORY_SOCIAL: 'CATEGORY_SOCIAL' },
        },
        systemFolders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Core system folders for sidebar display',
          example: ['INBOX', 'SENT', 'DRAFTS', 'ARCHIVE', 'SPAM', 'TRASH'],
        },
        microsoftFolders: {
          type: 'array',
          items: { type: 'string' },
          description: 'Microsoft Graph specific folder types',
          example: ['OUTBOX', 'CONVERSATIONHISTORY', 'CLUTTER', 'SCHEDULED'],
        },
        gmailCategories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Gmail category labels',
          example: ['CATEGORY_PERSONAL', 'CATEGORY_SOCIAL'],
        },
      },
    },
  })
  async getFolderMetadata() {
    return {
      canonicalTypes: CANONICAL_FOLDER_TYPES,
      localizedNames: LOCALIZED_FOLDER_NAMES,
      // Display mapping: Maps provider-specific types to canonical display types
      // CRITICAL: CATEGORY_PERSONAL → INBOX (for aggregation)
      // Other CATEGORY_* types display as themselves
      displayMapping: {
        CATEGORY_PERSONAL: 'INBOX',
        CATEGORY_SOCIAL: 'CATEGORY_SOCIAL',
        CATEGORY_PROMOTIONS: 'CATEGORY_PROMOTIONS',
        CATEGORY_UPDATES: 'CATEGORY_UPDATES',
        CATEGORY_FORUMS: 'CATEGORY_FORUMS',
      },
      // Core system folders that should be displayed in sidebar
      systemFolders: ['INBOX', 'SENT', 'DRAFTS', 'ARCHIVE', 'SPAM', 'TRASH'],
      // Microsoft-specific folders
      microsoftFolders: ['OUTBOX', 'CONVERSATIONHISTORY', 'CLUTTER', 'SCHEDULED'],
      // Gmail categories
      gmailCategories: [
        'CATEGORY_PERSONAL',
        'CATEGORY_SOCIAL',
        'CATEGORY_PROMOTIONS',
        'CATEGORY_UPDATES',
        'CATEGORY_FORUMS',
      ],
    };
  }

  @Get()
  @Header('Cache-Control', 'private, max-age=30, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Get all folders for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of folders' })
  async getFolders(@Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId;

    // Get all provider configs for this tenant - ONLY safe fields
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        providerType: true,
        lastSyncedAt: true,
        isActive: true,
        // Explicitly exclude: accessToken, refreshToken, iv, tokenIv, etc.
      },
    });

    // Refresh counts before returning folders (PERF-02: parallel execution)
    await Promise.all(
      providers.map((provider) =>
        this.folderSyncService.updateAllFolderCounts(provider.id),
      ),
    );

    // Get folders for all providers
    const foldersByProvider: Record<string, any[]> = {};

    for (const provider of providers) {
      const folders = await this.prisma.folder.findMany({
        where: {
          tenantId,
          providerId: provider.id,
        },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
      });

      foldersByProvider[provider.id] = folders;
    }

    return {
      providers,
      foldersByProvider,
    };
  }

  @Get('provider/:providerId')
  @ApiOperation({ summary: 'Get folders for a specific provider' })
  @ApiResponse({ status: 200, description: 'Returns list of folders' })
  async getFoldersByProvider(
    @Request() req: AuthenticatedRequest,
    @Param('providerId') providerId: string,
  ) {
    const tenantId = req.user.tenantId;

    // Verify provider belongs to tenant - ONLY safe fields
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
      },
      select: {
        id: true,
        email: true,
        providerType: true,
        lastSyncedAt: true,
        isActive: true,
        // Explicitly exclude: accessToken, refreshToken, iv, tokenIv, etc.
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or access denied');
    }

    // Refresh counts before returning folders
    await this.folderSyncService.updateAllFolderCounts(provider.id);

    const folders = await this.prisma.folder.findMany({
      where: {
        tenantId,
        providerId,
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    return {
      provider,
      folders,
    };
  }

  @Post('sync/:providerId')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Sync folders for a specific provider' })
  @ApiResponse({ status: 200, description: 'Folders synced successfully' })
  async syncFolders(
    @Request() req: AuthenticatedRequest,
    @Param('providerId') providerId: string,
  ) {
    const tenantId = req.user.tenantId;

    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
      },
      select: { id: true, email: true, providerType: true },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or access denied');
    }

    // Sync folders via FolderSyncService
    await this.folderSyncService.syncProviderFolders(tenantId, providerId);

    // Get synced folders
    const syncedFolders = await this.prisma.folder.findMany({
      where: { tenantId, providerId },
    });

    return {
      success: true,
      foldersCount: syncedFolders.length,
      folders: syncedFolders,
    };
  }

  @Post('sync-all')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Sync folders for all providers' })
  @ApiResponse({ status: 200, description: 'Folders synced for all providers' })
  async syncAllFolders(@Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId;

    // Get all active providers for this tenant
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: { id: true, email: true },
    });

    const results: any[] = [];

    for (const provider of providers) {
      try {
        // Sync folders via FolderSyncService
        await this.folderSyncService.syncProviderFolders(tenantId, provider.id);

        const folders = await this.prisma.folder.findMany({
          where: { tenantId, providerId: provider.id },
        });

        results.push({
          providerId: provider.id,
          providerEmail: provider.email,
          success: true,
          foldersCount: folders.length,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({
          providerId: provider.id,
          providerEmail: provider.email,
          success: false,
          error: errorMessage,
        });
      }
    }

    return {
      success: true,
      results,
    };
  }

  @Post('update-counts/:providerId')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update folder counts for a provider' })
  @ApiResponse({
    status: 200,
    description: 'Folder counts updated successfully',
  })
  async updateFolderCounts(
    @Request() req: AuthenticatedRequest,
    @Param('providerId') providerId: string,
  ) {
    const tenantId = req.user.tenantId;

    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or access denied');
    }

    // Update folder counts
    await this.folderSyncService.updateAllFolderCounts(providerId);

    return {
      success: true,
      message: 'Folder counts updated successfully',
    };
  }

  // ========== FOLDER AUDIT OPERATIONS ==========

  @Get('audit/:providerId')
  @ApiOperation({ summary: 'Audit folder sync status for a provider' })
  @ApiResponse({ status: 200, description: 'Returns sync audit results' })
  async auditFolderSync(
    @Request() req: AuthenticatedRequest,
    @Param('providerId') providerId: string,
  ) {
    const tenantId = req.user.tenantId;

    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or access denied');
    }

    const audit = await this.folderSyncService.auditFolderSync(tenantId, providerId);

    return {
      success: true,
      providerId,
      providerEmail: provider.email,
      ...audit,
    };
  }

  @Post('cleanup/:providerId')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Clean up orphaned folders for a provider' })
  @ApiResponse({ status: 200, description: 'Orphaned folders cleaned up' })
  async cleanupOrphanedFolders(
    @Request() req: AuthenticatedRequest,
    @Param('providerId') providerId: string,
  ) {
    const tenantId = req.user.tenantId;

    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or access denied');
    }

    const result = await this.folderSyncService.cleanupOrphanedFolders(tenantId, providerId);

    return {
      success: true,
      providerId,
      providerEmail: provider.email,
      ...result,
    };
  }

  // ========== FOLDER CRUD OPERATIONS ==========

  /**
   * SEC-4 FIX: Rate limiting on folder operations to prevent resource exhaustion
   */
  @Post()
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Create a new folder' })
  @ApiBody({ type: CreateFolderDto })
  @ApiQuery({ name: 'wait', required: false, description: 'Wait for operation to complete (default: true)' })
  @ApiResponse({ status: 201, description: 'Folder created successfully' })
  @ApiResponse({ status: 202, description: 'Folder creation job queued' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createFolder(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateFolderDto,
    @Query('wait') wait?: string,
  ): Promise<FolderResponseDto | { jobId: string; status: string }> {
    const tenantId = req.user.tenantId;
    const shouldWait = wait !== 'false'; // Default to waiting
    const requestedAt = new Date(Date.now() - 5000);

    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: dto.providerId,
        tenantId,
      },
    });

    if (!provider) {
      throw new NotFoundException('Provider not found or access denied');
    }

    // Validate folder name
    if (!dto.name || dto.name.trim().length === 0) {
      throw new BadRequestException('Folder name is required');
    }

    try {
      // Add job to queue
      const jobId = await this.folderQueue.addCreateFolderJob(
        tenantId,
        dto.providerId,
        provider.providerType as 'google' | 'microsoft' | 'generic',
        provider.email,
        dto.name.trim(),
        dto.parentPath,
      );

      // If not waiting, return job ID immediately
      if (!shouldWait) {
        return { jobId, status: 'queued' };
      }

      // Wait for job to complete (max 30 seconds)
      const result = await this.folderQueue.waitForJob(jobId, 30000);

      if (!result) {
        const createdFolder = await this.findCreatedFolderFallback(
          tenantId,
          dto.providerId,
          dto.name,
          requestedAt,
          dto.parentPath,
        );

        if (createdFolder) {
          return createdFolder;
        }

        throw new BadRequestException('Failed to create folder: job not found');
      }

      if (!result.success) {
        throw new BadRequestException(result.error || 'Failed to create folder');
      }

      return {
        id: result.folderId || '',
        path: result.folderPath || '',
        name: result.folderName || dto.name.trim(),
      };
    } catch (error) {
      if (error instanceof FolderOperationError) {
        throw new BadRequestException(error.toJSON());
      }
      const message = error instanceof Error ? error.message : 'Failed to create folder';
      throw new BadRequestException(message);
    }
  }

  @Patch(':folderId')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Rename or move a folder' })
  @ApiBody({
    description: 'Rename folder (newName) or move folder (parentId) or both',
    schema: {
      type: 'object',
      properties: {
        newName: { type: 'string', minLength: 1, maxLength: 100, description: 'New name for the folder' },
        parentId: { type: 'string', nullable: true, description: 'New parent folder ID (null = move to root)' },
      },
    },
  })
  @ApiQuery({ name: 'wait', required: false, description: 'Wait for rename operation to complete (default: true)' })
  @ApiResponse({ status: 200, description: 'Folder updated successfully' })
  @ApiResponse({ status: 202, description: 'Folder rename job queued' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @ApiResponse({ status: 409, description: 'Cannot move system folder or circular reference' })
  async updateFolder(
    @Request() req: AuthenticatedRequest,
    @Param('folderId') folderId: string,
    @Body() dto: RenameFolderDto & MoveFolderDto,
    @Query('wait') wait?: string,
  ): Promise<FolderResponseDto | { jobId: string; status: string } | { message: string }> {
    const tenantId = req.user.tenantId;
    const shouldWait = wait !== 'false'; // Default to waiting

    // Find folder
    const folder = await this.prisma.folder.findFirst({
      where: {
        id: folderId,
        tenantId,
      },
      include: {
        provider: true,
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Handle move operation first (synchronous, no provider API call)
    if (dto.parentId !== undefined) {
      // Move operation validates system folders internally
      await this.folderSyncService.moveFolder(folderId, dto.parentId, tenantId);
    }

    // Handle rename operation (requires provider API call, uses queue)
    if (dto.newName && dto.newName.trim().length > 0) {
      // Prevent renaming system folders
      if (folder.specialUse && isSystemFolder(folder.specialUse)) {
        throw new BadRequestException(`Cannot rename system folder: ${folder.specialUse}`);
      }

      try {
        // Add job to queue
        const jobId = await this.folderQueue.addRenameFolderJob(
          tenantId,
          folder.providerId,
          folder.provider.providerType as 'google' | 'microsoft' | 'generic',
          folder.provider.email,
          folder.path,
          dto.newName.trim(),
        );

        // If not waiting, return job ID immediately
        if (!shouldWait) {
          return { jobId, status: 'queued' };
        }

        // Wait for job to complete (max 30 seconds)
        const result = await this.folderQueue.waitForJob(jobId, 30000);

        if (!result) {
          // Fallback: check if the worker already renamed the folder in DB
          const updatedFolder = await this.prisma.folder.findFirst({
            where: { id: folderId, tenantId },
          });
          if (updatedFolder && updatedFolder.name === dto.newName.trim()) {
            return {
              id: updatedFolder.id,
              path: updatedFolder.path,
              name: updatedFolder.name,
            };
          }
          throw new BadRequestException('Failed to rename folder: job not found');
        }

        if (!result.success) {
          throw new BadRequestException(result.error || 'Failed to rename folder');
        }

        return {
          id: result.folderId || folderId,
          path: result.folderPath || folder.path,
          name: result.folderName || dto.newName.trim(),
        };
      } catch (error) {
        if (error instanceof FolderOperationError) {
          throw new BadRequestException(error.toJSON());
        }
        const message = error instanceof Error ? error.message : 'Failed to rename folder';
        throw new BadRequestException(message);
      }
    }

    // If only move was performed (no rename)
    if (dto.parentId !== undefined) {
      return { message: 'Folder moved successfully' };
    }

    // No operation specified
    throw new BadRequestException('No operation specified (newName or parentId required)');
  }

  @Delete(':folderId')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Delete a folder' })
  @ApiQuery({ name: 'wait', required: false, description: 'Wait for operation to complete (default: true)' })
  @ApiResponse({ status: 200, description: 'Folder deleted successfully' })
  @ApiResponse({ status: 202, description: 'Folder delete job queued' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete system folder' })
  async deleteFolder(
    @Request() req: AuthenticatedRequest,
    @Param('folderId') folderId: string,
    @Query('wait') wait?: string,
  ): Promise<{ success: boolean; message: string } | { jobId: string; status: string }> {
    const tenantId = req.user.tenantId;
    const shouldWait = wait !== 'false'; // Default to waiting

    // Find folder
    const folder = await this.prisma.folder.findFirst({
      where: {
        id: folderId,
        tenantId,
      },
      include: {
        provider: true,
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Prevent deletion of system folders (uses canonical SYSTEM_LABEL_IDS)
    if (folder.specialUse && isSystemFolder(folder.specialUse)) {
      throw new BadRequestException(`Cannot delete system folder: ${folder.specialUse}`);
    }

    try {
      // Add job to queue
      const jobId = await this.folderQueue.addDeleteFolderJob(
        tenantId,
        folder.providerId,
        folder.provider.providerType as 'google' | 'microsoft' | 'generic',
        folder.provider.email,
        folder.path,
      );

      // If not waiting, return job ID immediately
      if (!shouldWait) {
        return { jobId, status: 'queued' };
      }

      // Wait for job to complete (max 30 seconds)
      const result = await this.folderQueue.waitForJob(jobId, 30000);

      if (!result) {
        // Fallback: check if the worker already deleted the folder from DB
        const stillExists = await this.prisma.folder.findFirst({
          where: { id: folderId, tenantId },
        });
        if (!stillExists) {
          return {
            success: true,
            message: `Folder "${folder.name}" deleted successfully`,
          };
        }
        throw new BadRequestException('Failed to delete folder: job not found');
      }

      if (!result.success) {
        throw new BadRequestException(result.error || 'Failed to delete folder');
      }

      return {
        success: true,
        message: `Folder "${folder.name}" deleted successfully`,
      };
    } catch (error) {
      if (error instanceof FolderOperationError) {
        throw new BadRequestException(error.toJSON());
      }
      const message = error instanceof Error ? error.message : 'Failed to delete folder';
      throw new BadRequestException(message);
    }
  }

  // ========== QUEUE STATUS ENDPOINTS ==========

  @Get('queue/status')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Get folder operations queue status' })
  @ApiResponse({ status: 200, description: 'Returns queue status' })
  async getQueueStatus() {
    const status = await this.folderQueue.getQueueStatus();
    const metrics = this.folderQueue.getMetrics();

    return {
      ...status,
      metrics,
    };
  }

  @Get('queue/job/:jobId')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Get folder operation job status' })
  @ApiResponse({ status: 200, description: 'Returns job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJobStatus(@Param('jobId') jobId: string) {
    const status = await this.folderQueue.getJobStatus(jobId);

    if (!status) {
      throw new NotFoundException('Job not found');
    }

    return status;
  }
}
