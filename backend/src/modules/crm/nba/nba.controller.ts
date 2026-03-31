import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { NBAService } from './nba.service';
import { UpdateNBAStatusDto } from './dto/nba.dto';

@ApiTags('CRM - Next Best Action')
@ApiCookieAuth()
@Controller('crm/nba')
@UseGuards(TenantGuard, RolesGuard)
export class NBAController {
  constructor(private readonly nbaService: NBAService) {}

  @Get(':dealId')
  @ApiOperation({
    summary: 'Get top recommended actions for a deal',
  })
  @ApiResponse({ status: 200, description: 'Recommended actions returned' })
  @ApiResponse({ status: 404, description: 'Deal not found' })
  async getRecommendations(
    @Req() req: any,
    @Param('dealId') dealId: string,
  ) {
    return this.nbaService.getRecommendations(req.user.tenantId, dealId);
  }

  @Patch(':actionId/status')
  @ApiOperation({
    summary: 'Update NBA action status (accept, dismiss, execute)',
  })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 404, description: 'Action not found' })
  async updateStatus(
    @Req() req: any,
    @Param('actionId') actionId: string,
    @Body() dto: UpdateNBAStatusDto,
  ) {
    return this.nbaService.updateStatus(
      req.user.tenantId,
      actionId,
      dto.status,
    );
  }

  @Get('effectiveness/stats')
  @ApiOperation({
    summary: 'Get NBA effectiveness statistics by action type',
  })
  @ApiResponse({ status: 200, description: 'Effectiveness stats returned' })
  async getEffectiveness(@Req() req: any) {
    return this.nbaService.getEffectiveness(req.user.tenantId);
  }
}
