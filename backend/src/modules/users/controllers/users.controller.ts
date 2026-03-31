import { Controller, Get, Put, Delete, Body, UseGuards, Request, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { UpdatePreferencesDto } from '../dtos/update-preferences.dto';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';

/**
 * UsersController — Self-service user profile endpoints only.
 *
 * SECURITY NOTE (TSEC-04): This controller has RolesGuard in the guard chain
 * but intentionally has NO @Roles decorator. All endpoints operate exclusively
 * on the authenticated user's own data via req.user.userId (/users/me/*).
 * There are no admin-management endpoints (no user listing, no bulk ops).
 * If admin user-management endpoints are added in the future, they MUST
 * have @Roles('admin') applied.
 */
@ApiTags('Users')
@Controller('users')
@UseGuards(TenantGuard, RolesGuard)
@ApiCookieAuth()
export class UsersController {
  constructor(private usersService: UsersService) { }

  /**
   * Get current user profile
   * GET /users/me
   */
  @Get('me')
  async getMyProfile(@Request() req: AuthenticatedRequest) {
    return this.usersService.getUserProfile(req.user.userId);
  }

  /**
   * Update user profile
   * PUT /users/me
   */
  @Put('me')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update user profile (name, avatar)' })
  async updateMyProfile(@Request() req: AuthenticatedRequest, @Body() body: { firstName?: string; lastName?: string; avatarUrl?: string }) {
    return this.usersService.updateUserProfile(req.user.userId, body);
  }

  /**
   * Upload/update user avatar
   * PUT /users/me/avatar
   * Accepts base64 data URL in body
   */
  @Put('me/avatar')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Upload user avatar (base64 data URL)' })
  @ApiResponse({ status: 200, description: 'Avatar updated successfully' })
  async updateMyAvatar(@Request() req: AuthenticatedRequest, @Body() body: { avatarUrl: string }) {
    return this.usersService.updateUserAvatar(req.user.userId, body.avatarUrl);
  }

  /**
   * Delete user avatar
   * DELETE /users/me/avatar
   */
  @Delete('me/avatar')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Delete user avatar' })
  @ApiResponse({ status: 200, description: 'Avatar deleted successfully' })
  async deleteMyAvatar(@Request() req: AuthenticatedRequest) {
    return this.usersService.deleteUserAvatar(req.user.userId);
  }

  /**
   * Delete account (GDPR)
   * DELETE /users/me
   */
  @Delete('me')
  @RateTierDecorator('destructive-write')
  async deleteMyAccount(@Request() req: AuthenticatedRequest) {
    return this.usersService.deleteUserAccount(req.user.userId);
  }

  /**
   * Get user preferences
   * GET /users/me/preferences
   */
  @Get('me/preferences')
  @ApiOperation({ summary: 'Get user preferences' })
  @ApiResponse({ status: 200, description: 'Returns user preferences' })
  async getMyPreferences(@Request() req: AuthenticatedRequest) {
    return this.usersService.getUserPreferences(req.user.tenantId, req.user.userId);
  }

  /**
   * Update user preferences
   * PATCH /users/me/preferences
   */
  @Patch('me/preferences')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update user preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updateMyPreferences(
    @Request() req: AuthenticatedRequest,
    @Body() body: UpdatePreferencesDto,
  ) {
    return this.usersService.updateUserPreferences(req.user.tenantId, req.user.userId, body);
  }

  /**
   * Delete AI memories for the current user.
   * DELETE /users/me/ai-memory
   */
  @Delete('me/ai-memory')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Clear user AI memory' })
  @ApiResponse({ status: 200, description: 'AI memory deleted successfully' })
  async clearMyAiMemory(@Request() req: AuthenticatedRequest) {
    return this.usersService.clearUserAiMemory(
      req.user.tenantId,
      req.user.userId,
    );
  }

  /**
   * Get dashboard preferences
   * GET /users/me/dashboard-preferences
   */
  @Get('me/dashboard-preferences')
  @ApiOperation({ summary: 'Get dashboard layout preferences' })
  @ApiResponse({ status: 200, description: 'Returns dashboard preferences' })
  async getMyDashboardPreferences(@Request() req: AuthenticatedRequest) {
    return this.usersService.getDashboardPreferences(req.user.tenantId, req.user.userId);
  }

  /**
   * Update dashboard preferences
   * PUT /users/me/dashboard-preferences
   */
  @Put('me/dashboard-preferences')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update dashboard layout preferences' })
  @ApiResponse({ status: 200, description: 'Dashboard preferences updated' })
  async updateMyDashboardPreferences(@Request() req: AuthenticatedRequest, @Body() body: { layout: any[] }) {
    return this.usersService.updateDashboardPreferences(req.user.tenantId, req.user.userId, body.layout);
  }
}
