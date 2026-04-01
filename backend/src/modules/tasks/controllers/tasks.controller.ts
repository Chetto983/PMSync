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
import { normalizeManualTask } from '../services/normalizers';
import type { ListTasksQueryDto } from '../dto/list-tasks-query.dto';
import type { CreateManualTaskDto } from '../dto/create-task.dto';
import type { UpdateManualTaskDto } from '../dto/update-task.dto';
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
  ) {}

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
}
