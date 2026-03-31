import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MaxLength, IsEmail } from 'class-validator';
import { Public } from '../../../../common/auth/public.decorator';
import { PrismaService } from '../../../../prisma/prisma.service';
import { nanoid } from 'nanoid';

// ---- DTOs ----

export class PortalCreateTicketDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(300)
  subject!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: string;

  // Honeypot — must be empty (bots fill hidden fields)
  @IsOptional()
  @IsString()
  website?: string;

  // Timestamp anti-spam — form load timestamp in ms
  @IsOptional()
  @IsString()
  _ts?: string;
}

// ---- Controller ----

/**
 * Public portal ticket controller — no auth required.
 * Resolves tenant from URL slug. Includes honeypot + timestamp anti-spam.
 */
@ApiTags('Portal - Tickets')
@Public()
@Controller('portal/:tenantSlug/tickets')
export class PortalTicketController {
  private static readonly MIN_SUBMIT_TIME_MS = 3000; // 3s minimum between load and submit

  constructor(private readonly prisma: PrismaService) {}

  private async resolveTenantId(slug: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });
    if (!tenant || !tenant.isActive) {
      throw new NotFoundException('Portal not found');
    }
    return tenant.id;
  }

  @Post()
  @ApiOperation({ summary: 'Public: Submit a support ticket' })
  @ApiResponse({ status: 201, description: 'Ticket created with tracking token' })
  @ApiResponse({ status: 400, description: 'Spam detected or invalid input' })
  async create(
    @Param('tenantSlug') tenantSlug: string,
    @Body() dto: PortalCreateTicketDto,
  ) {
    const tenantId = await this.resolveTenantId(tenantSlug);

    // Honeypot check — if "website" field has content, it's a bot
    if (dto.website) {
      // Return fake success to not reveal detection
      return { portalToken: nanoid(21), message: 'Ticket submitted' };
    }

    // Timestamp check — form submitted too fast = bot
    if (dto._ts) {
      const loadTime = parseInt(dto._ts, 10);
      if (!isNaN(loadTime) && Date.now() - loadTime < PortalTicketController.MIN_SUBMIT_TIME_MS) {
        return { portalToken: nanoid(21), message: 'Ticket submitted' };
      }
    }

    const portalToken = nanoid(21);

    const ticket = await this.prisma.ticket.create({
      data: {
        tenantId,
        subject: dto.subject,
        description: dto.description ?? null,
        priority: dto.priority ?? 'medium',
        senderName: dto.name,
        senderEmail: dto.email,
        portalToken,
      },
      select: {
        id: true,
        portalToken: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    });

    return {
      portalToken: ticket.portalToken,
      message: 'Ticket submitted successfully',
    };
  }

  @Get(':token')
  @ApiOperation({ summary: 'Public: Track ticket status via portal token' })
  @ApiResponse({ status: 200, description: 'Ticket status returned' })
  @ApiResponse({ status: 404, description: 'Ticket not found' })
  async track(
    @Param('tenantSlug') tenantSlug: string,
    @Param('token') token: string,
  ) {
    await this.resolveTenantId(tenantSlug);

    const ticket = await this.prisma.ticket.findUnique({
      where: { portalToken: token },
      select: {
        id: true,
        subject: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
        closedAt: true,
        comments: {
          where: { isInternal: false },
          select: {
            id: true,
            body: true,
            createdAt: true,
            author: { select: { name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }
}
