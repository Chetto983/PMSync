import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Inject,
  forwardRef,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FolderSyncService } from '../../email-sync/services/folder-sync.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RealtimeEventsService } from '../../realtime/services/realtime-events.service';

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
    @Inject(forwardRef(() => FolderSyncService))
    private readonly folderSyncService: FolderSyncService,
    private readonly prisma: PrismaService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all folders for current user' })
  @ApiResponse({ status: 200, description: 'Returns list of folders' })
  async getFolders(@Request() req: any) {
    const tenantId = req.user.tenantId;

    // Get all provider configs for this tenant
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        isActive: true,
      },
    });

    // Refresh counts before returning folders
    for (const provider of providers) {
      await this.folderSyncService.updateAllFolderCounts(provider.id);
    }

    // Get folders for all providers
    const foldersByProvider: Record<string, any[]> = {};

    for (const provider of providers) {
      const folders = await (this.prisma as any).folder.findMany({
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

    // Verify provider belongs to tenant
    const provider = await this.prisma.providerConfig.findFirst({
      where: {
        id: providerId,
        tenantId,
      },
    });

    if (!provider) {
      throw new Error('Provider not found or access denied');
    }

    // Refresh counts before returning folders
    await this.folderSyncService.updateAllFolderCounts(provider.id);

    const folders = await (this.prisma as any).folder.findMany({
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
      throw new Error('Provider not found or access denied');
    }

    // Sync folders via FolderSyncService
    await this.folderSyncService.syncProviderFolders(tenantId, providerId);

    // Get synced folders
    const syncedFolders = await (this.prisma as any).folder.findMany({
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

        const folders = await (this.prisma as any).folder.findMany({
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
      throw new Error('Provider not found or access denied');
    }

    // Update folder counts
    await this.folderSyncService.updateAllFolderCounts(providerId);

    return {
      success: true,
      message: 'Folder counts updated successfully',
    };
  }

  // ========== FOLDER CRUD OPERATIONS ==========

  @Post()
  @ApiOperation({ summary: 'Create a new folder' })
  @ApiBody({ type: CreateFolderDto })
  @ApiResponse({ status: 201, description: 'Folder created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async createFolder(
    @Request() req: any,
    @Body() dto: CreateFolderDto,
  ): Promise<FolderResponseDto> {
    const tenantId = req.user.tenantId;

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

    const result = await this.folderSyncService.createFolder(
      tenantId,
      dto.providerId,
      dto.name.trim(),
      dto.parentPath,
    );

    // Emit realtime event
    this.realtimeEvents.emitFolderCreated(tenantId, {
      providerId: dto.providerId,
      folderId: result.id,
      folderName: result.name,
      folderPath: result.path,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  @Patch(':folderId')
  @ApiOperation({ summary: 'Rename a folder' })
  @ApiBody({ type: RenameFolderDto })
  @ApiResponse({ status: 200, description: 'Folder renamed successfully' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  async renameFolder(
    @Request() req: any,
    @Param('folderId') folderId: string,
    @Body() dto: RenameFolderDto,
  ): Promise<FolderResponseDto> {
    const tenantId = req.user.tenantId;

    // Find folder
    const folder = await this.prisma.folder.findFirst({
      where: {
        id: folderId,
        tenantId,
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Validate new name
    if (!dto.newName || dto.newName.trim().length === 0) {
      throw new BadRequestException('New folder name is required');
    }

    const result = await this.folderSyncService.renameFolder(
      tenantId,
      folder.providerId,
      folder.path,
      dto.newName.trim(),
    );

    // Emit realtime event
    this.realtimeEvents.emitFolderRenamed(tenantId, {
      providerId: folder.providerId,
      folderId: result.id,
      folderName: result.name,
      folderPath: result.path,
      oldName: folder.name,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  @Delete(':folderId')
  @ApiOperation({ summary: 'Delete a folder' })
  @ApiResponse({ status: 200, description: 'Folder deleted successfully' })
  @ApiResponse({ status: 404, description: 'Folder not found' })
  @ApiResponse({ status: 400, description: 'Cannot delete system folder' })
  async deleteFolder(
    @Request() req: any,
    @Param('folderId') folderId: string,
  ): Promise<{ success: boolean; message: string }> {
    const tenantId = req.user.tenantId;

    // Find folder
    const folder = await this.prisma.folder.findFirst({
      where: {
        id: folderId,
        tenantId,
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    try {
      await this.folderSyncService.deleteFolder(
        tenantId,
        folder.providerId,
        folder.path,
      );

      // Emit realtime event
      this.realtimeEvents.emitFolderDeleted(tenantId, {
        providerId: folder.providerId,
        folderId: folder.id,
        folderName: folder.name,
        folderPath: folder.path,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: `Folder "${folder.name}" deleted successfully`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete folder';
      throw new BadRequestException(message);
    }
  }
}
