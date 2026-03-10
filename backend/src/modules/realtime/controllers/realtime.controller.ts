import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest } from '../../../common/types/request.types';
import { RealtimeAuthTokenService } from '../services/realtime-auth-token.service';

@ApiTags('Realtime')
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtimeAuthTokenService: RealtimeAuthTokenService,
  ) {}

  @Get('auth-token')
  @ApiOperation({
    summary: 'Issue a short-lived realtime websocket auth token',
  })
  @ApiResponse({
    status: 200,
    description: 'Realtime auth token issued successfully',
  })
  getAuthToken(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.userId;
    const sessionId = request.user?.sessionId;
    const tenantId = request.user?.tenantId;

    if (!userId || !sessionId || !tenantId) {
      throw new UnauthorizedException('Session context unavailable');
    }

    return this.realtimeAuthTokenService.issueToken({
      userId,
      sessionId,
      tenantId,
    });
  }
}
