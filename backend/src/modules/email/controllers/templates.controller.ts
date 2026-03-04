import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { EmailTemplateService } from '../services/email-template.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  TemplateResponseDto,
  TemplateListResponseDto,
} from '../dto/template.dto';
import { AuthenticatedRequest } from '../../../common/types/request.types';

@ApiTags('Email Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('emails/templates')
export class TemplatesController {
  constructor(private templateService: EmailTemplateService) {}

  @Get()
  @ApiOperation({ summary: 'List all email templates' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiResponse({ status: 200, type: TemplateListResponseDto })
  async findAll(@Request() req: AuthenticatedRequest, @Query('category') category?: string) {
    return this.templateService.findAll(req.user.tenantId, req.user.id, category);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get unique template categories' })
  @ApiResponse({ status: 200, type: [String] })
  async getCategories(@Request() req: AuthenticatedRequest) {
    return this.templateService.getCategories(req.user.tenantId, req.user.id);
  }

  @Get('default')
  @ApiOperation({ summary: 'Get default template' })
  @ApiResponse({ status: 200, type: TemplateResponseDto, description: 'Default template or null' })
  async findDefault(@Request() req: AuthenticatedRequest) {
    return this.templateService.findDefault(req.user.tenantId, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a template by ID' })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async findOne(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.templateService.findOne(req.user.tenantId, req.user.id, id);
  }

  @Post()
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create a new email template' })
  @ApiResponse({ status: 201, type: TemplateResponseDto })
  async create(@Request() req: AuthenticatedRequest, @Body() dto: CreateTemplateDto) {
    return this.templateService.create(req.user.tenantId, req.user.id, dto);
  }

  @Patch(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update a template' })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Delete a template' })
  @ApiResponse({ status: 200 })
  async delete(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.templateService.delete(req.user.tenantId, req.user.id, id);
  }

  @Post(':id/set-default')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Set template as default' })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async setDefault(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.templateService.setDefault(req.user.tenantId, req.user.id, id);
  }

  @Post(':id/duplicate')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Duplicate a template' })
  @ApiQuery({ name: 'name', required: false, description: 'Name for the duplicated template' })
  @ApiResponse({ status: 201, type: TemplateResponseDto })
  async duplicate(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('name') name?: string,
  ) {
    return this.templateService.duplicate(req.user.tenantId, req.user.id, id, name);
  }
}
