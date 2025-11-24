import { Controller, Get, Put, Delete, Body, UseGuards, Request, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { JwtAuthGuard } from '../../../modules/auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../modules/auth/guards/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { UpdatePreferencesDto } from '../dtos/update-preferences.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}

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
  async updateMyProfile(@Request() req: AuthenticatedRequest, @Body() body: { firstName?: string; lastName?: string }) {
    return this.usersService.updateUserProfile(req.user.userId, body);
  }

  /**
   * Delete account (GDPR)
   * DELETE /users/me
   */
  @Delete('me')
  async deleteMyAccount(@Request() req: AuthenticatedRequest) {
    return this.usersService.deleteUserAccount(req.user.userId);
  }

  /**
   * Get user's messages
   * GET /users/me/messages
   */
  @Get('me/messages')
  async getMyMessages(@Request() req: AuthenticatedRequest) {
    return this.usersService.getUserMessages(req.user.userId, req.user.tenantId);
  }

  /**
   * Get user preferences
   * GET /users/me/preferences
   */
  @Get('me/preferences')
  @ApiOperation({ summary: 'Get user preferences' })
  @ApiResponse({ status: 200, description: 'Returns user preferences' })
  async getMyPreferences(@Request() req: AuthenticatedRequest) {
    return this.usersService.getUserPreferences(req.user.userId);
  }

  /**
   * Update user preferences
   * PATCH /users/me/preferences
   */
  @Patch('me/preferences')
  @ApiOperation({ summary: 'Update user preferences' })
  @ApiResponse({ status: 200, description: 'Preferences updated successfully' })
  async updateMyPreferences(
    @Request() req: AuthenticatedRequest,
    @Body() body: UpdatePreferencesDto,
  ) {
    return this.usersService.updateUserPreferences(req.user.userId, body);
  }
}
