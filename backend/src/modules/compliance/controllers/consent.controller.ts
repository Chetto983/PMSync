import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { ConsentService } from '../services/consent.service';
import { ConsentHistoryDto, ConsentStateDto, UpdateConsentDto } from '../dto/consent.dto';
import { SkipLegalCheck } from '../decorators/skip-legal-check.decorator';

/**
 * REST API for user consent management (CONSENT-01)
 *
 * Endpoints:
 * - GET  /compliance/consent         - View current consent state
 * - POST /compliance/consent         - Update consent for a feature
 * - GET  /compliance/consent/history  - View consent change history
 *
 * @SkipLegalCheck: Consent management must remain accessible before legal acceptance.
 */
@ApiTags('Compliance')
@ApiBearerAuth()
@SkipLegalCheck()
@Controller('compliance/consent')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('admin')
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  /**
   * Get current consent state for all features
   */
  @Get()
  @ApiOperation({ summary: 'Get current consent state for all features' })
  @ApiOkResponse({ type: [ConsentStateDto], description: 'List of consent states per feature' })
  getCurrentConsents(@Request() req: AuthenticatedRequest): Promise<ConsentStateDto[]> {
    const userId = req.user.userId ?? req.user.id;
    return this.consentService.getCurrentConsents(userId, req.user.tenantId);
  }

  /**
   * Update consent for a specific feature
   */
  @Post()
  @ApiOperation({ summary: 'Update consent for a specific feature' })
  @ApiOkResponse({ type: ConsentStateDto, description: 'Updated consent state' })
  updateConsent(
    @Request() req: AuthenticatedRequest,
    @Body() dto: UpdateConsentDto,
  ): Promise<ConsentStateDto> {
    const userId = req.user.userId ?? req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.consentService.updateConsent(
      userId,
      req.user.tenantId,
      dto.feature,
      dto.granted,
      ipAddress,
      userAgent,
    );
  }

  /**
   * Get consent change history, optionally filtered by feature
   */
  @Get('history')
  @ApiOperation({ summary: 'Get consent change history' })
  @ApiQuery({ name: 'feature', required: false, description: 'Filter by feature ID' })
  @ApiOkResponse({ type: [ConsentHistoryDto], description: 'List of consent change records' })
  getConsentHistory(
    @Request() req: AuthenticatedRequest,
    @Query('feature') feature?: string,
  ): Promise<ConsentHistoryDto[]> {
    const userId = req.user.userId ?? req.user.id;
    return this.consentService.getConsentHistory(userId, req.user.tenantId, feature);
  }
}
