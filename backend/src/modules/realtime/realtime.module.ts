import { Module, Logger } from '@nestjs/common';
import { RealtimeGateway } from './gateways/realtime.gateway';
import { RealtimeEventsService } from './services/realtime-events.service';
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
@Module({
  imports: [PrismaModule],
  providers: [RealtimeGateway, RealtimeEventsService, RealtimeHandshakeService],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
