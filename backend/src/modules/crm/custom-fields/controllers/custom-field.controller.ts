/**
 * CRM Custom Fields Controller
 *
 * Endpoints:
 * - GET    /crm/custom-fields?entity=account     — List fields
 * - POST   /crm/custom-fields                     — Create field
 * - PATCH  /crm/custom-fields/:id                 — Update field
 * - DELETE /crm/custom-fields/:id                 — Delete field
 * - GET    /crm/custom-fields/values/:entityId    — Get values for entity
 * - PUT    /crm/custom-fields/values/:entityId    — Set values for entity
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { TenantGuard } from '../../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../../common/auth/roles.guard';
import { Roles } from '../../../../common/auth/roles.decorator';
import { CustomFieldService } from '../services/custom-field.service';
import { SegmentService, SegmentGroup } from '../services/segment.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  SetCustomFieldValuesDto,
  CustomFieldEntity,
  CUSTOM_FIELD_ENTITIES,
} from '../dto/custom-field.dto';

@ApiTags('CRM Custom Fields')
@Controller('crm/custom-fields')
@UseGuards(TenantGuard, RolesGuard)
export class CustomFieldController {
  constructor(
    private readonly customFieldService: CustomFieldService,
    private readonly segmentService: SegmentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List custom fields' })
  @ApiQuery({ name: 'entity', required: false, enum: CUSTOM_FIELD_ENTITIES })
  @ApiResponse({ status: 200, description: 'Custom fields list' })
  async list(
    @Req() req: any,
    @Query('entity') entity?: CustomFieldEntity,
  ) {
    return this.customFieldService.listFields(req.user.tenantId, entity);
  }

  @Post()
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Create custom field' })
  @ApiResponse({ status: 201, description: 'Custom field created' })
  async create(@Req() req: any, @Body() dto: CreateCustomFieldDto) {
    return this.customFieldService.createField(req.user.tenantId, dto);
  }

  @Patch(':id')
  @Roles('admin', 'super-admin')
  @ApiOperation({ summary: 'Update custom field' })
  @ApiResponse({ status: 200, description: 'Custom field updated' })
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.customFieldService.updateField(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'super-admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete custom field and all its values' })
  @ApiResponse({ status: 204, description: 'Custom field deleted' })
  async delete(@Req() req: any, @Param('id') id: string) {
    await this.customFieldService.deleteField(req.user.tenantId, id);
  }

  @Get('values/:entityId')
  @ApiOperation({ summary: 'Get custom field values for an entity' })
  @ApiResponse({ status: 200, description: 'Custom field values' })
  async getValues(@Req() req: any, @Param('entityId') entityId: string) {
    return this.customFieldService.getValues(req.user.tenantId, entityId);
  }

  @Put('values/:entityId')
  @ApiOperation({ summary: 'Set custom field values for an entity' })
  @ApiResponse({ status: 200, description: 'Custom field values set' })
  async setValues(
    @Req() req: any,
    @Param('entityId') entityId: string,
    @Body() dto: SetCustomFieldValuesDto,
  ) {
    return this.customFieldService.setValues(
      req.user.tenantId,
      entityId,
      dto.values,
    );
  }

  @Post('segment/query')
  @ApiOperation({ summary: 'Query contacts matching segment rules' })
  @ApiResponse({ status: 200, description: 'Matching contacts' })
  async querySegment(
    @Req() req: any,
    @Body() body: { segment: SegmentGroup; limit?: number; offset?: number },
  ) {
    return this.segmentService.querySegment(req.user.tenantId, body.segment, {
      limit: body.limit,
      offset: body.offset,
    });
  }

  @Post('segment/count')
  @ApiOperation({ summary: 'Count contacts matching segment rules' })
  @ApiResponse({ status: 200, description: 'Count of matching contacts' })
  async countSegment(
    @Req() req: any,
    @Body() body: { segment: SegmentGroup },
  ) {
    const count = await this.segmentService.countSegment(
      req.user.tenantId,
      body.segment,
    );
    return { count };
  }
}
