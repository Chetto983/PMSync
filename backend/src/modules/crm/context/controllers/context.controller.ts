import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { GetCrmContextByEmailQueryDto } from '../dto/context.dto';
import { ContextService } from '../services/context.service';

@ApiTags('CRM - Context')
@ApiCookieAuth()
@Controller('crm/context')
@UseGuards(TenantGuard, RolesGuard)
export class ContextController {
  constructor(private readonly contextService: ContextService) {}

  @Get('by-email')
  @ApiOperation({ summary: 'Resolve CRM context from an email address' })
  @ApiQuery({ name: 'email', required: true, description: 'Sender email to resolve' })
  @ApiResponse({ status: 200, description: 'CRM context resolved or null if no contact matches' })
  async getByEmail(@Req() req: any, @Query() query: GetCrmContextByEmailQueryDto) {
    return this.contextService.getByEmail(req.user.tenantId, query.email);
  }

  @Get(':contactId')
  @ApiOperation({ summary: 'Get aggregated CRM context for a contact' })
  @ApiResponse({ status: 200, description: 'CRM context returned successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async getByContactId(@Req() req: any, @Param('contactId') contactId: string) {
    return this.contextService.getByContactId(req.user.tenantId, contactId);
  }
}
