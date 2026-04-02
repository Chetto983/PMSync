import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { IsString, IsIn, MaxLength, MinLength } from 'class-validator';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { TriageOverrideService } from '../services/triage-override.service';

class CreateOverrideDto {
  @IsString()
  @IsIn(['sender', 'domain', 'thread'])
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  pattern!: string;

  @IsString()
  @IsIn([
    'always-important',
    'always-review-later',
    'always-system-alert',
    'never-follow-up',
    'always-customer-vip',
  ])
  action!: string;
}

@ApiTags('AI Triage Overrides')
@ApiCookieAuth()
@Controller('ai/triage-overrides')
@UseGuards(TenantGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TriageOverridesController {
  constructor(private readonly overrideService: TriageOverrideService) {}

  @Get()
  @ApiOperation({ summary: 'List triage overrides for current tenant' })
  @ApiResponse({ status: 200, description: 'List of overrides' })
  async list(@Req() req: AuthenticatedRequest) {
    const overrides = await this.overrideService.getOverrides(req.user.tenantId);
    return { overrides };
  }

  @Post()
  @ApiOperation({ summary: 'Create or update a triage override' })
  @ApiResponse({ status: 201, description: 'Override created' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateOverrideDto) {
    const override = await this.overrideService.addOverride(
      req.user.tenantId,
      dto.type,
      dto.pattern,
      dto.action,
    );
    return { override };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a triage override' })
  @ApiResponse({ status: 204, description: 'Override deleted' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.overrideService.removeOverride(req.user.tenantId, id);
  }
}
