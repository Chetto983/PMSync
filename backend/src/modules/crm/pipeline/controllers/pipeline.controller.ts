import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { PipelineService } from '../services/pipeline.service';
import {
  CreatePipelineDto,
  UpdatePipelineDto,
  CreateStageDto,
  UpdateStageDto,
  ReorderStagesDto,
} from '../dto/pipeline.dto';
import { CreateSavedViewDto, UpdateSavedViewDto } from '../dto/saved-view.dto';

@ApiTags('CRM - Pipelines')
@ApiBearerAuth()
@Controller('crm/pipelines')
@UseGuards(TenantGuard, RolesGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  // ---- Pipeline endpoints ----

  @Get()
  @ApiOperation({ summary: 'List pipelines' })
  @ApiResponse({ status: 200, description: 'Pipelines returned successfully' })
  async list(@Req() req: any) {
    return this.pipelineService.listPipelines(req.user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pipeline by ID (includes stages)' })
  @ApiResponse({ status: 200, description: 'Pipeline returned' })
  @ApiResponse({ status: 404, description: 'Pipeline not found' })
  async findById(@Req() req: any, @Param('id') id: string) {
    return this.pipelineService.findPipelineById(req.user.tenantId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create pipeline' })
  @ApiResponse({ status: 201, description: 'Pipeline created' })
  async create(@Req() req: any, @Body() dto: CreatePipelineDto) {
    return this.pipelineService.createPipeline(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update pipeline' })
  @ApiResponse({ status: 200, description: 'Pipeline updated' })
  @ApiResponse({ status: 404, description: 'Pipeline not found' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePipelineDto,
  ) {
    return this.pipelineService.updatePipeline(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete pipeline (soft)' })
  @ApiResponse({ status: 200, description: 'Pipeline soft-deleted' })
  @ApiResponse({ status: 404, description: 'Pipeline not found' })
  @ApiResponse({ status: 400, description: 'Pipeline has active deals' })
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.pipelineService.deletePipeline(req.user.tenantId, id);
  }

  // ---- Metrics ----

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get pipeline metrics (conversion, velocity, win rate)' })
  @ApiResponse({ status: 200, description: 'Pipeline metrics returned' })
  @ApiResponse({ status: 404, description: 'Pipeline not found' })
  async getMetrics(@Req() req: any, @Param('id') id: string) {
    return this.pipelineService.getMetrics(req.user.tenantId, id);
  }

  // ---- Saved Views ----

  @Get(':id/views')
  @ApiOperation({ summary: 'List saved views for pipeline' })
  @ApiResponse({ status: 200, description: 'Saved views returned' })
  async listViews(@Req() req: any, @Param('id') pipelineId: string) {
    return this.pipelineService.listSavedViews(req.user.tenantId, pipelineId);
  }

  @Post(':id/views')
  @ApiOperation({ summary: 'Create saved view for pipeline' })
  @ApiResponse({ status: 201, description: 'Saved view created' })
  async createView(
    @Req() req: any,
    @Param('id') pipelineId: string,
    @Body() dto: CreateSavedViewDto,
  ) {
    return this.pipelineService.createSavedView(
      req.user.tenantId,
      pipelineId,
      dto,
    );
  }

  @Patch('views/:viewId')
  @ApiOperation({ summary: 'Update saved view' })
  @ApiResponse({ status: 200, description: 'Saved view updated' })
  async updateView(
    @Req() req: any,
    @Param('viewId') viewId: string,
    @Body() dto: UpdateSavedViewDto,
  ) {
    return this.pipelineService.updateSavedView(req.user.tenantId, viewId, dto);
  }

  @Delete('views/:viewId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete saved view' })
  @ApiResponse({ status: 200, description: 'Saved view deleted' })
  async deleteView(@Req() req: any, @Param('viewId') viewId: string) {
    return this.pipelineService.deleteSavedView(req.user.tenantId, viewId);
  }

  // ---- Stage endpoints ----

  @Post(':id/stages')
  @ApiOperation({ summary: 'Create stage in pipeline' })
  @ApiResponse({ status: 201, description: 'Stage created' })
  @ApiResponse({ status: 404, description: 'Pipeline not found' })
  async createStage(
    @Req() req: any,
    @Param('id') pipelineId: string,
    @Body() dto: CreateStageDto,
  ) {
    return this.pipelineService.createStage(req.user.tenantId, pipelineId, dto);
  }

  @Patch(':id/stages/reorder')
  @ApiOperation({ summary: 'Reorder stages in pipeline' })
  @ApiResponse({ status: 200, description: 'Stages reordered' })
  @ApiResponse({ status: 404, description: 'Pipeline not found' })
  async reorderStages(
    @Req() req: any,
    @Param('id') pipelineId: string,
    @Body() dto: ReorderStagesDto,
  ) {
    return this.pipelineService.reorderStages(req.user.tenantId, pipelineId, dto);
  }
}

// Separate controller for stage-level operations (no pipeline param)
@ApiTags('CRM - Stages')
@ApiBearerAuth()
@Controller('crm/stages')
@UseGuards(TenantGuard, RolesGuard)
export class StageController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update stage' })
  @ApiResponse({ status: 200, description: 'Stage updated' })
  @ApiResponse({ status: 404, description: 'Stage not found' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateStageDto,
  ) {
    return this.pipelineService.updateStage(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete stage' })
  @ApiResponse({ status: 200, description: 'Stage deleted' })
  @ApiResponse({ status: 404, description: 'Stage not found' })
  @ApiResponse({ status: 400, description: 'Stage has active deals' })
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.pipelineService.deleteStage(req.user.tenantId, id);
  }
}
