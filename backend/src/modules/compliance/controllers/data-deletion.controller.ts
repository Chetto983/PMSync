import { Controller, Delete, Get, Post, Request, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { AccountDeletionService } from '../services/account-deletion.service';
import { DeletionResponseDto, DeletionStatusDto } from '../dto/data-deletion.dto';

/**
 * REST API for account deletion (GDPR Article 17 - Right to Erasure)
 *
 * DATA-02, DATA-03: Account deletion with 30-day grace period.
 *
 * Endpoints:
 * - POST   /compliance/data-deletion         - Request account deletion
 * - GET    /compliance/data-deletion/status   - Check deletion status
 * - DELETE /compliance/data-deletion/cancel   - Cancel pending deletion
 */
@ApiTags('Compliance')
@ApiBearerAuth()
@Controller('compliance/data-deletion')
@UseGuards(JwtAuthGuard, TenantGuard)
export class DataDeletionController {
  constructor(private readonly accountDeletionService: AccountDeletionService) {}

  /**
   * Request account deletion.
   *
   * Soft-deletes the user (deactivates + invalidates sessions).
   * User has 30 days to cancel before hard-delete occurs.
   */
  @Post()
  @ApiOperation({ summary: 'Request account deletion (30-day grace period)' })
  @ApiOkResponse({ type: DeletionResponseDto, description: 'Deletion scheduled' })
  async requestDeletion(
    @Request() req: AuthenticatedRequest,
  ): Promise<DeletionResponseDto> {
    const userId = req.user.userId ?? req.user.id;
    return this.accountDeletionService.requestDeletion(userId, req.user.tenantId);
  }

  /**
   * Get deletion status for the authenticated user.
   */
  @Get('status')
  @ApiOperation({ summary: 'Check account deletion status' })
  @ApiOkResponse({ type: DeletionStatusDto, description: 'Current deletion status' })
  async getDeletionStatus(
    @Request() req: AuthenticatedRequest,
  ): Promise<DeletionStatusDto> {
    const userId = req.user.userId ?? req.user.id;
    return this.accountDeletionService.getDeletionStatus(userId);
  }

  /**
   * Cancel a pending deletion request.
   *
   * Reactivates the user account. Only works within 30-day grace period.
   */
  @Delete('cancel')
  @ApiOperation({ summary: 'Cancel pending account deletion' })
  @ApiOkResponse({ type: DeletionResponseDto, description: 'Deletion cancelled' })
  @ApiResponse({ status: 400, description: 'No pending deletion request' })
  @ApiResponse({ status: 410, description: 'Grace period expired' })
  async cancelDeletion(
    @Request() req: AuthenticatedRequest,
  ): Promise<DeletionResponseDto> {
    const userId = req.user.userId ?? req.user.id;
    return this.accountDeletionService.cancelDeletion(userId, req.user.tenantId);
  }
}
