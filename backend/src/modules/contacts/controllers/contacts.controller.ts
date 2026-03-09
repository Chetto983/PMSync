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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import { ContactsService } from '../services/contacts.service';
import { ContactsSyncQueueService } from '../services/contacts-sync-queue.service';
import { RelationshipScoreService } from '../services/relationship-score.service';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CreateContactDto,
  UpdateContactDto,
  ListContactsQueryDto,
  CreateLocalContactDto,
  ExtractContactsDto,
  VCardImportBodyDto,
  LookupContactsByEmailsDto,
} from '../dto/contact.dto';

@ApiTags('Contacts')
@ApiBearerAuth()
@Controller('contacts')
@UseGuards(TenantGuard, RolesGuard)
export class ContactsController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly contactsSyncQueue: ContactsSyncQueueService,
    private readonly relationshipScoreService: RelationshipScoreService,
    private readonly prisma: PrismaService,
  ) { }

  /**
   * List contacts
   * GET /api/contacts
   */
  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'List contacts', description: 'Returns contacts with pagination and filters' })
  @ApiResponse({ status: 200, description: 'Contacts returned successfully' })
  async listContacts(@Req() req: any, @Query() query: ListContactsQueryDto) {
    const tenantId = req.user.tenantId;

    return this.contactsService.listContacts(tenantId, {
      providerId: query.providerId,
      search: query.search,
      company: query.company,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * Get relationship scores for contacts (CRM intelligence)
   * GET /api/contacts/relationship-scores
   */
  @Get('relationship-scores')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get relationship scores for contacts' })
  @ApiResponse({ status: 200, description: 'Relationship scores returned successfully' })
  async getRelationshipScores(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
  ) {
    const tenantId = req.user.tenantId;
    const scores = await this.relationshipScoreService.getRelationshipScores(
      tenantId,
      { limit: limit ? parseInt(limit, 10) : 20, minScore: minScore ? parseInt(minScore, 10) : 0 },
    );
    return { success: true, scores, total: scores.length };
  }

  /**
   * Get stale contacts that need re-engagement
   * GET /api/contacts/stale
   */
  @Get('stale')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get stale contacts that need re-engagement' })
  @ApiResponse({ status: 200, description: 'Stale contacts returned successfully' })
  async getStaleContacts(
    @Req() req: any,
    @Query('daysSince') daysSince?: string,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user.tenantId;
    const contacts = await this.relationshipScoreService.getStaleContacts(
      tenantId,
      { daysSince: daysSince ? parseInt(daysSince, 10) : 30, limit: limit ? parseInt(limit, 10) : 10 },
    );
    return { success: true, contacts, total: contacts.length };
  }

  /**
   * Get contact counts for sidebar display
   * GET /api/contacts/counts
   */
  @Get('counts')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get contact counts', description: 'Returns contact counts for sidebar' })
  @ApiResponse({ status: 200, description: 'Counts returned successfully' })
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
  @ApiOperation({ summary: 'Get contact by ID', description: 'Returns a single contact' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiResponse({ status: 200, description: 'Contact returned successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async getContact(@Req() req: any, @Param('id') contactId: string) {
    const tenantId = req.user.tenantId;
    return this.contactsService.getContact(tenantId, contactId);
  }

  /**
   * Get interaction history for a contact
   * GET /api/contacts/:id/history
   */
  @Get(':id/history')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get interaction history', description: 'Returns interaction history for a contact' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiResponse({ status: 200, description: 'History returned successfully' })
  async getContactHistory(@Req() req: any, @Param('id') contactId: string, @Query('limit') limit?: number) {
    const tenantId = req.user.tenantId;
    const parsedLimit = limit ? parseInt(String(limit), 10) : 50;
    // Stub: ContactInteraction model removed (dead code)
    return { interactions: [], total: 0, message: 'Contact interaction history not yet implemented' };
  }

  /**
   * Get contact photo
   * GET /api/contacts/:id/photo
   *
   * Fetches the contact photo from the provider (Google/Microsoft).
   * Returns the photo URL (Google) or base64 data URL (Microsoft).
   *
   * @see https://learn.microsoft.com/en-us/graph/api/profilephoto-get
   */
  @Get(':id/photo')
  @SkipThrottle()
  @ApiOperation({ summary: 'Get contact photo', description: 'Returns contact photo URL or base64 data' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiResponse({ status: 200, description: 'Photo returned successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found or no photo' })
  async getContactPhoto(@Req() req: any, @Param('id') contactId: string) {
    const tenantId = req.user.tenantId;
    const photoUrl = await this.contactsService.getContactPhoto(tenantId, contactId);

    return { photoUrl };
  }

  /**
   * Batch lookup contacts by email addresses
   * POST /api/contacts/lookup-by-emails
   *
   * Used for populating sender photos in email list.
   * Returns a map of email address -> { contactId, photoUrl, displayName }
   */
  @Post('lookup-by-emails')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  @ApiOperation({
    summary: 'Lookup contacts by emails',
    description: 'Batch lookup contacts by email addresses for sender photos',
  })
  @ApiBody({ type: LookupContactsByEmailsDto })
  @ApiResponse({ status: 200, description: 'Contact lookup results' })
  async lookupContactsByEmails(@Req() req: any, @Body() data: LookupContactsByEmailsDto) {
    const tenantId = req.user.tenantId;
    return this.contactsService.findContactsByEmails(tenantId, data.emails);
  }

  /**
   * Create a new contact
   * POST /api/contacts
   */
  @Post()
  @Roles('admin', 'super-admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create contact', description: 'Creates a new contact' })
  @ApiBody({ type: CreateContactDto })
  @ApiResponse({ status: 201, description: 'Contact created successfully' })
  async createContact(@Req() req: any, @Body() data: CreateContactDto) {
    const tenantId = req.user.tenantId;
    return this.contactsService.createContact(tenantId, data);
  }

  /**
   * Update a contact
   * PATCH /api/contacts/:id
   */
  @Patch(':id')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Update contact', description: 'Updates an existing contact' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiBody({ type: UpdateContactDto })
  @ApiResponse({ status: 200, description: 'Contact updated successfully' })
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
  @Roles('admin', 'super-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete contact', description: 'Deletes a contact' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiResponse({ status: 204, description: 'Contact deleted successfully' })
  async deleteContact(@Req() req: any, @Param('id') contactId: string) {
    const tenantId = req.user.tenantId;
    await this.contactsService.deleteContact(tenantId, contactId);
  }

  /**
   * Toggle VIP status for a contact
   * POST /api/contacts/:id/vip
   */
  @Post(':id/vip')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Toggle VIP status', description: 'Toggles VIP status for a contact' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiResponse({ status: 200, description: 'VIP status toggled successfully' })
  async toggleVip(@Req() req: any, @Param('id') contactId: string) {
    const tenantId = req.user.tenantId;
    return this.contactsService.toggleVip(tenantId, contactId);
  }

  /**
   * List VIP contacts
   * GET /api/contacts/vip
   */
  @Get('vip/list')
  @SkipThrottle()
  @ApiOperation({ summary: 'List VIP contacts', description: 'Returns all VIP contacts' })
  @ApiResponse({ status: 200, description: 'VIP contacts returned successfully' })
  async listVipContacts(@Req() req: any) {
    const tenantId = req.user.tenantId;
    return this.contactsService.listVipContacts(tenantId);
  }

  /**
   * Create a local-only contact (no provider sync)
   * POST /api/contacts/local
   */
  @Post('local')
  @Roles('admin', 'super-admin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create local contact', description: 'Creates a local-only contact (no provider sync)' })
  @ApiBody({ type: CreateLocalContactDto })
  @ApiResponse({ status: 201, description: 'Local contact created successfully' })
  async createLocalContact(@Req() req: any, @Body() data: CreateLocalContactDto) {
    const tenantId = req.user.tenantId;
    return this.contactsService.createLocalContact(tenantId, data);
  }

  /**
   * Extract contacts from emails and create local contacts
   * POST /api/contacts/extract-from-emails
   * Works for any provider, especially useful for generic IMAP
   */
  @Post('extract-from-emails')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Extract contacts from emails', description: 'Extracts contacts from email headers' })
  @ApiBody({ type: ExtractContactsDto })
  @ApiResponse({ status: 200, description: 'Contacts extracted successfully' })
  async extractContactsFromEmails(@Req() req: any, @Body() body: ExtractContactsDto) {
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
  @Roles('admin', 'super-admin')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
      },
      fileFilter: (_req, file, cb) => {
        // Validate file type
        const allowedMimes = ['text/vcard', 'text/x-vcard', 'text/directory', 'application/octet-stream'];
        const allowedExtensions = ['.vcf', '.vcard'];
        const hasValidExt = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
        const hasValidMime = allowedMimes.includes(file.mimetype);

        if (hasValidExt || hasValidMime) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Only .vcf (vCard) files are allowed'), false);
        }
      },
    }),
  )
  @ApiOperation({ summary: 'Import contacts from vCard', description: 'Imports contacts from .vcf file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 200, description: 'Contacts imported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid vCard format' })
  async importFromVCard(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: VCardImportBodyDto,
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
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Sync provider contacts', description: 'Triggers manual sync for a provider' })
  @ApiParam({ name: 'providerId', description: 'Provider ID' })
  @ApiResponse({ status: 200, description: 'Sync started successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
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
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Sync all providers', description: 'Queues sync jobs for all contact-enabled providers' })
  @ApiResponse({ status: 200, description: 'Sync jobs queued successfully' })
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
