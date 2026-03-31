import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { LabelsService } from '../services/labels.service';
import {
  AddEmailsToLabelDto,
  BulkDeleteLabelsDto,
  CreateLabelDto,
  ReorderLabelsDto,
  UpdateLabelDto,
} from '../dto/labels.dto';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { FeatureFlag } from '../../../common/decorators/feature-flag.decorator';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import { FeatureFlagGuard } from '../../../common/guards/feature-flag.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';

@ApiTags('Labels')
@ApiCookieAuth()
@Controller('labels')
@UseGuards(TenantGuard, RolesGuard, FeatureFlagGuard)
@FeatureFlag('userLabels')
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=60, stale-while-revalidate=120')
  @ApiOperation({ summary: 'List all labels', description: 'Returns all user labels for the tenant' })
  @ApiResponse({ status: 200, description: 'Labels returned successfully' })
  async listLabels(@Req() req: AuthenticatedRequest) {
    const labels = await this.labelsService.findAllByTenant(req.user.tenantId);
    return { labels };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get label by ID', description: 'Returns a specific label' })
  @ApiParam({ name: 'id', description: 'Label ID' })
  @ApiResponse({ status: 200, description: 'Label returned successfully' })
  @ApiResponse({ status: 404, description: 'Label not found' })
  async getLabel(@Req() req: AuthenticatedRequest, @Param('id') labelId: string) {
    const label = await this.labelsService.findOne(req.user.tenantId, labelId);
    return { label };
  }

  @Post()
  @Roles('super-admin', 'admin', 'manager')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Create label', description: 'Creates a new user label' })
  @ApiBody({ type: CreateLabelDto })
  @ApiResponse({ status: 201, description: 'Label created successfully' })
  async createLabel(@Req() req: AuthenticatedRequest, @Body() dto: CreateLabelDto) {
    const label = await this.labelsService.create(req.user.tenantId, dto);
    return { label };
  }

  @Put(':id')
  @Roles('super-admin', 'admin', 'manager')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Update label', description: 'Updates an existing label' })
  @ApiParam({ name: 'id', description: 'Label ID' })
  @ApiBody({ type: UpdateLabelDto })
  @ApiResponse({ status: 200, description: 'Label updated successfully' })
  async updateLabel(
    @Req() req: AuthenticatedRequest,
    @Param('id') labelId: string,
    @Body() dto: UpdateLabelDto,
  ) {
    const label = await this.labelsService.update(req.user.tenantId, labelId, dto);
    return { label };
  }

  @Delete(':id')
  @Roles('super-admin', 'admin', 'manager')
  @RateTierDecorator('destructive-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete label', description: 'Deletes a user label' })
  @ApiParam({ name: 'id', description: 'Label ID' })
  @ApiResponse({ status: 204, description: 'Label deleted successfully' })
  async deleteLabel(@Req() req: AuthenticatedRequest, @Param('id') labelId: string) {
    await this.labelsService.delete(req.user.tenantId, labelId);
  }

  @Post(':id/emails')
  @Roles('super-admin', 'admin', 'manager')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Add emails to label', description: 'Adds one or more emails to a label' })
  @ApiParam({ name: 'id', description: 'Label ID' })
  @ApiBody({ type: AddEmailsToLabelDto })
  @ApiResponse({ status: 200, description: 'Emails added to label' })
  async addEmails(
    @Req() req: AuthenticatedRequest,
    @Param('id') labelId: string,
    @Body() dto: AddEmailsToLabelDto,
  ) {
    const result = await this.labelsService.addEmailsToLabel(req.user.tenantId, labelId, dto);
    return result;
  }

  @Delete(':id/emails/:emailId')
  @Roles('super-admin', 'admin', 'manager')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Remove email from label', description: 'Removes an email from a label' })
  @ApiParam({ name: 'id', description: 'Label ID' })
  @ApiParam({ name: 'emailId', description: 'Email ID' })
  @ApiResponse({ status: 200, description: 'Email removed from label' })
  async removeEmail(
    @Req() req: AuthenticatedRequest,
    @Param('id') labelId: string,
    @Param('emailId') emailId: string,
  ) {
    const email = await this.labelsService.removeEmailFromLabel(req.user.tenantId, labelId, emailId);
    return { email };
  }

  @Get(':id/emails')
  @ApiOperation({ summary: 'Get emails by label', description: 'Returns all emails with this label' })
  @ApiParam({ name: 'id', description: 'Label ID' })
  @ApiResponse({ status: 200, description: 'Emails returned successfully' })
  async getEmails(@Req() req: AuthenticatedRequest, @Param('id') labelId: string) {
    const emails = await this.labelsService.getEmailsForLabel(req.user.tenantId, labelId);
    return { emails };
  }

  @Post('bulk-delete')
  @Roles('super-admin', 'admin', 'manager')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Bulk delete labels', description: 'Soft-deletes multiple labels at once' })
  @ApiBody({ type: BulkDeleteLabelsDto })
  @ApiResponse({ status: 200, description: 'Labels deleted successfully' })
  async bulkDelete(@Req() req: AuthenticatedRequest, @Body() dto: BulkDeleteLabelsDto) {
    const result = await this.labelsService.bulkDelete(req.user.tenantId, dto.labelIds);
    return result;
  }

  @Post('reorder')
  @Roles('super-admin', 'admin', 'manager')
  @RateTierDecorator('safe-write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorder labels', description: 'Reorders user labels' })
  @ApiBody({ type: ReorderLabelsDto })
  @ApiResponse({ status: 204, description: 'Labels reordered successfully' })
  async reorder(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ReorderLabelsDto,
  ) {
    await this.labelsService.reorder(req.user.tenantId, dto);
  }
}
