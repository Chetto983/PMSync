import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { IsString, IsIn, MaxLength, MinLength } from 'class-validator';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { TriageOverrideService } from '../services/triage-override.service';
import { TriagePromotionService } from '../services/triage-promotion.service';

class CreateOverrideDto {
  @IsString()
  @IsIn(['sender', 'domain', 'thread'])
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  pattern!: string;

  @IsString()
  @IsIn([
    'always-important',
    'always-review-later',
    'always-system-alert',
    'never-follow-up',
    'always-customer-vip',
  ])
  action!: string;
}

@ApiTags('AI Triage Overrides')
@ApiCookieAuth()
@Controller('ai/triage-overrides')
// Phase 147 Plan 05: RolesGuard added at class level. RolesGuard treats missing
// @Roles() as "allow" (roles.guard.ts:40-42) so existing unmarked routes keep their
// prior TenantGuard-only semantics. Only methods decorated with @Roles() are gated.
@UseGuards(TenantGuard, RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TriageOverridesController {
  constructor(
    private readonly overrideService: TriageOverrideService,
    private readonly promotionService: TriagePromotionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List triage overrides for current tenant' })
  @ApiResponse({ status: 200, description: 'List of overrides' })
  async list(@Req() req: AuthenticatedRequest) {
    const overrides = await this.overrideService.getOverrides(req.user.tenantId);
    return { overrides };
  }

  @Post()
  // WR-04: triage overrides are tenant-wide policy. One user's never-follow-up
  // override silences reminders for every user in the tenant. Rank-and-file
  // users should not be able to create/delete them, and especially not delete
  // an override an admin created. Gate to admin/manager/super-admin — same
  // pattern used by EmailActionsController mutations.
  @Roles('admin', 'manager', 'super-admin')
  @ApiOperation({ summary: 'Create or update a triage override' })
  @ApiResponse({ status: 201, description: 'Override created' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateOverrideDto) {
    const override = await this.overrideService.addOverride(
      req.user.tenantId,
      dto.type,
      dto.pattern,
      dto.action,
    );
    return { override };
  }

  @Delete(':id')
  @Roles('admin', 'manager', 'super-admin')
  @ApiOperation({ summary: 'Delete a triage override' })
  @ApiResponse({ status: 204, description: 'Override deleted' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.overrideService.removeOverride(req.user.tenantId, id);
  }

  /**
   * Phase 147 Plan 05 — D-06 trigger 3: admin force-promote endpoint.
   *
   * The debounced enqueue (D-06 trigger 1) + safety-net cron (D-06 trigger 2)
   * already handle production. This endpoint exists for support flows and
   * Phase 156 E2E benchmarks. Guarded by the super-admin role decorator in
   * addition to the class-level TenantGuard.
   *
   * tenantId is sourced from the authenticated session (req.user.tenantId) —
   * NEVER from the body. No request body; returns the promotion run result.
   */
  @Post('promote-suggestions')
  @Roles('super-admin')
  @RateTierDecorator('destructive-write')
  @ApiOperation({
    summary: 'Force-run promotion of pending triage-correction suggestions',
    description:
      'Admin-only (super-admin). Debounced enqueue already handles production; ' +
      'this is for support and benchmarks. Returns the promotion run summary.',
  })
  @ApiResponse({
    status: 200,
    description: 'Promotion run completed (may be skipped by idempotency window)',
  })
  @HttpCode(HttpStatus.OK)
  async promoteSuggestions(@Req() req: AuthenticatedRequest) {
    return this.promotionService.promoteOverrides(req.user.tenantId);
  }
}
