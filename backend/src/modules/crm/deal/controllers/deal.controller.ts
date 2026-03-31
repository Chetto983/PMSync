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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { DealService } from '../services/deal.service';
import {
  CreateDealDto,
  UpdateDealDto,
  ListDealsQueryDto,
  LinkDealContactDto,
  LinkDealProductDto,
  ChangeStageDto,
  CreateActivityDto,
  ListActivitiesQueryDto,
  CreateNoteDto,
  UpdateNoteDto,
} from '../dto/deal.dto';

@ApiTags('CRM - Deals')
@ApiCookieAuth()
@Controller('crm/deals')
@UseGuards(TenantGuard, RolesGuard)
export class DealController {
  constructor(private readonly dealService: DealService) {}

  @Get()
  @ApiOperation({ summary: 'List deals with filters' })
  @ApiResponse({ status: 200, description: 'Deals returned successfully' })
  async list(@Req() req: any, @Query() query: ListDealsQueryDto) {
    return this.dealService.list(req.user.tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get deal by ID' })
  @ApiResponse({ status: 200, description: 'Deal returned' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  async findById(@Req() req: any, @Param('id') id: string) {
    return this.dealService.findById(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create deal' })
  @ApiResponse({ status: 201, description: 'Deal created' })
  async create(@Req() req: any, @Body() dto: CreateDealDto) {
    return this.dealService.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update deal' })
  @ApiResponse({ status: 200, description: 'Deal updated' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateDealDto,
  ) {
    return this.dealService.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete deal (soft)' })
  @ApiResponse({ status: 200, description: 'Deal soft-deleted' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.dealService.delete(req.user.tenantId, id);
  }

  // ---- Stage Transition ----

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Move deal to a different stage (same pipeline)' })
  @ApiResponse({ status: 200, description: 'Deal stage updated' })
  @ApiResponse({ status: 400, description: 'Stage does not belong to pipeline' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  async changeStage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ChangeStageDto,
  ) {
    const result = await this.dealService.changeStage(req.user.tenantId, id, dto);
    // If no stage change occurred, result is the deal directly
    if ('deal' in result) {
      return result.deal;
    }
    return result;
  }

  // ---- Activities ----

  @Get(':id/activities')
  @ApiOperation({ summary: 'List activities for a deal' })
  @ApiResponse({ status: 200, description: 'Activities returned' })
  async listActivities(
    @Req() req: any,
    @Param('id') id: string,
    @Query() query: ListActivitiesQueryDto,
  ) {
    return this.dealService.listActivities(req.user.tenantId, id, query);
  }

  @Post(':id/activities')
  @ApiOperation({ summary: 'Create activity for a deal' })
  @ApiResponse({ status: 201, description: 'Activity created' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  async createActivity(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.dealService.createActivity(req.user.tenantId, id, dto);
  }

  // ---- Notes ----

  @Get(':id/notes')
  @ApiOperation({ summary: 'List notes for a deal' })
  @ApiResponse({ status: 200, description: 'Notes returned' })
  async listNotes(@Req() req: any, @Param('id') id: string) {
    return this.dealService.listNotes(req.user.tenantId, id);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Create note for a deal' })
  @ApiResponse({ status: 201, description: 'Note created' })
  async createNote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.dealService.createNote(req.user.tenantId, id, dto);
  }

  @Patch(':id/notes/:noteId')
  @ApiOperation({ summary: 'Update a note' })
  @ApiResponse({ status: 200, description: 'Note updated' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  async updateNote(
    @Req() req: any,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.dealService.updateNote(req.user.tenantId, noteId, dto);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a note' })
  @ApiResponse({ status: 200, description: 'Note deleted' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  async deleteNote(
    @Req() req: any,
    @Param('noteId') noteId: string,
  ) {
    return this.dealService.deleteNote(req.user.tenantId, noteId);
  }

  // ---- Deal-Product associations ----

  @Get(':id/products')
  @ApiOperation({ summary: 'List products linked to deal' })
  @ApiResponse({ status: 200, description: 'Linked products returned' })
  async getProducts(@Req() req: any, @Param('id') id: string) {
    return this.dealService.getProducts(req.user.tenantId, id);
  }

  @Post(':id/products')
  @ApiOperation({ summary: 'Link product to deal' })
  @ApiResponse({ status: 201, description: 'Product linked' })
  @ApiResponse({ status: 409, description: 'Product already linked' })
  async linkProduct(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: LinkDealProductDto,
  ) {
    return this.dealService.linkProduct(req.user.tenantId, id, dto);
  }

  @Delete(':id/products/:linkId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink product from deal' })
  @ApiResponse({ status: 200, description: 'Product unlinked' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  async unlinkProduct(
    @Req() req: any,
    @Param('id') id: string,
    @Param('linkId') linkId: string,
  ) {
    return this.dealService.unlinkProduct(req.user.tenantId, id, linkId);
  }

  // ---- Deal-Contact associations ----

  @Get(':id/contacts')
  @ApiOperation({ summary: 'List contacts linked to deal' })
  @ApiResponse({ status: 200, description: 'Linked contacts returned' })
  async getContacts(@Req() req: any, @Param('id') id: string) {
    return this.dealService.getContacts(req.user.tenantId, id);
  }

  @Post(':id/contacts')
  @ApiOperation({ summary: 'Link contact to deal' })
  @ApiResponse({ status: 201, description: 'Contact linked' })
  @ApiResponse({ status: 409, description: 'Contact already linked' })
  async linkContact(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: LinkDealContactDto,
  ) {
    return this.dealService.linkContact(req.user.tenantId, id, dto);
  }

  @Delete(':dealId/contacts/:contactId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlink contact from deal' })
  @ApiResponse({ status: 200, description: 'Contact unlinked' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  async unlinkContact(
    @Req() req: any,
    @Param('dealId') dealId: string,
    @Param('contactId') contactId: string,
  ) {
    return this.dealService.unlinkContact(req.user.tenantId, dealId, contactId);
  }
}
