import {
  Controller,
  Get,
  Post,
  Patch,
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
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChurnAssessmentService } from './churn-assessment.service';
import { ListChurnSignalsQueryDto, ChurnSortField } from './dto/churn.dto';

@ApiTags('CRM - Churn Prediction')
@ApiBearerAuth()
@Controller('crm/churn')
@UseGuards(TenantGuard, RolesGuard)
export class ChurnController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assessmentService: ChurnAssessmentService,
  ) {}

  @Get('at-risk')
  @ApiOperation({ summary: 'List contacts/accounts at risk of churn' })
  @ApiResponse({ status: 200, description: 'At-risk signals returned' })
  async listAtRisk(
    @Req() req: any,
    @Query() query: ListChurnSignalsQueryDto,
  ) {
    const tenantId = req.user.tenantId;
    const {
      sort = ChurnSortField.PROBABILITY,
      order = 'desc',
      threshold,
      riskLevel,
      accountId,
      page = 1,
      pageSize = 20,
    } = query;

    const where: any = { tenantId, acknowledgedAt: null };

    if (threshold !== undefined) {
      where.probability = { gte: threshold };
    }
    if (riskLevel) {
      where.riskLevel = riskLevel.toUpperCase();
    }
    if (accountId) {
      where.accountId = accountId;
    }

    const [data, total] = await Promise.all([
      this.prisma.churnSignal.findMany({
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
              lastInteractedAt: true,
            },
          },
          account: {
            select: {
              id: true,
              name: true,
              industry: true,
              website: true,
            },
          },
        },
      }),
      this.prisma.churnSignal.count({ where }),
    ]);

    return {
      data: data.map((signal) => ({
        id: signal.id,
        contactId: signal.contactId,
        accountId: signal.accountId,
        probability: signal.probability,
        riskLevel: signal.riskLevel,
        signals: signal.signals,
        reasoning: signal.reasoning,
        computedAt: signal.computedAt,
        contact: signal.contact,
        account: signal.account,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  @Get('contact/:contactId')
  @ApiOperation({ summary: 'Get churn signal for a specific contact' })
  @ApiResponse({ status: 200, description: 'Churn signal returned' })
  @ApiResponse({ status: 404, description: 'No signal found' })
  async getContactSignal(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;

    const signal = await this.prisma.churnSignal.findUnique({
      where: { tenantId_contactId: { tenantId, contactId } },
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

    if (!signal) {
      throw new NotFoundException(
        `No churn signal for contact ${contactId}`,
      );
    }

    return signal;
  }

  @Get('account/:accountId')
  @ApiOperation({ summary: 'Get churn signal for a specific account' })
  @ApiResponse({ status: 200, description: 'Churn signal returned' })
  @ApiResponse({ status: 404, description: 'No signal found' })
  async getAccountSignal(
    @Req() req: any,
    @Param('accountId') accountId: string,
  ) {
    const tenantId = req.user.tenantId;

    const signal = await this.prisma.churnSignal.findUnique({
      where: { tenantId_accountId: { tenantId, accountId } },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            industry: true,
          },
        },
      },
    });

    if (!signal) {
      throw new NotFoundException(
        `No churn signal for account ${accountId}`,
      );
    }

    return signal;
  }

  @Post('contact/:contactId/compute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger on-demand churn assessment for a contact' })
  @ApiResponse({ status: 200, description: 'Assessment computed' })
  async computeContact(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const tenantId = req.user.tenantId;

    const contact = await this.prisma.contact.findUnique({
      where: { id_tenantId: { id: contactId, tenantId } },
      select: { id: true },
    });
    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    await this.assessmentService.computeAndStore(tenantId, contactId);

    const signal = await this.prisma.churnSignal.findUnique({
      where: { tenantId_contactId: { tenantId, contactId } },
    });

    return signal;
  }

  @Patch(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge/dismiss a churn warning' })
  @ApiResponse({ status: 200, description: 'Signal acknowledged' })
  async acknowledge(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const tenantId = req.user.tenantId;

    const signal = await this.prisma.churnSignal.findFirst({
      where: { id, tenantId },
    });
    if (!signal) {
      throw new NotFoundException(`Churn signal ${id} not found`);
    }

    return this.prisma.churnSignal.update({
      where: { id },
      data: { acknowledgedAt: new Date() },
    });
  }
}
