import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { LabelAccuracyService } from '../services/label-accuracy.service';
import type { AccuracyWindowKey } from '../services/label-accuracy.events';

/**
 * Phase 148 D-09: read API for per-label accuracy.
 *
 * Final route: /api/v1/ai/triage/label-accuracy
 *   - Global prefix `api/v1` is applied by `app.setGlobalPrefix('api/v1')` in
 *     backend/src/main.ts:616 (Phase 33 API versioning). The controller
 *     annotation carries only the module-relative `ai/triage` segment.
 *   - Mirrors Phase 147's `TriageOverridesController` @Controller('ai/triage-overrides')
 *     routing convention.
 *
 * Auth: cookie session via TenantGuard. NOT admin-only; every authenticated
 * member of the tenant sees their tenant's label accuracy (D-09).
 *
 * tenantId is sourced exclusively from the authenticated session; it is
 * NEVER accepted as a query or body param. This is the T-148-05-01
 * cross-tenant info-disclosure mitigation.
 */
export class GetLabelAccuracyQueryDto {
  /**
   * Comma-separated subset of '7d','30d','all'. Example: "7d,30d".
   * Omit or empty -> all three windows returned.
   */
  @IsOptional()
  @IsString()
  @Matches(/^(?:7d|30d|all)(?:,(?:7d|30d|all))*$/, {
    message: "windows must be a comma-separated subset of '7d','30d','all'",
  })
  windows?: string;

  /**
   * 'true' to include per-triageSource breakdown (D-07 secondary table).
   * Omit or 'false' -> breakdown excluded (payload kept small for the
   * settings-page pill which only needs the '30d' window).
   */
  @IsOptional()
  @IsString()
  @Matches(/^(?:true|false)$/, {
    message: "includeBreakdown must be 'true' or 'false'",
  })
  @Transform(({ value }) => value === 'true')
  includeBreakdown?: boolean;
}

@ApiTags('AI Triage Accuracy')
@ApiCookieAuth()
@Controller('ai/triage')
@UseGuards(TenantGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TriageAccuracyController {
  constructor(private readonly accuracy: LabelAccuracyService) {}

  @Get('label-accuracy')
  @ApiOperation({
    summary: 'Per-label triage accuracy for the authenticated tenant',
    description:
      'D-09 read API. Returns precision / recall / F1 + Wilson CI bounds per label ' +
      'across the requested windows (7d / 30d / all). Pagination intentionally omitted ' +
      'per D-09: 20 labels x 3 windows per tenant is bounded. Cache is handled by ' +
      'TanStack Query on the frontend (staleTime: 5min, gcTime: 30min).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Labels with per-window precision / recall / F1 + Wilson CI bounds + ' +
      'state ("learning" when sampleSize < 20 per D-11, else "ready"). ' +
      'Optional triageSourceBreakdown when includeBreakdown=true.',
  })
  async getLabelAccuracy(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetLabelAccuracyQueryDto,
  ) {
    // T-148-05-01: tenantId ALWAYS from the authenticated session, never from
    // query or body. TenantGuard has already validated req.user and resolved
    // tenantId from the session; this is a plain read, no elevation.
    const tenantId = req.user.tenantId;

    // D-09 default: all three windows when absent or empty. The DTO regex
    // guarantees each token is valid if present; the belt-and-braces filter
    // below rejects anything else defensively.
    const windows: AccuracyWindowKey[] = query.windows
      ? query.windows
          .split(',')
          .map((s) => s.trim())
          .filter(
            (s): s is AccuracyWindowKey =>
              s === '7d' || s === '30d' || s === 'all',
          )
      : (['7d', '30d', 'all'] as AccuracyWindowKey[]);

    // Coerce: the DTO Transform converts the 'true' | 'false' string into a
    // boolean, but class-validator type inference keeps the property typed as
    // `string | boolean | undefined` in some pipelines; the cast pins the
    // service contract to strict boolean.
    const includeBreakdown =
      (query as unknown as { includeBreakdown?: boolean }).includeBreakdown ===
      true;

    return this.accuracy.read(tenantId, {
      windows,
      includeBreakdown,
    });
  }
}
