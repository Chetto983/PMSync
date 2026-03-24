import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { randomBytes } from 'crypto';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { PrismaService } from '../../../prisma/prisma.service';
import { CacheService, CacheNamespace } from '../../../common/services/cache.service';

class UpdateTelegramSettingsDto {
  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Must be HH:mm format' })
  slotMattina?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Must be HH:mm format' })
  slotPomeriggio?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Must be HH:mm format' })
  slotSera?: string;
}

interface AuthenticatedRequest {
  user: { id: string; tenantId: string };
}

@ApiTags('Telegram')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('telegram/settings')
export class TelegramSettingsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get Telegram settings for current user' })
  async get(@Req() req: AuthenticatedRequest) {
    const settings = await this.prisma.telegramSettings.findUnique({
      where: { userId: req.user.id },
    });
    return { data: settings };
  }

  @Put()
  @ApiOperation({ summary: 'Update Telegram settings' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateTelegramSettingsDto,
  ) {
    const settings = await this.prisma.telegramSettings.upsert({
      where: { userId: req.user.id },
      create: {
        tenantId: req.user.tenantId,
        userId: req.user.id,
        telegramChatId: dto.telegramChatId ?? null,
        isActive: dto.isActive ?? false,
        slotMattina: dto.slotMattina ?? '08:30',
        slotPomeriggio: dto.slotPomeriggio ?? '14:00',
        slotSera: dto.slotSera ?? '18:00',
      },
      update: {
        ...(dto.telegramChatId !== undefined && { telegramChatId: dto.telegramChatId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.slotMattina !== undefined && { slotMattina: dto.slotMattina }),
        ...(dto.slotPomeriggio !== undefined && { slotPomeriggio: dto.slotPomeriggio }),
        ...(dto.slotSera !== undefined && { slotSera: dto.slotSera }),
      },
    });
    return { data: settings };
  }

  /**
   * Generate a QR link token for Telegram bot binding.
   * Returns a deep link: https://t.me/PMSAgent_Bot?start={token}
   * Token is stored in Redis with 5 min TTL, keyed to tenantId + userId.
   */
  @Post('link-token')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Generate Telegram QR link token' })
  async generateLinkToken(@Req() req: AuthenticatedRequest) {
    const token = randomBytes(16).toString('hex');

    await this.cache.set(
      token,
      { tenantId: req.user.tenantId, userId: req.user.id },
      { namespace: CacheNamespace.TELEGRAM_LINK, ttl: 300 },
    );

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'PMSAgent_Bot';
    const deepLink = `https://t.me/${botUsername}?start=${token}`;

    return { data: { token, deepLink, expiresIn: 300 } };
  }

  /**
   * Check if the current user's Telegram has been linked (poll from frontend).
   */
  @Get('link-status')
  @ApiOperation({ summary: 'Check if Telegram is linked' })
  async checkLinkStatus(@Req() req: AuthenticatedRequest) {
    const settings = await this.prisma.telegramSettings.findUnique({
      where: { userId: req.user.id },
      select: { telegramChatId: true, isActive: true },
    });

    return {
      data: {
        linked: !!settings?.telegramChatId,
        active: settings?.isActive ?? false,
      },
    };
  }

  @Delete()
  @ApiOperation({ summary: 'Disconnect Telegram' })
  async disconnect(@Req() req: AuthenticatedRequest) {
    await this.prisma.telegramSettings.deleteMany({
      where: { userId: req.user.id },
    });
    return { data: null };
  }
}
