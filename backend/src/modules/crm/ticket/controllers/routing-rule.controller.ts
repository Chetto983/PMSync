import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { RoutingRuleService } from '../services/routing-rule.service';
import { CreateRoutingRuleDto, UpdateRoutingRuleDto } from '../dto/routing-rule.dto';

@ApiTags('CRM - Routing Rules')
@ApiBearerAuth()
@Controller('crm/routing-rules')
@UseGuards(TenantGuard, RolesGuard)
export class RoutingRuleController {
  constructor(private readonly routingRuleService: RoutingRuleService) {}

  @Get()
  @ApiOperation({ summary: 'List routing rules' })
  @ApiResponse({ status: 200, description: 'Rules returned' })
  async list(@Req() req: any) {
    return this.routingRuleService.list(req.user.tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create routing rule' })
  @ApiResponse({ status: 201, description: 'Rule created' })
  async create(@Req() req: any, @Body() dto: CreateRoutingRuleDto) {
    return this.routingRuleService.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update routing rule' })
  @ApiResponse({ status: 200, description: 'Rule updated' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateRoutingRuleDto,
  ) {
    return this.routingRuleService.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete routing rule' })
  @ApiResponse({ status: 200, description: 'Rule deleted' })
  @ApiResponse({ status: 404, description: 'Rule not found' })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.routingRuleService.remove(req.user.tenantId, id);
  }
}
