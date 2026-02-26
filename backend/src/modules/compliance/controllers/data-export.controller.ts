import {
  Controller,
  Get,
  Post,
  Param,
  Request,
  Res,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { DataExportService } from '../services/data-export.service';
import { DataExportResponseDto, DataExportListDto } from '../dto/data-export.dto';
import { SkipLegalCheck } from '../decorators/skip-legal-check.decorator';

/**
 * REST API for GDPR data portability exports (DATA-01 / Article 20)
 *
 * Endpoints:
 * - POST /compliance/data-export       - Request a new data export
 * - GET  /compliance/data-export       - List recent exports
 * - GET  /compliance/data-export/:id   - Get export status
 * - GET  /compliance/data-export/:id/download - Download completed export
 *
 * @SkipLegalCheck: GDPR data rights must remain accessible regardless of legal acceptance.
 */
@ApiTags('Compliance')
@ApiBearerAuth()
@SkipLegalCheck()
@Controller('compliance/data-export')
@UseGuards(JwtAuthGuard, TenantGuard)
export class DataExportController {
  constructor(private readonly dataExportService: DataExportService) {}

  /**
   * Request a new data export. Returns existing export if one is already in progress.
   */
  @Post()
  @ApiOperation({ summary: 'Request a GDPR data export' })
  @ApiOkResponse({
    type: DataExportResponseDto,
    description: 'Export request created or existing export returned',
  })
  async requestExport(
    @Request() req: AuthenticatedRequest,
  ): Promise<DataExportResponseDto> {
    const userId = req.user.userId ?? req.user.id;
    return this.dataExportService.requestExport(userId, req.user.tenantId);
  }

  /**
   * List recent data exports for the authenticated user.
   */
  @Get()
  @ApiOperation({ summary: 'List recent data exports' })
  @ApiOkResponse({
    type: DataExportListDto,
    description: 'List of recent export requests',
  })
  async listExports(
    @Request() req: AuthenticatedRequest,
  ): Promise<DataExportListDto> {
    const userId = req.user.userId ?? req.user.id;
    const exports = await this.dataExportService.listExports(
      userId,
      req.user.tenantId,
    );
    return { exports };
  }

  /**
   * Get the status of a specific data export.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get data export status' })
  @ApiParam({ name: 'id', description: 'Export request ID' })
  @ApiOkResponse({
    type: DataExportResponseDto,
    description: 'Export request status',
  })
  async getExportStatus(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<DataExportResponseDto> {
    const userId = req.user.userId ?? req.user.id;
    return this.dataExportService.getExportStatus(id, userId);
  }

  /**
   * Download a completed data export as a ZIP file.
   * Sets appropriate headers for file download.
   */
  @Get(':id/download')
  @ApiOperation({ summary: 'Download completed data export' })
  @ApiParam({ name: 'id', description: 'Export request ID' })
  @ApiOkResponse({ description: 'ZIP file download' })
  async downloadExport(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const userId = req.user.userId ?? req.user.id;
    const filePath = await this.dataExportService.getExportFilePath(id, userId);

    const stream = createReadStream(filePath);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="pmsync-export-${id}.zip"`,
    });

    return new StreamableFile(stream);
  }
}
