import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { LegalAcceptanceService } from '../services/legal-acceptance.service';
import { AcceptLegalDocumentDto, LegalStatusDto } from '../dto/legal-acceptance.dto';
import { SkipLegalCheck } from '../decorators/skip-legal-check.decorator';

/**
 * REST API for legal document acceptance (LEGAL-01, LEGAL-02)
 *
 * Endpoints:
 * - GET  /compliance/legal/status  - Check current acceptance status
 * - POST /compliance/legal/accept  - Accept a legal document
 *
 * @SkipLegalCheck: User must be able to check status and accept documents
 * even when they haven't accepted yet.
 */
@ApiTags('Compliance')
@ApiBearerAuth()
@SkipLegalCheck()
@Controller('compliance/legal')
@UseGuards(TenantGuard, RolesGuard)
export class LegalController {
  constructor(private readonly legalAcceptanceService: LegalAcceptanceService) {}

  /**
   * Get current legal acceptance status for the authenticated user.
   * Returns acceptance state for ToS and Privacy Policy.
   */
  @Get('status')
  @ApiOperation({ summary: 'Get legal document acceptance status' })
  @ApiOkResponse({ type: LegalStatusDto, description: 'Current acceptance status' })
  getStatus(@Request() req: AuthenticatedRequest): Promise<LegalStatusDto> {
    const userId = req.user.userId ?? req.user.id;
    return this.legalAcceptanceService.getStatus(userId, req.user.tenantId);
  }

  /**
   * Accept a legal document (ToS or Privacy Policy).
   * Records acceptance with IP address and user agent for legal evidence.
   */
  @Post('accept')
  @ApiOperation({ summary: 'Accept a legal document' })
  @ApiOkResponse({ description: 'Acceptance recorded successfully' })
  async acceptDocument(
    @Request() req: AuthenticatedRequest,
    @Body() dto: AcceptLegalDocumentDto,
  ) {
    const userId = req.user.userId ?? req.user.id;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    return this.legalAcceptanceService.accept(
      userId,
      req.user.tenantId,
      dto.documentType,
      dto.documentVersion,
      ipAddress,
      userAgent,
    );
  }
}
