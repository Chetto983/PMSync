import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { PrismaService } from '../../../../prisma/prisma.service';
import { LeadScoringService } from '../lead-scoring.service';
import {
  ListLeadScoresQueryDto,
  LeadScoreSortField,
} from '../dto/lead-score.dto';

@ApiTags('CRM - Lead Scoring')
@ApiCookieAuth()
@Controller('crm/leads')
@UseGuards(TenantGuard, RolesGuard)
export class LeadScoreController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leadScoring: LeadScoringService,
  ) {}

  @Get('scores')
  @ApiOperation({ summary: 'List lead scores with pagination and sorting' })
  @ApiResponse({ status: 200, description: 'Lead scores returned' })
  async listScores(
    @Req() req: any,
    @Query() query: ListLeadScoresQueryDto,
  ) {
    const tenantId = req.user.tenantId;
    const {
      sort = LeadScoreSortField.SCORE,
      order = 'desc',
      minScore,
      tier,
      page = 1,
      pageSize = 20,
    } = query;

    const where: any = { tenantId };
    if (minScore !== undefined) {
      where.score = { gte: minScore };
    }

    // Tier filter maps to score ranges
    if (tier === 'hot') {
      where.score = { ...where.score, gte: 70 };
    } else if (tier === 'warm') {
      where.score = { ...where.score, gte: 40, lt: 70 };
    } else if (tier === 'cold') {
      where.score = { ...where.score, lt: 40 };
    }

    const [data, total] = await Promise.all([
      this.prisma.leadScore.findMany({
        where,
        orderBy: { [sort]: order },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contact: {
            select: {
              displayName: true,
              firstName: true,
              lastName: true,
              company: true,
              emails: true,
            },
          },
        },
      }),
      this.prisma.leadScore.count({ where }),
    ]);

    return {
      data: data.map((item) => ({
        id: item.id,
        contactId: item.contactId,
        score: item.score,
        confidence: item.confidence,
        tier: this.scoreTier(item.score),
        features: item.features,
        computedAt: item.computedAt,
        contact: item.contact,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get(':contactId/score')
  @ApiOperation({ summary: 'Get lead score for a specific contact' })
  @ApiResponse({ status: 200, description: 'Lead score returned' })
  @ApiResponse({ status: 404, description: 'No score found for contact' })
  async getScore(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;

    const score = await this.prisma.leadScore.findUnique({
      where: {
        tenantId_contactId: { tenantId, contactId },
      },
      include: {
        contact: {
          select: {
            displayName: true,
            firstName: true,
            lastName: true,
            company: true,
          },
        },
      },
    });

    if (!score) {
      throw new NotFoundException(
        `No lead score found for contact ${contactId}`,
      );
    }

    return {
      id: score.id,
      contactId: score.contactId,
      score: score.score,
      confidence: score.confidence,
      tier: this.scoreTier(score.score),
      features: score.features,
      computedAt: score.computedAt,
      contact: score.contact,
    };
  }

  @Get(':contactId/score/history')
  @ApiOperation({ summary: 'Get lead score history for a contact (last 90 days)' })
  @ApiResponse({ status: 200, description: 'Score history returned' })
  async getScoreHistory(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const history = await this.prisma.leadScoreHistory.findMany({
      where: {
        tenantId,
        contactId,
        computedAt: { gte: ninetyDaysAgo },
      },
      orderBy: { computedAt: 'asc' },
      select: {
        score: true,
        confidence: true,
        computedAt: true,
      },
    });

    return { data: history };
  }

  @Post(':contactId/score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger on-demand lead scoring for a contact' })
  @ApiResponse({ status: 200, description: 'Score computed' })
  async computeScore(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;

    // Verify contact exists
    const contact = await this.prisma.contact.findUnique({
      where: { id_tenantId: { id: contactId, tenantId } },
      select: { id: true },
    });
    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    const result = await this.leadScoring.scoreContact(tenantId, contactId);

    if (!result) {
      return {
        message: 'No features available for scoring. Run feature computation first.',
        score: null,
      };
    }

    return {
      score: result.score,
      tier: result.tier,
      confidence: result.confidence,
      reasons: result.reasons,
    };
  }

  private scoreTier(score: number): 'hot' | 'warm' | 'cold' {
    if (score >= 70) return 'hot';
    if (score >= 40) return 'warm';
    return 'cold';
  }
}
