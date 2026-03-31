import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import { TenantGuard } from '../../../common/auth/tenant.guard';
import { RolesGuard } from '../../../common/auth/roles.guard';
import { Roles } from '../../../common/auth/roles.decorator';
import { RateTierDecorator } from '../../../common/decorators/rate-tier.decorator';
import { ScheduledEmailService } from '../services/scheduled-email.service';
import { RescheduleEmailDto, ScheduledEmailResponseDto } from '../dto/scheduled-email.dto';
import { AuthenticatedRequest } from '../../../common/types/request.types';

@ApiTags('Scheduled Emails')
@ApiCookieAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('emails/scheduled')
export class ScheduledEmailsController {
  constructor(private scheduledEmailService: ScheduledEmailService) {}

  @Get()
  @ApiOperation({ summary: 'List all scheduled emails' })
  @ApiResponse({ status: 200, type: [ScheduledEmailResponseDto] })
  async findAll(@Request() req: AuthenticatedRequest) {
    return this.scheduledEmailService.getScheduledEmails(req.user.tenantId);
  }

  @Delete(':id')
  @Roles('admin', 'manager', 'super-admin')
  @RateTierDecorator('destructive-write')
  @ApiOperation({ summary: 'Cancel a pending scheduled email' })
  @ApiResponse({ status: 200, description: 'Email cancelled' })
  @ApiResponse({ status: 404, description: 'Email not found or not pending' })
  async cancel(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const cancelled = await this.scheduledEmailService.cancelScheduledEmail(id, req.user.tenantId);
    if (!cancelled) {
      throw new NotFoundException('Scheduled email not found or not in pending status');
    }
    return { success: true, message: 'Scheduled email cancelled' };
  }

  @Patch(':id')
  @Roles('admin', 'manager', 'super-admin')
  @ApiOperation({ summary: 'Reschedule a pending email' })
  @ApiResponse({ status: 200, type: ScheduledEmailResponseDto })
  @ApiResponse({ status: 404, description: 'Email not found or not pending' })
  async reschedule(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RescheduleEmailDto,
  ) {
    const result = await this.scheduledEmailService.rescheduleEmail(
      id,
      req.user.tenantId,
      new Date(dto.scheduledAt),
    );
    if (!result) {
      throw new NotFoundException('Scheduled email not found or not in pending status');
    }
    return result;
  }
}
