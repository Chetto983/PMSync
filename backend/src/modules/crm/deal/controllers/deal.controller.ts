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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { DealService } from '../services/deal.service';
import {
  CreateDealDto,
  UpdateDealDto,
  ListDealsQueryDto,
  LinkDealContactDto,
} from '../dto/deal.dto';

@ApiTags('CRM - Deals')
@ApiBearerAuth()
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
