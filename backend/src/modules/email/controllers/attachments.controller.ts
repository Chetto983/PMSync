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
import { Response } from 'express';
import { Readable } from 'stream';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AttachmentOnDemandService } from '../services/attachment-on-demand.service';

/**
 * HTTP API endpoints for email attachments
 *
 * Provides:
 * - On-demand attachment downloads (with S3 signed URL redirect)
 * - Attachment metadata queries
 *
 * Authorization: All endpoints require JWT authentication
 * Tenant isolation: Enforced via req.user.tenantId
 */
@Controller('email/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(
    private readonly attachmentOnDemandService: AttachmentOnDemandService,
  ) {}

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
  async downloadAttachment(
    @Param('id') id: string,
    @Req() req: any,
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
      // @ts-expect-error - node-fetch types not available
      const nodeFetch = await import('node-fetch');
      const fetch = nodeFetch.default;
      const s3Response = await fetch(result.url);

      if (!s3Response.ok) {
        throw new Error(`Failed to fetch from S3: ${s3Response.statusText}`);
      }

      // Set response headers for file download
      res.setHeader('Content-Type', result.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename.replace(/"/g, '\\"')}"`,
      );

      // Get content length from S3 response if available
      const contentLength = s3Response.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      // Stream the file from S3 to client (efficient memory usage)
      if (s3Response.body) {
        const nodeStream = Readable.from(s3Response.body);
        nodeStream.pipe(res);
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
  async getAttachmentMetadata(
    @Param('id') id: string,
    @Req() req: any,
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
