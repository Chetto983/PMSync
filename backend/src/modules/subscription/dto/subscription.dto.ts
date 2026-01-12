/**
 * Subscription DTOs
 *
 * Data Transfer Objects for subscription API endpoints.
 */

import { IsString, IsOptional, IsEnum, IsNumber, Min, IsBoolean, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

// ==========================================================================
// Request DTOs
// ==========================================================================

export class UpdatePlanDto {
  @ApiProperty({
    enum: SubscriptionPlan,
    description: 'New subscription plan',
    example: 'PROFESSIONAL',
  })
  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({
    description: 'Cancel at end of current billing period',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean = true;
}

// ==========================================================================
// Autumn DTOs
// ==========================================================================

export class CreateCustomerDto {
  @ApiProperty({ description: 'Customer name', example: 'John Doe' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Customer email', example: 'john@example.com' })
  @IsEmail()
  email: string;
}

export class AttachProductDto {
  @ApiProperty({ description: 'Product ID to attach', example: 'starter' })
  @IsString()
  productId: string;

  @ApiPropertyOptional({ description: 'Customer name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Customer email' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CheckFeatureDto {
  @ApiProperty({ description: 'Feature ID to check', example: 'ai-calls' })
  @IsString()
  featureId: string;
}

export class TrackUsageDto {
  @ApiProperty({ description: 'Feature ID to track', example: 'ai-calls' })
  @IsString()
  featureId: string;

  @ApiPropertyOptional({ description: 'Usage amount', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number = 1;
}

export class BillingPortalDto {
  @ApiPropertyOptional({ description: 'Return URL after portal session' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class CancelDto {
  @ApiPropertyOptional({ description: 'Product ID to cancel' })
  @IsOptional()
  @IsString()
  productId?: string;
}

// ==========================================================================
// Response DTOs
// ==========================================================================

export class UsageStatsDto {
  @ApiProperty({ description: 'Emails processed this period' })
  emailsProcessed: number;

  @ApiProperty({ description: 'AI calls used this period' })
  aiCallsUsed: number;

  @ApiProperty({ description: 'Remaining email quota' })
  emailsRemaining: number;

  @ApiProperty({ description: 'Remaining AI call quota' })
  aiCallsRemaining: number;

  @ApiProperty({ description: 'Percentage of email quota used' })
  percentEmailUsed: number;

  @ApiProperty({ description: 'Percentage of AI quota used' })
  percentAIUsed: number;
}

export class SubscriptionResponseDto {
  @ApiProperty({ description: 'Subscription ID' })
  id: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenantId: string;

  @ApiProperty({ enum: SubscriptionPlan, description: 'Current plan' })
  plan: SubscriptionPlan;

  @ApiProperty({ enum: SubscriptionStatus, description: 'Subscription status' })
  status: SubscriptionStatus;

  @ApiProperty({ description: 'Monthly email limit (-1 for unlimited)' })
  monthlyEmailLimit: number;

  @ApiProperty({ description: 'Monthly AI call limit (-1 for unlimited)' })
  monthlyAICallLimit: number;

  @ApiProperty({ description: 'Maximum users allowed' })
  maxUsers: number;

  @ApiProperty({ description: 'Real-time usage statistics' })
  usage: UsageStatsDto;

  @ApiPropertyOptional({ description: 'Autumn customer ID' })
  autumnCustomerId?: string;

  @ApiPropertyOptional({ description: 'Current period end date' })
  currentPeriodEnd?: Date;

  @ApiPropertyOptional({ description: 'Cancellation date if scheduled' })
  cancelAt?: Date;

  @ApiProperty({ description: 'Usage reset date' })
  usageResetAt: Date;
}

export class CostProtectionStatusDto {
  @ApiProperty({ description: 'Total cost today in USD' })
  dailyCost: number;

  @ApiProperty({ description: 'Daily cost cap in USD (null for unlimited)' })
  dailyCap: number | null;

  @ApiProperty({ description: 'Percentage of daily cap used' })
  percentUsed: number;

  @ApiProperty({ description: 'Whether AI operations are blocked' })
  isBlocked: boolean;

  @ApiProperty({
    enum: ['ok', 'warning', 'critical', 'blocked'],
    description: 'Alert level',
  })
  alertLevel: 'ok' | 'warning' | 'critical' | 'blocked';
}

export class AttachResponseDto {
  @ApiProperty({ description: 'Whether attach was successful' })
  success: boolean;

  @ApiPropertyOptional({ description: 'Checkout URL for payment' })
  checkoutUrl?: string;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  error?: string;
}

export class CheckResponseDto {
  @ApiProperty({ description: 'Whether feature is allowed' })
  allowed: boolean;

  @ApiPropertyOptional({ description: 'Remaining usage for metered features' })
  remaining?: number;

  @ApiPropertyOptional({ description: 'Total included usage' })
  total?: number;

  @ApiPropertyOptional({ description: 'Whether feature is unlimited' })
  unlimited?: boolean;
}

export class BillingPortalResponseDto {
  @ApiProperty({ description: 'Billing portal URL' })
  url: string;
}

export class PricingTableDto {
  @ApiProperty({ description: 'Available plans' })
  plans: PlanDto[];
}

export class PlanDto {
  @ApiProperty({ description: 'Plan ID' })
  id: string;

  @ApiProperty({ description: 'Plan name' })
  name: string;

  @ApiProperty({ description: 'Price per month (null for custom pricing)' })
  price: number | null;

  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiProperty({ description: 'Billing interval' })
  interval: string;

  @ApiProperty({ description: 'Included features' })
  features: string[];

  @ApiProperty({ description: 'Usage limits' })
  limits: {
    emails: number;
    aiCalls: number;
  };
}
