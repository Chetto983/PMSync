import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AttachmentOnDemandService } from '../services/attachment-on-demand.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';

/**
 * HTTP API endpoints for email attachments
 *
 * Provides:
 * - On-demand attachment downloads (with S3 signed URL redirect)
 * - Attachment metadata queries
 *
 * Authorization: All endpoints require session authentication
 * Tenant isolation: Enforced via req.user.tenantId and TenantGuard
 */
@ApiTags('Email Attachments')
@ApiBearerAuth()
@Controller('email/attachments')
@UseGuards(TenantGuard, RolesGuard)
export class AttachmentsController {
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(
    private readonly attachmentOnDemandService: AttachmentOnDemandService,
  ) { }

  /**
   * Download an attachment
   *
   * Flow:
   * 1. Check if attachment is already in S3 → get signed URL (fast path)
   * 2. If metadata-only (storageType='pending'):
   *    - Fetch from provider (Gmail/Microsoft/IMAP)
   *    - Upload to S3
   *    - Update database record
   * 3. Stream file from S3 through backend to frontend (proxy)
   *    - Keeps MinIO/S3 unexposed to frontend (security)
   *    - Uses streaming to avoid loading entire file in memory
   *
   * @param id - Attachment ID
   * @param req - HTTP request (contains authenticated user)
   * @param res - HTTP response (for streaming)
   *
   * @example
   * GET /email/attachments/abc-123/download
   * → Streams file content with proper Content-Disposition header
   */
  @Get(':id/download')
  @ApiOperation({ summary: 'Download attachment', description: 'Stream download of an email attachment by ID' })
  @ApiParam({ name: 'id', description: 'Attachment ID' })
  @ApiResponse({ status: 200, description: 'Attachment file stream' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async downloadAttachment(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const tenantId = req.user.tenantId;

      this.logger.log(
        `[AttachmentsController] Attachment download requested: ${id} by tenant ${tenantId}`,
      );

      // Get signed download URL (may trigger on-demand fetch from provider)
      const result = await this.attachmentOnDemandService.downloadAttachment(
        id,
        tenantId,
      );

      this.logger.log(
        `[AttachmentsController] Proxying download from S3 for attachment ${id}: ${result.filename}`,
      );

      // Fetch file from S3 and stream to client
      const nodeFetch = await import('node-fetch');
      const fetch = nodeFetch.default;
      const s3Response = await fetch(result.url);

      if (!s3Response.ok) {
        throw new Error(`Failed to fetch from S3: ${s3Response.statusText}`);
      }

      // Set response headers for file download
      res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');

      // SEC-7 FIX: Sanitize filename to prevent header injection attacks
      // Remove dangerous characters (CR, LF, null bytes) and limit length before encoding
      const sanitizedFilename = result.filename
        .replace(/[\r\n\0]/g, '') // Remove CR, LF, null bytes (header injection prevention)
        .replace(/[<>:"/\\|?*]/g, '_') // Replace filesystem-unsafe chars
        .substring(0, 255); // Limit length to prevent buffer issues

      // Use RFC 5987 encoding to support unicode filenames
      const safeFilename = encodeURIComponent(sanitizedFilename).replace(/['()]/g, escape);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${safeFilename}`,
      );

      // Get content length from S3 response if available
      const contentLength = s3Response.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      // Stream the file from S3 to client (piped streaming -- constant memory usage)
      if (s3Response.body) {
        const nodeStream = Readable.fromWeb(s3Response.body as any);  
        await pipeline(nodeStream, res);
      } else {
        throw new Error('No response body from S3');
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Attachment not found or access denied: ${id} by tenant ${req.user.tenantId}`,
        );
        throw error;
      }

      this.logger.error(
        `Failed to download attachment ${id}: ${err.message}`,
        err.stack,
      );

      throw error;
    }
  }

  /**
   * Get attachment metadata (without downloading)
   *
   * Returns:
   * - filename
   * - mimeType
   * - size
   * - isInS3 (true if already cached in S3, false if pending download)
   *
   * Use cases:
   * - Display attachment info in UI without triggering download
   * - Check if attachment needs to be fetched from provider
   * - Show file size before user decides to download
   *
   * @param id - Attachment ID
   * @param req - HTTP request (contains authenticated user)
   *
   * @example
   * GET /email/attachments/abc-123/metadata
   * → { filename: "report.pdf", mimeType: "application/pdf", size: 1048576, isInS3: false }
   */
  @Get(':id/metadata')
  @ApiOperation({ summary: 'Get attachment metadata', description: 'Get attachment info without downloading' })
  @ApiParam({ name: 'id', description: 'Attachment ID' })
  @ApiResponse({ status: 200, description: 'Attachment metadata' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async getAttachmentMetadata(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{
    filename: string;
    mimeType: string;
    size: number;
    isInS3: boolean;
  }> {
    try {
      const tenantId = req.user.tenantId;

      const metadata =
        await this.attachmentOnDemandService.getAttachmentMetadata(id, tenantId);

      this.logger.debug(
        `Attachment metadata retrieved: ${id} (${metadata.filename}, ${(metadata.size / 1024 / 1024).toFixed(2)}MB, isInS3=${metadata.isInS3})`,
      );

      return metadata;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (error instanceof NotFoundException) {
        this.logger.warn(
          `Attachment not found or access denied: ${id} by tenant ${req.user.tenantId}`,
        );
        throw error;
      }

      this.logger.error(
        `Failed to get attachment metadata for ${id}: ${err.message}`,
        err.stack,
      );

      throw error;
    }
  }
}
