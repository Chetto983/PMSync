import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailsService, EmailListFilters } from '../services/emails.service';
import { EmailRetentionService } from '../services/email-retention.service';
import { EmailFetchService } from '../services/email-fetch.service';
import { EmailSendService } from '../services/email-send.service';
import { EmailCleanupService } from '../services/email-cleanup.service';
import { StorageService } from '../services/storage.service';
import {
  ReplyForwardEmailRequestDto,
  SendEmailRequestDto,
  type EmailAttachmentDto,
} from '../dto/send-email.dto';

const decodeAttachments = (attachments?: EmailAttachmentDto[]) =>
  attachments?.map((attachment) => {
    const [, base64 = attachment.contentBase64] =
      attachment.contentBase64.split(',');

    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      content: Buffer.from(base64, 'base64'),
    };
  });

@Controller('emails')
@UseGuards(JwtAuthGuard)
export class EmailsController {
  constructor(
    private emailsService: EmailsService,
    private retentionService: EmailRetentionService,
    private fetchService: EmailFetchService,
    private emailSendService: EmailSendService,
    private cleanupService: EmailCleanupService,
    private storageService: StorageService,
  ) {}

  /**
   * GET /emails - List emails with pagination and filters
   */
  @Get()
  @SkipThrottle()
  async listEmails(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('providerId') providerId?: string,
    @Query('folder') folder?: string,
    @Query('isRead') isRead?: string,
    @Query('isStarred') isStarred?: string,
    @Query('hasAttachments') hasAttachments?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('subject') subject?: string,
    @Query('labelIds') labelIds?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const tenantId = req.user.tenantId;

    // Validate and sanitize pagination parameters
    const parsedPage = page ? parseInt(page) : 1;
    const parsedLimit = limit ? parseInt(limit) : 50;

    // Security: Enforce maximum limit to prevent DOS attacks
    const MAX_LIMIT = 1000;
    const MIN_PAGE = 1;

    if (parsedPage < MIN_PAGE) {
      throw new BadRequestException(`Page must be at least ${MIN_PAGE}`);
    }

    if (parsedLimit < 1) {
      throw new BadRequestException('Limit must be at least 1');
    }

    if (parsedLimit > MAX_LIMIT) {
      throw new BadRequestException(`Limit cannot exceed ${MAX_LIMIT}`);
    }

    const filters: EmailListFilters = {};
    if (folder) filters.folder = folder;
    if (isRead !== undefined) filters.isRead = isRead === 'true';
    if (isStarred !== undefined) filters.isStarred = isStarred === 'true';
    if (hasAttachments !== undefined) filters.hasAttachments = hasAttachments === 'true';
    if (search) filters.search = search;
    if (from) filters.from = from;
    if (to) filters.to = to;
    if (subject) filters.subject = subject;
    if (labelIds) filters.labelIds = labelIds.split(',').map(id => id.trim()).filter(Boolean);
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.emailsService.listEmails({
      tenantId,
      providerId,
      page: parsedPage,
      limit: parsedLimit,
      filters,
    });
  }

  /**
   * GET /emails/stats - Get email statistics
   */
  @Get('stats')
  @SkipThrottle()
  async getStats(@Req() req: any, @Query('providerId') providerId?: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getStats(tenantId, providerId);
  }

  /**
   * GET /emails/search - Search emails
   */
  @Get('search')
  @SkipThrottle()
  async searchEmails(
    @Req() req: any,
    @Query('q') query: string,
    @Query('providerId') providerId?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user.tenantId;
    const emails = await this.emailsService.searchEmails(
      tenantId,
      query,
      providerId,
      limit ? parseInt(limit) : 20,
    );

    return { emails };
  }

