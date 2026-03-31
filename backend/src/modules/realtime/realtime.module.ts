import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './gateways/realtime.gateway';
import { RealtimeController } from './controllers/realtime.controller';
import { RealtimeEventsService } from './services/realtime-events.service';
import { RealtimeAuthTokenService } from './services/realtime-auth-token.service';
import { RealtimeHandshakeService } from './services/realtime-handshake.service';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * RealtimeModule - WebSocket gateway with Better Auth session authentication
 *
 * Security features:
 * - Cookie-backed Better Auth session validation during handshake
 * - Tenant-isolated rooms for event delivery
 * - User active status validation in handshake
 * - Lifecycle cleanup for timers/buffers
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [RealtimeController],
  providers: [
    RealtimeGateway,
    RealtimeEventsService,
    RealtimeAuthTokenService,
    RealtimeHandshakeService,
  ],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
