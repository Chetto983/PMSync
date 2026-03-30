import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { GovernanceService } from './governance.service';
import { GovernanceQueryDto } from './dto/governance.dto';

@ApiTags('CRM - AI Governance')
@ApiBearerAuth()
@Controller('crm/governance')
@UseGuards(TenantGuard, RolesGuard)
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get AI governance overview KPIs' })
  @ApiResponse({ status: 200, description: 'Overview KPIs returned' })
  async getOverview(@Req() req: any) {
    return this.governanceService.getOverview(req.user.tenantId);
  }

  @Get('accuracy')
  @ApiOperation({ summary: 'Get accuracy metrics per model over time' })
  @ApiResponse({ status: 200, description: 'Accuracy data points returned' })
  async getAccuracy(
    @Req() req: any,
    @Query() query: GovernanceQueryDto,
  ) {
    return this.governanceService.getAccuracyMetrics(
      req.user.tenantId,
      query.range!,
    );
  }

  @Get('costs')
  @ApiOperation({ summary: 'Get AI cost breakdown by feature type' })
  @ApiResponse({ status: 200, description: 'Cost breakdown returned' })
  async getCostBreakdown(
    @Req() req: any,
    @Query() query: GovernanceQueryDto,
  ) {
    return this.governanceService.getCostBreakdown(
      req.user.tenantId,
      query.range!,
    );
  }
}
