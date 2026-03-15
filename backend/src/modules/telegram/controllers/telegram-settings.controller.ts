import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { PrismaService } from '../../../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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

  @Delete()
  @ApiOperation({ summary: 'Disconnect Telegram' })
  async disconnect(@Req() req: AuthenticatedRequest) {
    await this.prisma.telegramSettings.deleteMany({
      where: { userId: req.user.id },
    });
    return { data: null };
  }
}
