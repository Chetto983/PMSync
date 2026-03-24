/**
 * Email Actions Controller - Mutations, bulk ops, drafts, retention, attachments.
 * Extracted from EmailsController (Phase 43 god-file split).
 */
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import { Response } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { EmailsService } from '../services/emails.service';
import { EmailRetentionService } from '../services/email-retention.service';
import { EmailFetchService } from '../services/email-fetch.service';
import { EmailSendService } from '../services/email-send.service';
import { EmailCleanupService } from '../services/email-cleanup.service';
import { StorageService } from '../services/storage.service';
import { AttachmentOnDemandService } from '../services/attachment-on-demand.service';
import { EmailSignatureService } from '../services/email-signature.service';
import {
  ReplyEmailRequestDto,
  ForwardEmailRequestDto,
  SendEmailRequestDto,
  SaveDraftDto,
  type EmailAttachmentDto,
} from '../dto/send-email.dto';
import {
  BulkDeleteDto,
  BulkUpdateReadDto,
  BulkUpdateStarDto,
  BulkUpdateFlagDto,
  BulkMoveToFolderDto,
  BulkLabelsDto,
} from '../dto/bulk-operations.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';

// FIX (BUG-005): Validate attachment fields before processing
interface DecodedAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

const decodeAttachments = (attachments?: EmailAttachmentDto[]): DecodedAttachment[] | undefined => {
  if (!attachments?.length) return undefined;

  return attachments
    .filter(att => att?.contentBase64 && att?.filename)
    .map((attachment) => {
      const base64Data = attachment.contentBase64.includes(',')
        ? attachment.contentBase64.split(',')[1] || attachment.contentBase64
        : attachment.contentBase64;

      return {
        filename: attachment.filename,
        contentType: attachment.contentType || 'application/octet-stream',
        content: Buffer.from(base64Data, 'base64'),
      };
    });
};

const toNodeReadableStream = (streamBody: unknown): NodeJS.ReadableStream => {
  if (!streamBody) {
    throw new BadRequestException('Attachment response body missing');
  }

  if (typeof (streamBody as NodeJS.ReadableStream).pipe === 'function') {
    return streamBody as NodeJS.ReadableStream;
  }

  return Readable.fromWeb(streamBody as any);
};

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
@UseGuards(TenantGuard, RolesGuard)
export class EmailActionsController {
  private readonly logger = new Logger(EmailActionsController.name);

  constructor(
    private emailsService: EmailsService,
    private retentionService: EmailRetentionService,
    private fetchService: EmailFetchService,
    private emailSendService: EmailSendService,
    private cleanupService: EmailCleanupService,
    private storageService: StorageService,
    private attachmentOnDemandService: AttachmentOnDemandService,
    private prisma: PrismaService,
    private signatureService: EmailSignatureService,
  ) {}

  /**
   * POST /emails/send - Send a new email
   */
  @Post('send')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('send')
  async sendEmail(@Req() req: AuthenticatedRequest, @Body() body: SendEmailRequestDto) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { providerId, attachments, signatureId, ...rest } = body;

    let bodyHtml = rest.bodyHtml;
    const signature = await this.signatureService.getSignatureForSend(
      tenantId,
      userId,
      signatureId,
      providerId,
    );
    if (signature) {
      bodyHtml = `${bodyHtml}<br><br>${signature}`;
    }