  /**
   * GET /emails/conversations - Get conversation view (threaded emails)
   */
  @Get('conversations')
  async getConversations(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('providerId') providerId?: string,
    @Query('folder') folder?: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getConversations({
      tenantId,
      providerId,
      folder,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  /**
   * GET /emails/thread/:threadId - Get all emails in a thread
   */
  @Get('thread/:threadId')
  async getThread(@Req() req: any, @Param('threadId') threadId: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getThread(threadId, tenantId);
  }

  /**
   * GET /emails/:id - Get email by ID
   */
  @Get(':id')
  async getEmail(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getEmailById(id, tenantId);
  }

  /**
   * POST /emails/send - Send a new email
   */
  @Post('send')
  async sendEmail(@Req() req: any, @Body() body: SendEmailRequestDto) {
    const tenantId = req.user.tenantId;
    const { providerId, attachments, ...rest } = body;

    return this.emailSendService.sendEmail({
      tenantId,
      providerId,
      ...rest,
      attachments: decodeAttachments(attachments),
    });
  }

  /**
   * POST /emails/:id/reply - Reply to an email
   */
  @Post(':id/reply')
  async replyToEmail(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ReplyForwardEmailRequestDto,
  ) {
    const tenantId = req.user.tenantId;

    return this.emailSendService.replyToEmail(id, tenantId, {
      ...body,
      attachments: decodeAttachments(body.attachments),
    });
  }

  /**
   * POST /emails/:id/forward - Forward an email
   */
  @Post(':id/forward')
  async forwardEmail(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: ReplyForwardEmailRequestDto,
  ) {
    const tenantId = req.user.tenantId;

    return this.emailSendService.forwardEmail(id, tenantId, {
      ...body,
      attachments: decodeAttachments(body.attachments),
    });
  }

  /**
   * PATCH /emails/:id - Update email flags
   */
  @Patch(':id')
  async updateEmail(
    @Req() req: any,
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
  async bulkDelete(
    @Req() req: any,
    @Body() data: { emailIds: string[] },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkDelete(data.emailIds, tenantId);
  }

  /**
   * DELETE /emails/:id - Delete email
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEmail(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    await this.emailsService.deleteEmail(id, tenantId);
  }

  /**
   * Create or update a draft (autosave)
   * POST /emails/drafts
   */
  @Post('drafts')
  async saveDraft(
    @Req() req: any,
    @Body()
    dto: {
      id?: string;
      providerId: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      attachments?: {
        filename: string;
        contentType: string;
        size?: number;
        contentBase64?: string;
      }[];
    },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.saveDraft(tenantId, dto);
  }

  /**
   * Get a draft by ID
   * GET /emails/drafts/:id
   */
  @Get('drafts/:id')
  async getDraft(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getDraft(id, tenantId);
  }

  /**
   * Delete a draft
   * DELETE /emails/drafts/:id
   */
  @Delete('drafts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDraft(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    await this.emailsService.deleteDraft(id, tenantId);
  }

  /**
   * PATCH /emails/bulk/read - Mark multiple emails as read/unread
   */
  @Patch('bulk/read')
  async bulkUpdateRead(
    @Req() req: any,
    @Body() data: { emailIds: string[]; isRead: boolean },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateRead(
      data.emailIds,
      tenantId,
      data.isRead,
    );
  }
  /**
   * PATCH /emails/bulk/star - Bulk star/unstar emails
   */
  @Patch('bulk/star')
  async bulkUpdateStar(
    @Req() req: any,
    @Body() data: { emailIds: string[]; isStarred: boolean },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateStarred(
      data.emailIds,
      tenantId,
      data.isStarred,
    );
  }

  /**
   * PATCH /emails/bulk/flag - Bulk flag/unflag emails (mark as important)
   */
  @Patch('bulk/flag')
  async bulkUpdateFlag(
    @Req() req: any,
    @Body() data: { emailIds: string[]; isFlagged: boolean },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkUpdateFlagged(
      data.emailIds,
      tenantId,
      data.isFlagged,
    );
  }

  /**
   * PATCH /emails/bulk/move - Bulk move emails to folder
   */
  @Patch('bulk/move')
  async bulkMoveToFolder(
    @Req() req: any,
    @Body() data: { emailIds: string[]; folder: string },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkMoveToFolder(
      data.emailIds,
      tenantId,
      data.folder,
    );
  }

  /**
   * PATCH /emails/bulk/labels/add - Bulk add labels to emails
   */
  @Patch('bulk/labels/add')
  async bulkAddLabels(
    @Req() req: any,
    @Body() data: { emailIds: string[]; labelIds: string[] },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkAddLabels(
      data.emailIds,
      tenantId,
      data.labelIds,
    );
  }

  /**
   * PATCH /emails/bulk/labels/remove - Bulk remove labels from emails
   */
  @Patch('bulk/labels/remove')
  async bulkRemoveLabels(
    @Req() req: any,
    @Body() data: { emailIds: string[]; labelIds: string[] },
  ) {
    const tenantId = req.user.tenantId;
    return this.emailsService.bulkRemoveLabels(
      data.emailIds,
      tenantId,
      data.labelIds,
    );
  }

  /**
   * POST /emails/:id/fetch-archived - Fetch archived email from server
   */
  @Post(':id/fetch-archived')
  async fetchArchivedEmail(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    return this.fetchService.fetchArchivedEmail(id, tenantId);
  }

  /**
   * POST /emails/maintenance/cleanup - Remove duplicates and purge deleted emails for current tenant
   */
  @Post('maintenance/cleanup')
  async runTenantCleanup(@Req() req: any) {
    if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
      throw new ForbiddenException('Administrator access required');
    }

    return this.cleanupService.runTenantMaintenance(req.user.tenantId);
  }

  /**
   * GET /emails/retention/stats - Get retention statistics for current tenant
   * SECURITY: Requires admin role, returns stats for user's tenant only
   */
  @Get('retention/stats')
  async getRetentionStats(@Req() req: any) {
    const tenantId = req.user.tenantId;

    // Require admin or super-admin role
    if (req.user.role !== 'admin' && req.user.role !== 'super-admin') {
      throw new ForbiddenException('Administrator access required for retention statistics');
    }

    return this.retentionService.getRetentionStats(tenantId);
  }

  /**
   * POST /emails/retention/run - Manually run retention policy
   * SECURITY: SUPER-ADMIN ONLY - Archives old emails for current tenant
   */
  @Post('retention/run')
  async runRetentionPolicy(@Req() req: any, @Body() data?: { retentionDays?: number }) {
    const tenantId = req.user.tenantId;

    // CRITICAL: Only super-admin can trigger retention policy
    if (req.user.role !== 'super-admin') {
      throw new ForbiddenException(
        'Super administrator access required to run retention policy',
      );
    }

    return this.retentionService.runManualRetention(tenantId, data?.retentionDays);
  }

  /**
   * GET /emails/:emailId/attachments/:attachmentId/download - Download attachment
   */
  @Get(':emailId/attachments/:attachmentId/download')
  async downloadAttachment(
    @Req() req: any,
    @Res() res: any,
    @Param('emailId') emailId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const tenantId = req.user.tenantId;
    const attachment = await this.emailsService.getAttachmentDownloadUrl(emailId, attachmentId, tenantId);

    if (attachment.storageType === 's3' && attachment.storagePath) {
      const signedUrl = await this.storageService.getSignedDownloadUrl(attachment.storagePath);
      return res.redirect(signedUrl);
    }

    return res.status(400).json({ message: 'Invalid or unsupported storage configuration' });
  }
}
