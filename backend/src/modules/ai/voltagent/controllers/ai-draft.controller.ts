/**
 * AI Draft Controller
 * Phase 19: AI Draft Generation
 *
 * REST endpoints for AI reply draft generation and feedback tracking.
 * - POST /api/v1/voltagent/generate-reply-draft - Generate AI reply draft
 * - POST /api/v1/voltagent/draft-feedback - Record feedback for a draft
 * - GET /api/v1/voltagent/draft-stats - Get draft quality statistics
 */
import {
  Controller,
  Post,
  Body,
  Req,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard, RequiresQuota } from '../../../subscription/guards/quota.guard';
import { RequiresConsent } from '../../../compliance/decorators/requires-consent.decorator';
import { DraftGenerationService } from '../services/draft-generation.service';
import { DraftFeedbackService, type DraftAction } from '../services/draft-feedback.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

/** DTO for generating a reply draft */
class GenerateReplyDraftDto {
  @IsString()
  emailId!: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  locale?: string;
}

/** DTO for recording draft feedback */
class RecordDraftFeedbackDto {
  @IsString()
  draftId!: string;

  @IsString()
  action!: DraftAction;

  @IsOptional()
  @IsString()
  sentBody?: string;
}

@ApiTags('AI Drafts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class AiDraftController {
  constructor(
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftFeedbackService: DraftFeedbackService,
  ) {}

  /**
   * Generate an AI reply draft for a given email.
   * Called automatically when user opens a reply composer.
   */
  @Post('generate-reply-draft')
  @RequiresConsent('ai_email_processing')
  @RequiresQuota('ai')
  @ApiOperation({ summary: 'Generate AI reply draft for an email' })
  async generateReplyDraft(
    @Req() req: AuthenticatedRequest,
    @Body() dto: GenerateReplyDraftDto,
  ) {
    return this.draftGenerationService.generateDraft(
      req.user.tenantId,
      req.user.userId,
      dto.emailId,
      {
        tone: dto.tone,
        instructions: dto.instructions,
        locale: dto.locale,
      },
    );
  }

  /**
   * Record feedback for an AI-generated draft.
   * Called when user accepts, edits, or rejects a draft.
   */
  @Post('draft-feedback')
  @ApiOperation({ summary: 'Record feedback for an AI draft' })
  async recordDraftFeedback(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RecordDraftFeedbackDto,
  ) {
    await this.draftFeedbackService.recordFeedback({
      draftId: dto.draftId,
      tenantId: req.user.tenantId,
      action: dto.action,
      sentBody: dto.sentBody,
    });
    return { success: true };
  }

  /**
   * Get AI draft quality statistics for the current user.
   * Shows accept rate, edit rate, reject rate, and average edit distance.
   */
  @Get('draft-stats')
  @ApiOperation({ summary: 'Get AI draft quality statistics' })
  async getDraftStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.draftFeedbackService.getDraftStats(
      req.user.tenantId,
      req.user.userId,
    );
    return { success: true, stats };
  }
}
