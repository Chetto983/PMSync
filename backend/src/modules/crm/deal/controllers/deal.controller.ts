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
  ChangeStageDto,
  CreateActivityDto,
  ListActivitiesQueryDto,
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
