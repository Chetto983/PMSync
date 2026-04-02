import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
  Logger,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { TriageRuleService, type TriageRule } from '../services/triage-rule.service';
import { UpdateTriageRulesDto, TriagePreviewDto } from '../dto/triage-rules.dto';
import { PrismaService } from '../../../prisma/prisma.service';

@ApiTags('AI Triage Rules')
@ApiCookieAuth()
@Controller('ai/triage-rules')
@UseGuards(TenantGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TriageRulesController {
  private readonly logger = new Logger(TriageRulesController.name);

  constructor(
    private readonly triageRuleService: TriageRuleService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get triage rules for current tenant' })
  @ApiResponse({ status: 200, description: 'Current triage rules' })
  async getTriageRules(@Req() req: AuthenticatedRequest): Promise<{ rules: TriageRule[] }> {
    const rules = await this.triageRuleService.getTriageRules(req.user.tenantId);
    return { rules };
  }

  @Put()
  @ApiOperation({ summary: 'Update triage rules for current tenant' })
  @ApiResponse({ status: 200, description: 'Updated triage rules' })
  @HttpCode(HttpStatus.OK)
  async updateTriageRules(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateTriageRulesDto,
  ): Promise<{ rules: TriageRule[] }> {
    try {
      const rules = await this.triageRuleService.setTriageRules(
        req.user.tenantId,
        dto.rules,
      );
      return { rules };
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Invalid triage rules',
      );
    }
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview triage rules against an email (dry-run)' })
  @ApiResponse({ status: 200, description: 'Preview result' })
  @HttpCode(HttpStatus.OK)
  async previewTriageRules(
    @Req() req: AuthenticatedRequest,
    @Body() dto: TriagePreviewDto,
  ) {
    const email = await this.prisma.email.findFirst({
      where: { id: dto.emailId, tenantId: req.user.tenantId },
      select: { from: true, subject: true, snippet: true },
    });

    if (!email) {
      throw new NotFoundException('Email not found');
    }

    const rules = await this.triageRuleService.getTriageRules(req.user.tenantId);
    const matchedRules = rules.filter((rule) => {
      const fromLower = email.from.toLowerCase();
      const subjectLower = email.subject.toLowerCase();
      const snippetLower = (email.snippet ?? '').toLowerCase();
      const patternLower = rule.pattern.toLowerCase();

      switch (rule.type) {
        case 'domain':
          return fromLower.includes(`@${patternLower}`) || fromLower.endsWith(patternLower);
        case 'sender':
          return fromLower.includes(patternLower);
        case 'keyword':
          return (
            subjectLower.includes(patternLower) || snippetLower.includes(patternLower)
          );
        case 'phrase':
          return (
            subjectLower.includes(patternLower) || snippetLower.includes(patternLower)
          );
        default:
          return false;
      }
    });

    const context = await this.triageRuleService.buildTriageContext(req.user.tenantId);

    return {
      emailId: dto.emailId,
      from: email.from,
      subject: email.subject,
      matchedRules,
      triageContext: context,
    };
  }

  @Get('lane-counts')
  @ApiOperation({ summary: 'Get email counts per triage lane' })
  @ApiResponse({ status: 200, description: 'Count per lane' })
  async getLaneCounts(
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, number>> {
    const tenantId = req.user.tenantId;

    const rows = await this.prisma.email.groupBy({
      by: ['aiLane'],
      where: { tenantId, isDeleted: false, aiLane: { not: null } },
      _count: { id: true },
    });

    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.aiLane) {
        counts[row.aiLane] = row._count.id;
      }
    }

    return counts;
  }
}
