import {
  BadRequestException,
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
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import { TasksAggregationService } from '../services/tasks-aggregation.service';
import { ManualTaskService } from '../services/manual-task.service';
import { SmartViewService } from '../services/smart-view.service';
import { normalizeManualTask } from '../services/normalizers';
import { ListTasksQueryDto } from '../dto/list-tasks-query.dto';
import { CreateManualTaskDto } from '../dto/create-task.dto';
import { UpdateManualTaskDto } from '../dto/update-task.dto';
import { CreateSmartViewDto } from '../dto/create-smart-view.dto';
import { UpdateSmartViewDto } from '../dto/update-smart-view.dto';
import { SnoozeTaskDto } from '../dto/snooze-task.dto';
import {
  TASK_SOURCE_TYPES,
  type TaskSourceType,
  type UnifiedTaskListResponseDto,
} from '../dto/unified-task.dto';

interface AuthenticatedRequest {
  user: { id: string; tenantId: string };
}

@ApiTags('Tasks')
@ApiCookieAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly aggregationService: TasksAggregationService,
    private readonly manualTaskService: ManualTaskService,
    private readonly smartViewService: SmartViewService,
  ) {}

  @Get('views')
  @ApiOperation({ summary: 'List smart views for current user' })
  async listViews(@Req() req: AuthenticatedRequest) {
    return this.smartViewService.list(req.user.tenantId, req.user.id);
  }

  @Post('views')
  @RateTierDecorator('safe-write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a smart view' })
  async createView(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateSmartViewDto,
  ) {
    return this.smartViewService.create(req.user.tenantId, req.user.id, dto);
  }

  @Patch('views/:id')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update a smart view' })
  async updateView(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSmartViewDto,
  ) {
    return this.smartViewService.update(
      req.user.tenantId,
      req.user.id,
      id,
      dto,
    );
  }

  @Delete('views/:id')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Delete a smart view' })
  async removeView(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.smartViewService.remove(req.user.tenantId, req.user.id, id);
  }

  @Patch('views/:id/pin')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Toggle pin state of a smart view' })
  async togglePin(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.smartViewService.togglePin(req.user.tenantId, req.user.id, id);
  }

  @Get()
  @ApiOperation({ summary: 'List unified tasks from all sources' })
  async list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListTasksQueryDto,
  ): Promise<UnifiedTaskListResponseDto> {
    return this.aggregationService.listTasks(
      req.user.tenantId,
      req.user.id,
      query,
    );
  }

  @Post()
  @RateTierDecorator('safe-write')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a manual task' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateManualTaskDto,
  ) {
    const result = await this.manualTaskService.create(
      req.user.tenantId,
      req.user.id,
      dto,
    );
    return { data: normalizeManualTask(result as never) };
  }

  @Patch(':sourceType/:id')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update a task' })
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('sourceType') sourceType: TaskSourceType,
    @Param('id') id: string,
    @Body() dto: UpdateManualTaskDto,
  ) {
    if (sourceType !== 'manual') {
      throw new BadRequestException(
        'Only manual tasks can be updated via this endpoint',
      );
    }
    const result = await this.manualTaskService.update(
      req.user.tenantId,
      id,
      dto,
    );
    return { data: normalizeManualTask(result as never) };
  }

  @Delete(':sourceType/:id')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Delete a task' })
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('sourceType') sourceType: TaskSourceType,
    @Param('id') id: string,
  ) {
    if (sourceType !== 'manual') {
      throw new BadRequestException(
        'Only manual tasks can be deleted via this endpoint',
      );
    }
    await this.manualTaskService.delete(req.user.tenantId, id);
    return { success: true };
  }

  @Post(':sourceType/:id/complete')
  @RateTierDecorator('safe-write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Complete a task' })
  async complete(
    @Req() req: AuthenticatedRequest,
    @Param('sourceType') sourceType: TaskSourceType,
    @Param('id') id: string,
  ) {
    if (!TASK_SOURCE_TYPES.includes(sourceType)) {
      throw new BadRequestException(`Invalid source type: ${sourceType}`);
    }
    await this.aggregationService.completeTask(
      req.user.tenantId,
      req.user.id,
      sourceType,
      id,
    );
    return { success: true };
  }

  /**
   * Phase 145.1 — Snooze a task until a future date.
   *
   * Dispatches on `sourceType`:
   *   - manual    -> ManualTaskService.update (dueDate passthrough)
   *   - follow_up -> prisma.emailFollowUp.updateMany (tenant+user+status guard)
   *   - reminder  -> prisma.reminder.update after tenant check
   *   - deal_action / ticket -> BadRequestException (snooze not supported)
   *
   * Mirrors PATCH /ai/follow-ups/:id/snooze for parity. Both endpoints remain
   * available — the follow-ups admin page still calls the /ai path, and the
   * today dashboard will call /tasks/... for unified snooze.
   */
  @Patch(':sourceType/:id/snooze')
  @RateTierDecorator('safe-write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Snooze a task until a future date' })
  async snooze(
    @Req() req: AuthenticatedRequest,
    @Param('sourceType') sourceType: TaskSourceType,
    @Param('id') id: string,
    @Body() dto: SnoozeTaskDto,
  ) {
    const dueDate = new Date(dto.dueDate);
    if (isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
      throw new BadRequestException('dueDate must be a valid future date');
    }
    if (!TASK_SOURCE_TYPES.includes(sourceType)) {
      throw new BadRequestException(`Invalid source type: ${sourceType}`);
    }
    await this.aggregationService.snoozeTask(
      req.user.tenantId,
      req.user.id,
      sourceType,
      id,
      dueDate,
    );
    return { success: true, dueDate: dueDate.toISOString() };
  }
}
