/**
 * CRM Intelligence Controller
 * Phase 9e: Extracted from voltagent.controller.ts (2026-01-23)
 *
 * Handles relationship intelligence and contact tracking.
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { QuotaGuard } from '../../../subscription/guards/quota.guard';
import { RelationshipIntelligenceService } from '../services/relationship-intelligence.service';

interface AuthenticatedRequest {
  user: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

@ApiTags('VoltAgent CRM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, QuotaGuard)
@Controller('api/v1/voltagent')
export class CrmController {
  private readonly logger = new Logger(CrmController.name);

  constructor(
    private readonly relationshipIntelligenceService: RelationshipIntelligenceService,
  ) {}

  /**
   * Get stale contacts (no interaction in X days).
   */
  @Get('crm/stale-contacts')
  @ApiOperation({
    summary: 'Get stale contacts',
    description: `Returns contacts with no interaction in the specified number of days.
    Default threshold is 60 days. Results are sorted by relationship score.`,
  })
  async getStaleContacts(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
    @Query('minInteractions') minInteractions?: string,
  ) {
    const { tenantId } = req.user;

    const contacts = await this.relationshipIntelligenceService.getStaleContacts(tenantId, {
      staleDays: days ? parseInt(days, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      minInteractions: minInteractions ? parseInt(minInteractions, 10) : undefined,
    });

    return {
      success: true,
      count: contacts.length,
      contacts,
    };
  }

  /**
   * Get contacts needing reconnection.
   */
  @Get('crm/reconnect')
  @ApiOperation({
    summary: 'Get contacts needing reconnection',
    description: `Returns stale contacts that haven't had a reconnect reminder sent recently.`,
  })
  async getContactsNeedingReconnect(
    @Req() req: AuthenticatedRequest,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    const { tenantId } = req.user;

    const contacts = await this.relationshipIntelligenceService.getContactsNeedingReconnect(
      tenantId,
      {
        staleDays: days ? parseInt(days, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );

    return {
      success: true,
      count: contacts.length,
      contacts,
    };
  }

  /**
   * Get top contacts by relationship score.
   */
  @Get('crm/top-contacts')
  @ApiOperation({
    summary: 'Get top contacts by relationship score',
    description: `Returns your most important contacts ranked by relationship score.`,
  })
  async getTopContacts(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('minScore') minScore?: string,
  ) {
    const { tenantId } = req.user;

    const contacts = await this.relationshipIntelligenceService.getTopContacts(tenantId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      minScore: minScore ? parseFloat(minScore) : undefined,
    });

    return {
      success: true,
      count: contacts.length,
      contacts,
    };
  }

  /**
   * Get relationship stats for a specific contact.
   */
  @Get('crm/contacts/:contactId')
  @ApiOperation({
    summary: 'Get contact relationship stats',
    description: `Returns detailed relationship statistics for a specific contact.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async getContactRelationshipStats(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    const { tenantId } = req.user;

    const stats = await this.relationshipIntelligenceService.getContactRelationshipStats(
      tenantId,
      contactId,
    );

    if (!stats) {
      throw new NotFoundException('Contact not found');
    }

    return {
      success: true,
      stats,
    };
  }

  /**
   * Get interaction history for a contact.
   */
  @Get('crm/contacts/:contactId/interactions')
  @ApiOperation({
    summary: 'Get contact interaction history',
    description: `Returns the interaction history for a specific contact.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async getContactInteractionHistory(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { tenantId } = req.user;

    const interactions =
      await this.relationshipIntelligenceService.getContactInteractionHistory(
        tenantId,
        contactId,
        {
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        },
      );

    return {
      success: true,
      count: interactions.length,
      interactions,
    };
  }

  /**
   * Record a manual interaction with a contact.
   */
  @Post('crm/contacts/:contactId/interactions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record manual interaction',
    description: `Record a manual interaction with a contact (call, meeting, or note).`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async recordManualInteraction(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Body() body: {
      type: 'MEETING' | 'CALL' | 'NOTE';
      date?: string;
      summary?: string;
    },
  ) {
    const { tenantId, userId } = req.user;

    const interactionId = await this.relationshipIntelligenceService.recordManualInteraction(
      tenantId,
      userId,
      contactId,
      body.type,
      body.date ? new Date(body.date) : new Date(),
      body.summary,
    );

    return {
      success: true,
      interactionId,
    };
  }

  /**
   * Recalculate relationship score for a contact.
   */
  @Post('crm/contacts/:contactId/recalculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recalculate relationship score',
    description: `Triggers recalculation of the relationship score for a specific contact.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async recalculateRelationshipScore(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    const { tenantId } = req.user;

    const scoreComponents =
      await this.relationshipIntelligenceService.calculateRelationshipScore(
        tenantId,
        contactId,
      );

    return {
      success: true,
      score: scoreComponents,
    };
  }

  /**
   * Get relationship graph for a contact.
   */
  @Get('crm/contacts/:contactId/graph')
  @ApiOperation({
    summary: 'Get relationship graph',
    description: `Returns contacts connected through shared email threads or meetings.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async getRelationshipGraph(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
    @Query('depth') depth?: string,
  ) {
    const { tenantId } = req.user;

    const graph = await this.relationshipIntelligenceService.getRelationshipGraph(
      tenantId,
      contactId,
      depth ? parseInt(depth, 10) : undefined,
    );

    return {
      success: true,
      count: graph.length,
      nodes: graph,
    };
  }

  /**
   * Mark a contact as reminded.
   */
  @Post('crm/contacts/:contactId/reminded')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark contact as reminded',
    description: `Records that a reconnect reminder was sent for this contact.`,
  })
  @ApiParam({ name: 'contactId', description: 'Contact ID' })
  async markContactReminded(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    await this.relationshipIntelligenceService.markContactReminded(
      req.user.tenantId,
      contactId,
    );

    return {
      success: true,
    };
  }

  /**
   * Batch recalculate all relationship scores.
   */
  @Post('crm/recalculate-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Recalculate all relationship scores',
    description: `Triggers batch recalculation of relationship scores for all contacts.`,
  })
  async recalculateAllScores(@Req() req: AuthenticatedRequest) {
    const { tenantId } = req.user;

    const result = await this.relationshipIntelligenceService.recalculateAllScores(tenantId);

    return {
      success: true,
      ...result,
    };
  }
}
