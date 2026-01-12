/**
 * AutumnController - Autumn billing proxy routes
 *
 * Proxies requests to Autumn SDK for payment flows, feature checks, and usage tracking.
 * Based on Zero-staging reference implementation.
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md Part 4
 */

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { AutumnService } from '../services/autumn.service';
import {
  CreateCustomerDto,
  AttachProductDto,
  CheckFeatureDto,
  TrackUsageDto,
  BillingPortalDto,
  CancelDto,
  AttachResponseDto,
  CheckResponseDto,
  BillingPortalResponseDto,
  PricingTableDto,
} from '../dto/subscription.dto';
import { ConfigService } from '@nestjs/config';

// Helper to get display name from user
function getUserName(user: AuthenticatedRequest['user']): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`.trim();
  }
  if (user.firstName) return user.firstName;
  if (user.lastName) return user.lastName;
  return 'User';
}

@ApiTags('Billing')
@Controller('api/v1/autumn')
export class AutumnController {
  constructor(
    private readonly autumnService: AutumnService,
    private readonly config: ConfigService,
  ) {}

  // ==========================================================================
  // Customer Management
  // ==========================================================================

  @Post('customers')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create Autumn customer' })
  @ApiResponse({
    status: 201,
    description: 'Customer created',
  })
  async createCustomer(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateCustomerDto,
  ): Promise<{ customerId: string }> {
    const result = await this.autumnService.createCustomer(req.user.tenantId, {
      name: dto.name,
      email: dto.email,
    });

    if (!result) {
      throw new BadRequestException('Failed to create customer');
    }

    return result;
  }

  // ==========================================================================
  // Payment Flow
  // ==========================================================================

  @Post('attach')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Attach product to customer (initiate payment)' })
  @ApiResponse({
    status: 200,
    description: 'Checkout URL or success confirmation',
    type: AttachResponseDto,
  })
  async attach(
    @Request() req: AuthenticatedRequest,
    @Body() dto: AttachProductDto,
  ): Promise<AttachResponseDto> {
    return this.autumnService.attach(req.user.tenantId, dto.productId, {
      name: dto.name || getUserName(req.user),
      email: dto.email || req.user.email,
    });
  }

  // ==========================================================================
  // Feature Access
  // ==========================================================================

  @Post('check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check feature access' })
  @ApiResponse({
    status: 200,
    description: 'Feature access status',
    type: CheckResponseDto,
  })
  async checkFeature(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CheckFeatureDto,
  ): Promise<CheckResponseDto> {
    return this.autumnService.checkFeature(req.user.tenantId, dto.featureId, {
      name: getUserName(req.user),
      email: req.user.email,
    });
  }

  // ==========================================================================
  // Usage Tracking
  // ==========================================================================

  @Post('track')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track usage event' })
  @ApiResponse({
    status: 200,
    description: 'Usage tracked',
  })
  async trackUsage(
    @Request() req: AuthenticatedRequest,
    @Body() dto: TrackUsageDto,
  ): Promise<{ success: boolean }> {
    const success = await this.autumnService.trackUsage(
      req.user.tenantId,
      dto.featureId,
      dto.amount ?? 1,
      {
        name: getUserName(req.user),
        email: req.user.email,
      },
    );

    return { success };
  }

  // ==========================================================================
  // Billing Portal
  // ==========================================================================

  @Post('billing_portal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get billing portal URL' })
  @ApiResponse({
    status: 200,
    description: 'Billing portal URL',
    type: BillingPortalResponseDto,
  })
  async billingPortal(
    @Request() req: AuthenticatedRequest,
    @Body() dto: BillingPortalDto,
  ): Promise<BillingPortalResponseDto> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const returnUrl = dto.returnUrl || `${frontendUrl}/settings/billing`;

    const result = await this.autumnService.getBillingPortalUrl(
      req.user.tenantId,
      returnUrl,
    );

    if (!result) {
      throw new BadRequestException('Failed to get billing portal URL');
    }

    return result;
  }

  @Post('openBillingPortal')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open billing portal (returns to app root)' })
  @ApiResponse({
    status: 200,
    description: 'Billing portal URL',
    type: BillingPortalResponseDto,
  })
  async openBillingPortal(
    @Request() req: AuthenticatedRequest,
  ): Promise<BillingPortalResponseDto> {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';

    const result = await this.autumnService.getBillingPortalUrl(
      req.user.tenantId,
      frontendUrl,
    );

    if (!result) {
      throw new BadRequestException('Failed to get billing portal URL');
    }

    return result;
  }

  // ==========================================================================
  // Cancel
  // ==========================================================================

  @Post('cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription canceled',
  })
  async cancel(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CancelDto,
  ): Promise<{ success: boolean }> {
    const success = await this.autumnService.cancelSubscription(
      req.user.tenantId,
      dto.productId,
    );

    return { success };
  }

  // ==========================================================================
  // Pricing Table
  // ==========================================================================

  @Get('components/pricing_table')
  @ApiOperation({ summary: 'Get pricing table' })
  @ApiResponse({
    status: 200,
    description: 'Pricing table data',
    type: PricingTableDto,
  })
  async getPricingTable(): Promise<PricingTableDto> {
    return this.autumnService.getPricingTable();
  }

  @Get('components/pricing_table/authenticated')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get pricing table with customer context' })
  @ApiResponse({
    status: 200,
    description: 'Pricing table data with customer-specific info',
    type: PricingTableDto,
  })
  async getPricingTableAuthenticated(
    @Request() req: AuthenticatedRequest,
  ): Promise<PricingTableDto> {
    return this.autumnService.getPricingTable(req.user.tenantId);
  }
}
