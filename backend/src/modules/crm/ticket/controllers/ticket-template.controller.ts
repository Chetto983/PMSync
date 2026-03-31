import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { Request } from 'express';
import { TicketTemplateService } from '../services/ticket-template.service';

class CreateTicketTemplateDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(10000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;
}

class UpdateTicketTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;
}

@ApiTags('CRM - Ticket Templates')
@Controller('crm/ticket-templates')
export class TicketTemplateController {
  constructor(private readonly templateService: TicketTemplateService) {}

  @Get()
  @ApiOperation({ summary: 'List canned response templates' })
  @ApiQuery({ name: 'category', required: false })
  async list(@Req() req: Request, @Query('category') category?: string) {
    const tenantId = (req as any).user.tenantId;
    return this.templateService.list(tenantId, category);
  }

  @Post()
  @ApiOperation({ summary: 'Create a canned response template' })
  async create(@Req() req: Request, @Body() dto: CreateTicketTemplateDto) {
    const tenantId = (req as any).user.tenantId;
    return this.templateService.create(tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a canned response template' })
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateTicketTemplateDto,
  ) {
    const tenantId = (req as any).user.tenantId;
    return this.templateService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a canned response template' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user.tenantId;
    return this.templateService.delete(tenantId, id);
  }
}
