import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ContactsService,
  CreateContactDto,
  UpdateContactDto,
  ListContactsFilters,
} from '../services/contacts.service';
import { ContactsSyncQueueService } from '../services/contacts-sync-queue.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('contacts')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly contactsSyncQueue: ContactsSyncQueueService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * List contacts
   * GET /api/contacts
   */
  @Get()
  @SkipThrottle()
  async listContacts(
    @Req() req: any,
    @Query('providerId') providerId?: string,
    @Query('search') search?: string,
    @Query('company') company?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantId = req.user.tenantId;

    const filters: ListContactsFilters = {
      providerId,
      search,
      company,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    };

    return this.contactsService.listContacts(tenantId, filters);
  }

  /**
   * Get contact counts for sidebar display
   * GET /api/contacts/counts
   */
  @Get('counts')
  @SkipThrottle()
  async getContactCounts(@Req() req: any) {
    const tenantId = req.user.tenantId;
    return this.contactsService.getContactCounts(tenantId);
  }

  /**
   * Get a single contact
   * GET /api/contacts/:id
   */
  @Get(':id')
  @SkipThrottle()
  async getContact(@Req() req: any, @Param('id') contactId: string) {
    const tenantId = req.user.tenantId;
    return this.contactsService.getContact(tenantId, contactId);
  }

  /**
   * Create a new contact
   * POST /api/contacts
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createContact(@Req() req: any, @Body() data: CreateContactDto) {
    const tenantId = req.user.tenantId;
    return this.contactsService.createContact(tenantId, data);
  }

  /**
   * Update a contact
   * PATCH /api/contacts/:id
   */
  @Patch(':id')
  async updateContact(
    @Req() req: any,
    @Param('id') contactId: string,
    @Body() data: UpdateContactDto,
  ) {
    const tenantId = req.user.tenantId;
    return this.contactsService.updateContact(tenantId, contactId, data);
  }

  /**
   * Delete a contact
   * DELETE /api/contacts/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContact(@Req() req: any, @Param('id') contactId: string) {
    const tenantId = req.user.tenantId;
    await this.contactsService.deleteContact(tenantId, contactId);
  }

  /**
   * Create a local-only contact (no provider sync)
   * POST /api/contacts/local
   */
  @Post('local')
  @HttpCode(HttpStatus.CREATED)
  async createLocalContact(@Req() req: any, @Body() data: Omit<CreateContactDto, 'providerId'>) {
    const tenantId = req.user.tenantId;
    return this.contactsService.createLocalContact(tenantId, data);
  }

  /**
   * Extract contacts from emails and create local contacts
   * POST /api/contacts/extract-from-emails
   * Works for any provider, especially useful for generic IMAP
   */
  @Post('extract-from-emails')
  async extractContactsFromEmails(
    @Req() req: any,
    @Body() body: { providerId?: string; excludePublicDomains?: boolean },
  ) {
    const tenantId = req.user.tenantId;
    const result = await this.contactsService.extractContactsFromEmails(
      tenantId,
      body.providerId,
      body.excludePublicDomains ?? false, // Include all by default
    );
    return {
      success: true,
      ...result,
    };
  }

  /**
   * Import contacts from vCard (.vcf) file
   * POST /api/contacts/import/vcard
   * Supports vCard 3.0 and 4.0 formats (Outlook, Apple, Google exports)
   */
  @Post('import/vcard')
  @UseInterceptors(FileInterceptor('file'))
  async importFromVCard(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { content?: string },
  ) {
    const tenantId = req.user.tenantId;

    // Get vCard content from file or body
    let vcfContent: string;

    if (file) {
      // File uploaded
      vcfContent = file.buffer.toString('utf-8');
    } else if (body.content) {
      // Raw vCard content in body
      vcfContent = body.content;
    } else {
      throw new BadRequestException('No vCard file or content provided. Upload a .vcf file or provide content in body.');
    }

    const result = await this.contactsService.importFromVCard(tenantId, vcfContent);

    return {
      success: true,
      message: `Imported ${result.imported} contacts, skipped ${result.skipped}`,
      ...result,
    };
  }

  /**
   * Trigger manual sync for a provider's contacts
   * POST /api/contacts/sync/:providerId
   */
  @Post('sync/:providerId')
  async syncProvider(@Req() req: any, @Param('providerId') providerId: string) {
    const tenantId = req.user.tenantId;

    // ✅ SECURITY: Verify provider ownership before syncing
    const provider = await this.prisma.providerConfig.findUnique({
      where: { id: providerId },
      select: { tenantId: true },
    });

    if (!provider) {
      throw new ForbiddenException('Provider not found');
    }

    if (provider.tenantId !== tenantId) {
      throw new ForbiddenException('Access denied: You can only sync your own providers');
    }

    const synced = await this.contactsService.syncContacts(providerId);
    return {
      success: true,
      contactsSynced: synced,
    };
  }

  /**
   * Trigger bulk sync for all contact-enabled providers (queued via BullMQ)
   * POST /api/contacts/sync-all
   *
   * ✅ TENANT ISOLATED: Only queues jobs for the authenticated user's providers
   */
  @Post('sync-all')
  async syncAllProviders(@Req() req: any) {
    const tenantId = req.user.tenantId;

    // Get all contact-enabled providers for this tenant
    const providers = await this.prisma.providerConfig.findMany({
      where: {
        tenantId,
        isActive: true,
        supportsContacts: true,
      },
      select: {
        id: true,
        email: true,
        providerType: true,
      },
    });

    if (providers.length === 0) {
      return {
        success: false,
        message: 'No contact-enabled providers found',
        queued: 0,
      };
    }

    // Queue sync jobs for all providers
    const jobs = providers.map((provider) => ({
      tenantId,
      providerId: provider.id,
      providerType: provider.providerType as 'google' | 'microsoft',
      email: provider.email,
      priority: 'normal' as const,
    }));

    await this.contactsSyncQueue.addBulkSyncJobs(jobs);

    return {
      success: true,
      message: `Queued ${providers.length} contact sync job(s). Contacts will be synced in the background.`,
      queued: providers.length,
      providers: providers.map((p) => ({ id: p.id, email: p.email, type: p.providerType })),
    };
  }
}
