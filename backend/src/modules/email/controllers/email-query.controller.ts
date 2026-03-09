/**
 * Email Query Controller
 *
 * Handles read-only query endpoints:
 * - GET /emails (list with pagination/filters)
 * - GET /emails/stats
 * - GET /emails/search
 *
 * Extracted from EmailsController (Phase 43 god-file split).
 */
import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { EmailsService, EmailListFilters } from '../services/emails.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
@UseGuards(TenantGuard, RolesGuard)
export class EmailQueryController {
  private readonly maxEmailListLimit: number;
  private readonly logger = new Logger(EmailQueryController.name);

  constructor(
    private emailsService: EmailsService,
    private configService: ConfigService,
  ) {
    this.maxEmailListLimit = this.configService.get<number>('EMAIL_LIST_MAX_LIMIT') || 1000;
  }

  /**
   * GET /emails - List emails with pagination and filters
   * SECURITY FIX (2025-01-05): Removed @SkipThrottle - was enumeration attack vector
   */
  @Get()
  @ApiOperation({ summary: 'List emails', description: 'Get paginated list of emails with optional filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 50, max: 1000)' })
  @ApiQuery({ name: 'providerId', required: false, type: String, description: 'Filter by provider ID' })
  @ApiQuery({ name: 'folder', required: false, type: String, description: 'Filter by folder path (e.g., "Posta in arrivo")' })
  @ApiQuery({ name: 'specialUse', required: false, type: String, description: 'RFC 6154 folder type: INBOX, SENT, DRAFTS, TRASH, SPAM, ARCHIVE' })
  @ApiQuery({ name: 'isRead', required: false, type: Boolean, description: 'Filter by read status' })
  @ApiQuery({ name: 'isStarred', required: false, type: Boolean, description: 'Filter by starred status' })
  @ApiQuery({ name: 'isFlagged', required: false, type: Boolean, description: 'Filter by flagged/important status' })
  @ApiQuery({ name: 'isImportant', required: false, type: Boolean, description: 'Filter emails that are starred OR flagged (important)' })
  @ApiQuery({ name: 'hasAttachments', required: false, type: Boolean, description: 'Filter emails with attachments' })
  @ApiQuery({ name: 'fromVip', required: false, type: Boolean, description: 'Filter emails from VIP contacts only' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search in subject, from, body' })
  @ApiQuery({ name: 'labelIds', required: false, type: String, description: 'Comma-separated label IDs' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filter from date (ISO 8601)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filter to date (ISO 8601)' })
  @ApiQuery({ name: 'excludeTrashSpam', required: false, type: Boolean, description: 'SECURITY: Exclude emails from TRASH/SPAM/JUNK folders' })
  @ApiResponse({ status: 200, description: 'Paginated list of emails' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listEmails(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('providerId') providerId?: string,
    @Query('folder') folder?: string,
    @Query('specialUse') specialUse?: string,
    @Query('isRead') isRead?: string,
    @Query('isStarred') isStarred?: string,
    @Query('isFlagged') isFlagged?: string,
    @Query('isImportant') isImportant?: string,
    @Query('hasAttachments') hasAttachments?: string,
    @Query('fromVip') fromVip?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('subject') subject?: string,
    @Query('labelIds') labelIds?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('excludeTrashSpam') excludeTrashSpam?: string,
  ) {
    const tenantId = req.user.tenantId;

    // SEC-5 FIX: Validate and sanitize pagination parameters with NaN checks
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;

    if (isNaN(parsedPage) || isNaN(parsedLimit)) {
      throw new BadRequestException('Invalid pagination parameters: page and limit must be numbers');
    }

    const MIN_PAGE = 1;
    const MAX_PAGE = 10000;

    if (parsedPage < MIN_PAGE) {
      throw new BadRequestException(`Page must be at least ${MIN_PAGE}`);
    }
    if (parsedPage > MAX_PAGE) {
      throw new BadRequestException(`Page cannot exceed ${MAX_PAGE}`);
    }
    if (parsedLimit < 1) {
      throw new BadRequestException('Limit must be at least 1');
    }
    if (parsedLimit > this.maxEmailListLimit) {
      throw new BadRequestException(`Limit cannot exceed ${this.maxEmailListLimit}`);
    }

    const filters: EmailListFilters = {};
    if (folder) filters.folder = folder;
    if (specialUse) filters.specialUse = specialUse;
    if (isRead !== undefined) filters.isRead = isRead === 'true';
    if (isStarred !== undefined) filters.isStarred = isStarred === 'true';
    if (isFlagged !== undefined) filters.isFlagged = isFlagged === 'true';
    if (isImportant !== undefined) filters.isImportant = isImportant === 'true';
    if (hasAttachments !== undefined) filters.hasAttachments = hasAttachments === 'true';
    if (fromVip !== undefined) filters.fromVip = fromVip === 'true';
    if (search) filters.search = search;
    if (from) filters.from = from;
    if (to) filters.to = to;
    if (subject) filters.subject = subject;
    if (labelIds) filters.labelIds = labelIds.split(',').map(id => id.trim()).filter(Boolean);
    if (startDate) {
      const parsedStartDate = new Date(startDate);
      if (Number.isNaN(parsedStartDate.getTime())) {
        throw new BadRequestException('Invalid startDate: must be a valid ISO 8601 date');
      }
      filters.startDate = parsedStartDate;
    }
    if (endDate) {
      const parsedEndDate = new Date(endDate);
      if (Number.isNaN(parsedEndDate.getTime())) {
        throw new BadRequestException('Invalid endDate: must be a valid ISO 8601 date');
      }
      filters.endDate = parsedEndDate;
    }
    if (filters.startDate && filters.endDate && filters.startDate > filters.endDate) {
      throw new BadRequestException('startDate cannot be after endDate');
    }
    if (excludeTrashSpam !== undefined) filters.excludeTrashSpam = excludeTrashSpam === 'true';

    return this.emailsService.listEmails({
      tenantId,
      providerId,
      page: parsedPage,
      limit: parsedLimit,
      maxLimit: this.maxEmailListLimit,
      filters,
    });
  }

  /**
   * GET /emails/stats - Get email statistics
   */
  @Get('stats')
  async getStats(@Req() req: AuthenticatedRequest, @Query('providerId') providerId?: string) {
    const tenantId = req.user.tenantId;
    return this.emailsService.getStats(tenantId, providerId);
  }

  /**
   * GET /emails/search - Search emails
   */
  @Get('search')
  async searchEmails(
    @Req() req: AuthenticatedRequest,
    @Query('q') query: string,
    @Query('providerId') providerId?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user.tenantId;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestException('Invalid limit: must be a positive number');
    }
    if (parsedLimit > 100) {
      throw new BadRequestException('Limit cannot exceed 100');
    }
    const emails = await this.emailsService.searchEmails(
      tenantId,
      query,
      providerId,
      parsedLimit,
    );

    return { emails, limit: parsedLimit };
  }
}
