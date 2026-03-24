import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../common/auth/tenant.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { PushService } from './push.service';
import { RateTierDecorator } from '../../common/decorators/rate-tier.decorator';
import {
  CreatePushSubscriptionDto,
  DeletePushSubscriptionDto,
} from './dto/push-subscription.dto';

interface AuthenticatedRequest {
  user: { id: string; tenantId: string };
  headers: Record<string, string | undefined>;
}

@ApiTags('Push')
@ApiBearerAuth()
@UseGuards(TenantGuard, RolesGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('subscribe')
  @RateTierDecorator('safe-write')
  @ApiOperation({ summary: 'Register a push subscription' })
  async subscribe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreatePushSubscriptionDto,
  ) {
    await this.pushService.subscribe(
      req.user.tenantId,
      req.user.id,
      dto,
      req.headers['user-agent'],
    );
    return { data: null };
  }

  @Delete('subscribe')
  @RateTierDecorator('safe-write')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a push subscription' })
  async unsubscribe(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DeletePushSubscriptionDto,
  ) {
    await this.pushService.unsubscribe(req.user.tenantId, dto.endpoint);
  }
}
