/**
 * Follow-up Controller
 * Phase 9e: Extracted from voltagent.controller.ts (2026-01-23)
 *
 * Handles email follow-up tracking operations.
 */
import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FollowUpStatus } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard } from '../../../subscription/guards/quota.guard';
import { FollowUpService } from '../services/follow-up.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

@ApiTags('VoltAgent Follow-ups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class FollowUpController {
  private readonly logger = new Logger(FollowUpController.name);

  constructor(private readonly followUpService: FollowUpService) {}

  /**
   * Get follow-ups with optional filtering.
   */
  @Get('follow-ups')
  @ApiOperation({ summary: 'Get follow-ups' })
  async getFollowUps(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    // Parse status filter (PENDING, REMINDED, RESOLVED, EXPIRED)
    const statusFilter = status
      ? (status.split(',') as Array<'PENDING' | 'REMINDED' | 'RESOLVED' | 'EXPIRED'>)
      : undefined;

    const followUps = await this.followUpService.listFollowUps(
      req.user.tenantId,
      req.user.userId,
      {
        status: statusFilter && statusFilter.length === 1 ? statusFilter[0] : statusFilter,
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      },
    );

    return {
      success: true,
      count: followUps.length,
      followUps,
    };
  }

  /**
   * Get pending follow-ups (cached, fast).
   */
  @Get('follow-ups/pending')
  @ApiOperation({ summary: 'Get pending follow-ups (cached)' })
  async getPendingFollowUps(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const followUps = await this.followUpService.getPendingFollowUps(
      req.user.tenantId,
      req.user.userId,
      limit ? parseInt(limit, 10) : 20,
    );

    return {
      success: true,
      count: followUps.length,
      followUps,
    };
  }

  /**
   * Get overdue follow-ups.
   */
  @Get('follow-ups/overdue')
  @ApiOperation({ summary: 'Get overdue follow-ups' })
  async getOverdueFollowUps(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
  ) {
    const followUps = await this.followUpService.getOverdueFollowUps(
      req.user.tenantId,
      req.user.userId,
      limit ? parseInt(limit, 10) : 20,
    );

    return {
      success: true,
      count: followUps.length,
      followUps,
    };
  }

  /**
   * Get follow-up statistics.
   */
  @Get('follow-ups/stats')
  @ApiOperation({ summary: 'Get follow-up statistics' })
  async getFollowUpStats(@Req() req: AuthenticatedRequest) {
    const stats = await this.followUpService.getStats(
      req.user.tenantId,
      req.user.userId,
    );

    return {
      success: true,
      ...stats,
    };
  }

  /**
   * Create a follow-up for an email.
   */
  @Post('follow-ups')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a follow-up' })
  async createFollowUp(
    @Req() req: AuthenticatedRequest,
    @Body() body: { emailId: string; reason?: string; dueDate?: string },
  ) {
    const followUp = await this.followUpService.createFollowUp({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      emailId: body.emailId,
      reason: body.reason,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    });

    return {
      success: true,
      followUp,
    };
  }

  /**
   * Analyze email text for follow-up patterns.
   */
  @Post('follow-ups/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyze text for follow-up patterns' })
  async analyzeForFollowUp(
    @Req() _req: AuthenticatedRequest,
    @Body() body: { body: string; subject?: string },
  ) {
    const result = this.followUpService.analyzeForFollowUp(body.body, body.subject);

    return {
      success: true,
      ...result,
    };
  }

  /**
   * Get a specific follow-up.
   */
  @Get('follow-ups/:id')
  @ApiOperation({ summary: 'Get a follow-up by ID' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  async getFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const followUp = await this.followUpService.getFollowUp(
      req.user.tenantId,
      req.user.userId,
      id,
    );

    if (!followUp) {
      throw new NotFoundException('Follow-up not found');
    }

    return {
      success: true,
      followUp,
    };
  }

  /**
   * Resolve a follow-up.
   */
  @Post('follow-ups/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a follow-up' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  async resolveFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const followUp = await this.followUpService.resolveFollowUp(
      req.user.tenantId,
      req.user.userId,
      id,
      'MANUAL',
    );

    return {
      success: true,
      followUp,
    };
  }

  /**
   * Snooze a follow-up (extend due date).
   */
  @Post('follow-ups/:id/snooze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Snooze a follow-up' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  async snoozeFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { dueDate: string },
  ) {
    const followUp = await this.followUpService.snoozeFollowUp(
      req.user.tenantId,
      req.user.userId,
      id,
      new Date(body.dueDate),
    );

    return {
      success: true,
      followUp,
    };
  }

  /**
   * Update follow-up status (for Kanban drag-drop).
   */
  @Patch('follow-ups/:id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update follow-up status' })
  @ApiParam({ name: 'id', description: 'Follow-up ID' })
  async updateFollowUpStatus(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    const validStatuses: FollowUpStatus[] = ['PENDING', 'REMINDED', 'RESOLVED', 'EXPIRED'];
    if (!validStatuses.includes(body.status as FollowUpStatus)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const followUp = await this.followUpService.updateStatus(
      req.user.tenantId,
      req.user.userId,
      id,
      body.status as FollowUpStatus,
    );

    return {
      success: true,
      followUp,
    };
  }
}