    return this.emailSendService.sendEmail({
      tenantId,
      providerId,
      ...rest,
      bodyHtml,
      attachments: decodeAttachments(attachments),
    });
  }

  /**
   * POST /emails/:id/reply - Reply to an email
   */
  @Post(':id/reply')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('send')
  async replyToEmail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ReplyEmailRequestDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { signatureId, ...rest } = body;

    const originalEmail = await this.prisma.email.findFirst({
      where: { id, tenantId },
      select: { providerId: true },
    });

    let bodyHtml = rest.bodyHtml;
    if (originalEmail) {
      const signature = await this.signatureService.getSignatureForSend(
        tenantId,
        userId,
        signatureId,
        originalEmail.providerId,
      );
      if (signature) {
        bodyHtml = `${bodyHtml}<br><br>${signature}`;
      }
    }

    return this.emailSendService.replyToEmail(id, tenantId, {
      ...rest,
      bodyHtml,
      attachments: decodeAttachments(rest.attachments),
    });
  }

  /**
   * POST /emails/:id/forward - Forward an email
   */
  @Post(':id/forward')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('send')
  async forwardEmail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: ForwardEmailRequestDto,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { signatureId, ...rest } = body;

    const originalEmail = await this.prisma.email.findFirst({
      where: { id, tenantId },
      select: { providerId: true },
    });

    let signatureContent: string | null = null;
    if (originalEmail) {
      signatureContent = await this.signatureService.getSignatureForSend(
        tenantId,
        userId,
        signatureId,
        originalEmail.providerId,
      );
    }

    return this.emailSendService.forwardEmail(id, tenantId, {
      ...rest,
      attachments: decodeAttachments(rest.attachments),
    }, signatureContent);
  }

  /**
   * PATCH /emails/:id - Update email flags
   */
  @Patch(':id')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async updateEmail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() data: { isRead?: boolean; isStarred?: boolean; isFlagged?: boolean; folder?: string },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.updateEmail(id, tenantId, data);
  }

  /**
   * DELETE /emails/bulk - Bulk delete emails
   * IMPORTANT: Must come before @Delete(':id') to avoid route conflict
   */
  @Delete('bulk')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('destructive-write')
  async bulkDelete(
    @Req() req: AuthenticatedRequest,
    @Body() data: BulkDeleteDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkDelete(data.emailIds, tenantId);
  }

  /**
   * DELETE /emails/:id - Delete email
   */
  @Delete(':id')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('destructive-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEmail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    await this.emailsService.deleteEmail(id, tenantId);
  }

  /**
   * POST /emails/drafts - Create or update a draft (autosave)
   */
  @Post('drafts')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async saveDraft(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SaveDraftDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.saveDraft(tenantId, dto);
  }

  /**
   * GET /emails/drafts/:id - Get a draft by ID
   */
  @Get('drafts/:id')
  async getDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getDraft(id, tenantId);
  }

  /**
   * DELETE /emails/drafts/:id - Delete a draft
   */
  @Delete('drafts/:id')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('destructive-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    await this.emailsService.deleteDraft(id, tenantId);
  }

  /** PATCH /emails/bulk/read - Mark multiple emails as read/unread */
  @Patch('bulk/read')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async bulkUpdateRead(@Req() req: AuthenticatedRequest, @Body() data: BulkUpdateReadDto) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateRead(data.emailIds, tenantId, data.isRead);
  }

  /** PATCH /emails/bulk/star - Bulk star/unstar emails */
  @Patch('bulk/star')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async bulkUpdateStar(@Req() req: AuthenticatedRequest, @Body() data: BulkUpdateStarDto) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateStarred(data.emailIds, tenantId, data.isStarred);
  }

  /** PATCH /emails/bulk/flag - Bulk flag/unflag emails */
  @Patch('bulk/flag')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async bulkUpdateFlag(@Req() req: AuthenticatedRequest, @Body() data: BulkUpdateFlagDto) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateFlagged(data.emailIds, tenantId, data.isFlagged);
  }

  /** PATCH /emails/bulk/move - Bulk move emails to folder */
  @Patch('bulk/move')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async bulkMoveToFolder(@Req() req: AuthenticatedRequest, @Body() data: BulkMoveToFolderDto) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkMoveToFolder(data.emailIds, tenantId, data.folder);
  }

  /** PATCH /emails/bulk/labels/add - Bulk add labels to emails */
  @Patch('bulk/labels/add')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async bulkAddLabels(@Req() req: AuthenticatedRequest, @Body() data: BulkLabelsDto) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkAddLabels(data.emailIds, tenantId, data.labelIds);
  }

  /** PATCH /emails/bulk/labels/remove - Bulk remove labels from emails */
  @Patch('bulk/labels/remove')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async bulkRemoveLabels(@Req() req: AuthenticatedRequest, @Body() data: BulkLabelsDto) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkRemoveLabels(data.emailIds, tenantId, data.labelIds);
  }

  /** POST /emails/:id/fetch-archived - Fetch archived email from server */
  @Post(':id/fetch-archived')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('safe-write')
  async fetchArchivedEmail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.fetchService.fetchArchivedEmail(id, tenantId);
  }

  /** POST /emails/maintenance/cleanup - Remove duplicates and purge deleted emails */
  @Post('maintenance/cleanup')
  @Roles('admin', 'super-admin')
  @RateTierDecorator('destructive-write')
  async runTenantCleanup(@Req() req: AuthenticatedRequest) {
    return this.cleanupService.runTenantMaintenance(req.user.tenantId);
  }

  /** GET /emails/retention/stats - Get retention statistics */
  @Get('retention/stats')
  @Roles('admin', 'super-admin')
  async getRetentionStats(@Req() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId;
    return this.retentionService.getRetentionStats(tenantId);
  }

  /** POST /emails/retention/run - Manually run retention policy */
  @Post('retention/run')
  @Roles('super-admin')
  @RateTierDecorator('destructive-write')
  async runRetentionPolicy(@Req() req: AuthenticatedRequest, @Body() data?: { retentionDays?: number }) {
    const tenantId = req.user.tenantId;
    return this.retentionService.runManualRetention(tenantId, data?.retentionDays);
  }

  /** GET /emails/:emailId/attachments/:attachmentId/download - Download attachment */
  @Get(':emailId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param('emailId') emailId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const tenantId = req.user.tenantId;
    const attachment = await this.emailsService.getAttachmentDownloadUrl(emailId, attachmentId, tenantId);

    let signedUrl: string | null = null;
    if (attachment.storageType === 's3' && attachment.storagePath) {
      signedUrl = await this.storageService.getSignedDownloadUrl(attachment.storagePath);
    }
    if (!signedUrl && attachment.storageType === 'pending') {
      const result = await this.attachmentOnDemandService.downloadAttachment(attachmentId, tenantId);
      signedUrl = result.url;
    }

    if (!signedUrl) {
      throw new BadRequestException('Invalid or unsupported storage configuration');
    }

    const nodeFetch = await import('node-fetch');
    const fetch = nodeFetch.default;
    const storageResponse = await fetch(signedUrl);

    if (!storageResponse.ok) {
      throw new BadRequestException(`Failed to fetch attachment content: ${storageResponse.status}`);
    }

    res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');

    const sanitizedFilename = attachment.filename
      .replace(/[\r\n\0]/g, '')
      .replace(/[<>:"/\\|?*]/g, '_')
      .substring(0, 255);
    const safeFilename = encodeURIComponent(sanitizedFilename).replace(/['()]/g, escape);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${safeFilename}`);

    const contentLength = storageResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const nodeStream = toNodeReadableStream(storageResponse.body);
    await pipeline(nodeStream, res);
  }
}
