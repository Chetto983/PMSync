import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { GetCrmContextByEmailQueryDto, GetActivityTimelineQueryDto, GetActivityTimelineParamsDto } from '../dto/context.dto';
import { ContextService } from '../services/context.service';

@ApiTags('CRM - Context')
@ApiCookieAuth()
@Controller('crm')
@UseGuards(TenantGuard, RolesGuard)
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  @Get('context/by-email')
  @ApiOperation({ summary: 'Resolve CRM context from an email address' })
  @ApiQuery({ name: 'email', required: true, description: 'Sender email to resolve' })
  @ApiResponse({ status: 200, description: 'CRM context resolved or null if no contact matches' })
  async getByEmail(@Req() req: any, @Query() query: GetCrmContextByEmailQueryDto) {
    return this.contextService.getByEmail(req.user.tenantId, query.email);
  }

  @Get('context/:contactId')
  @ApiOperation({ summary: 'Get aggregated CRM context for a contact' })
  @ApiResponse({ status: 200, description: 'CRM context returned successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async getByContactId(@Req() req: any, @Param('contactId') contactId: string) {
    return this.contextService.getByContactId(req.user.tenantId, contactId);
  }

  @Get('activities/:entityType/:entityId')
  @ApiOperation({ summary: 'Get paginated activity timeline for an entity' })
  @ApiParam({ name: 'entityType', enum: ['account', 'deal'] })
  @ApiParam({ name: 'entityId', description: 'Account or Deal ID' })
  @ApiResponse({ status: 200, description: 'Paginated activities returned' })
  async getActivityTimeline(
    @Req() req: any,
    @Param() params: GetActivityTimelineParamsDto,
    @Query() query: GetActivityTimelineQueryDto,
  ) {
    return this.contextService.getActivityTimeline(
      req.user.tenantId,
      params.entityType,
      params.entityId,
      query.cursor,
      query.limit,
    );
  }
}
