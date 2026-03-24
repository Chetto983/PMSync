import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReminderStatus } from '@prisma/client';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { ReminderService } from '../services/reminder.service';
import { CreateReminderDto } from '../dto/create-reminder.dto';
import { UpdateReminderDto } from '../dto/update-reminder.dto';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';

interface AuthenticatedRequest {
  user: { id: string; tenantId: string };
}

@ApiTags('Reminders')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('reminders')
export class ReminderController {
  constructor(private readonly reminderService: ReminderService) {}

  @Post()
  @RateTierDecorator('safe-write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a reminder (AI-parsed or structured)' })
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateReminderDto) {
    const { reminder, rispostaChat, failed } = await this.reminderService.createReminder(
      req.user.tenantId,
      req.user.id,
      dto,
    );
    return { data: { reminder, rispostaChat, failed } };
  }

  @Get()
  @ApiOperation({ summary: 'List reminders with filters' })
  @ApiQuery({ name: 'status', enum: ReminderStatus, required: false })
  @ApiQuery({ name: 'priorita', required: false })
  @ApiQuery({ name: 'periodo', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: ReminderStatus,
    @Query('priorita') priorita?: string,
    @Query('periodo') periodo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.reminderService.listReminders(
      req.user.tenantId,
      req.user.id,
      {
        status,
        priorita,
        periodo,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
      },
    );
    return { data: result.reminders, meta: { total: result.total, page: result.page, limit: result.limit } };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single reminder' })
  async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const reminder = await this.reminderService.getReminder(req.user.tenantId, req.user.id, id);
    return { data: reminder };
  }

  @Patch(':id')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update a reminder' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    const reminder = await this.reminderService.updateReminder(
      req.user.tenantId,
      req.user.id,
      id,
      dto,
    );
    return { data: reminder };
  }

  @Post(':id/complete')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Mark a reminder as completed' })
  async complete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const reminder = await this.reminderService.completeReminder(
      req.user.tenantId,
      req.user.id,
      id,
    );
    return { data: reminder };
  }

  @Delete(':id')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Delete a reminder permanently' })
  async delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const reminder = await this.reminderService.deleteReminder(
      req.user.tenantId,
      req.user.id,
      id,
    );
    return { data: reminder };
  }
}
