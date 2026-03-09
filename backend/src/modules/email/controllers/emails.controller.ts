/**
 * EmailsController - Core email read endpoints (facade)
 *
 * After Phase 43 split, this controller retains:
 * - GET /emails/conversations
 * - GET /emails/thread/:threadId
 * - GET /emails/:id
 *
 * Query endpoints moved to EmailQueryController.
 * Calendar invite endpoints moved to EmailCalendarInviteController.
 * Action/mutation endpoints moved to EmailActionsController.
 */
import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { EmailsService } from '../services/emails.service';
import { EmailFetchService } from '../services/email-fetch.service';
import { AuthenticatedRequest } from '../../../common/types/request.types';

@ApiTags('Emails')
@ApiBearerAuth()
@Controller('emails')
@UseGuards(TenantGuard, RolesGuard)
export class EmailsController {
  private readonly maxEmailListLimit: number;
  private readonly logger = new Logger(EmailsController.name);

  constructor(
    private emailsService: EmailsService,
    private fetchService: EmailFetchService,
    private configService: ConfigService,
  ) {
    this.maxEmailListLimit = this.configService.get<number>('EMAIL_LIST_MAX_LIMIT') || 1000;
  }

  /**
   * GET /emails/conversations - Get conversation view (threaded emails)
   */
  @Get('conversations')
  async getConversations(
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('providerId') providerId?: string,
    @Query('folder') folder?: string,
  ) {
    const tenantId = req.user.tenantId;
    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    if (Number.isNaN(parsedPage) || Number.isNaN(parsedLimit)) {
      throw new BadRequestException('Invalid pagination parameters: page and limit must be numbers');
    }
    if (parsedPage < 1) {
      throw new BadRequestException('Page must be at least 1');
    }
    if (parsedLimit < 1) {
      throw new BadRequestException('Limit must be at least 1');
    }
    if (parsedLimit > this.maxEmailListLimit) {
      throw new BadRequestException(`Limit cannot exceed ${this.maxEmailListLimit}`);
    }
    return this.emailsService.getConversations({
      tenantId,
      providerId,
      folder,
      page: parsedPage,
      limit: parsedLimit,
    });
  }

  /**
   * GET /emails/thread/:threadId - Get all emails in a thread
   */
  @Get('thread/:threadId')
  async getThread(@Req() req: AuthenticatedRequest, @Param('threadId') threadId: string) {
    const tenantId = req.user.tenantId;
    const emails = await this.emailsService.getThread(threadId, tenantId, true);

    const emailsMissingBody = emails.filter((email) => !email.isBodyFetched);
    if (emailsMissingBody.length === 0) {
      return emails;
    }

    this.logger.debug(`Lazy loading body for ${emailsMissingBody.length}/${emails.length} emails in thread`);

    const fetchedEmails = await Promise.all(
      emailsMissingBody.map(async (email) => {
        try {
          return await this.fetchService.fetchArchivedEmail(email.id, tenantId);
        } catch (error) {
          this.logger.warn(
            `Failed to fetch missing body for thread email ${email.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return email;
        }
      }),
    );

    const fetchedMap = new Map(fetchedEmails.map((email) => [email.id, email]));
    return emails.map((email) => fetchedMap.get(email.id) ?? email);
  }

  /**
   * GET /emails/:id - Get email by ID
   */
  @Get(':id')
  async getEmail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const tenantId = req.user.tenantId;
    const email = await this.emailsService.getEmailById(id, tenantId, true);

    if (!email.bodyHtml && !email.bodyText) {
      try {
        return await this.fetchService.fetchArchivedEmail(id, tenantId);
      } catch (error) {
        this.logger.warn(
          `Failed to fetch missing body for email ${id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return email;
  }
}
