import {
  Controller,
  Get,
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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FolderSyncService } from '../../email-sync/services/folder-sync.service';
import { FolderOperationsQueueService } from '../../email-sync/services/folder-operations-queue.service';
import { PrismaService } from '../../../prisma/prisma.service';

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

export class FolderResponseDto {
  id: string;
  path: string;
  name: string;
}

@ApiTags('Folders')
@Controller('folders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FoldersController {
  constructor(
    private readonly folderSyncService: FolderSyncService,
    private readonly folderQueue: FolderOperationsQueueService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all folders for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of folders' })
  async getFolders(@Request() req: any) {
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

    // Refresh counts before returning folders
    for (const provider of providers) {
      await this.folderSyncService.updateAllFolderCounts(provider.id);
    }

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
    @Request() req: any,
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
  @ApiOperation({ summary: 'Sync folders for a specific provider' })
  @ApiResponse({ status: 200, description: 'Folders synced successfully' })
  async syncFolders(
    @Request() req: any,
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
  @ApiOperation({ summary: 'Sync folders for all providers' })
  @ApiResponse({ status: 200, description: 'Folders synced for all providers' })
  async syncAllFolders(@Request() req: any) {
    const tenantId = req.user.tenantId;

    // Get all active providers for this tenant
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        isActive: true,
      },
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
  @ApiOperation({ summary: 'Update folder counts for a provider' })
  @ApiResponse({
    status: 200,
    description: 'Folder counts updated successfully',
  })
  async updateFolderCounts(
    @Request() req: any,
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
    @Request() req: any,
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
  @ApiOperation({ summary: 'Clean up orphaned folders for a provider' })
  @ApiResponse({ status: 200, description: 'Orphaned folders cleaned up' })
  async cleanupOrphanedFolders(
    @Request() req: any,
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

  @Post()
  @ApiOperation({ summary: 'Create a new folder' })
  @ApiBody({ type: CreateFolderDto })
  @ApiQuery({ name: 'wait', required: false, description: 'Wait for operation to complete (default: true)' })
  @ApiResponse({ status: 201, description: 'Folder created successfully' })
  @ApiResponse({ status: 202, description: 'Folder creation job queued' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createFolder(
    @Request() req: any,
    @Body() dto: CreateFolderDto,
    @Query('wait') wait?: string,
  ): Promise<FolderResponseDto | { jobId: string; status: string }> {
    const tenantId = req.user.tenantId;
    const shouldWait = wait !== 'false'; // Default to waiting

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
      const message = error instanceof Error ? error.message : 'Failed to create folder';
      throw new BadRequestException(message);
    }
  }

  @Patch(':folderId')
  @ApiOperation({ summary: 'Rename a folder' })
  @ApiBody({ type: RenameFolderDto })
  @ApiQuery({ name: 'wait', required: false, description: 'Wait for operation to complete (default: true)' })
  @ApiResponse({ status: 200, description: 'Folder renamed successfully' })
  @ApiResponse({ status: 202, description: 'Folder rename job queued' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  async renameFolder(
    @Request() req: any,
    @Param('folderId') folderId: string,
    @Body() dto: RenameFolderDto,
    @Query('wait') wait?: string,
  ): Promise<FolderResponseDto | { jobId: string; status: string }> {
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

    // Validate new name
    if (!dto.newName || dto.newName.trim().length === 0) {
      throw new BadRequestException('New folder name is required');
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
      const message = error instanceof Error ? error.message : 'Failed to rename folder';
      throw new BadRequestException(message);
    }
  }

  @Delete(':folderId')
  @ApiOperation({ summary: 'Delete a folder' })
  @ApiQuery({ name: 'wait', required: false, description: 'Wait for operation to complete (default: true)' })
  @ApiResponse({ status: 200, description: 'Folder deleted successfully' })
  @ApiResponse({ status: 202, description: 'Folder delete job queued' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete system folder' })
  async deleteFolder(
    @Request() req: any,
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

    // Prevent deletion of system folders (check here for immediate feedback)
    const systemFolders = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'JUNK', 'ARCHIVE'];
    if (folder.specialUse && systemFolders.includes(folder.specialUse)) {
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
      const message = error instanceof Error ? error.message : 'Failed to delete folder';
      throw new BadRequestException(message);
    }
  }

  // ========== QUEUE STATUS ENDPOINTS ==========

  @Get('queue/status')
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
