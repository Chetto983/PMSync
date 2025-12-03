import { Module, Logger } from '@nestjs/common';
import { RealtimeGateway } from './gateways/realtime.gateway';
import { RealtimeEventsService } from './services/realtime-events.service';
import { RealtimeHandshakeService } from './services/realtime-handshake.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * RealtimeModule - WebSocket gateway with secure JWT authentication
 *
 * Security features:
 * - Fail-fast on missing/weak JWT_SECRET (no insecure fallback)
 * - Tenant-isolated rooms for event delivery
 * - User active status validation in handshake
 * - Lifecycle cleanup for timers/buffers
 *
 * Required environment variables:
 * - JWT_SECRET: Secure secret for token validation (min 32 chars)
 *
 * @see REALTIME_MODULE_ROADMAP.md for implementation details
 */
@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        // SECURITY: Fail-fast if JWT_SECRET is missing or weak
        if (!secret || secret === 'secret' || secret.length < 32) {
          const logger = new Logger('RealtimeModule');
          logger.error(
            'FATAL: JWT_SECRET is missing, too short (<32 chars), or using unsafe default. ' +
              'WebSocket authentication will fail.',
          );
          throw new Error(
            'FATAL: JWT_SECRET is required for WebSocket authentication. ' +
              'Set a secure JWT_SECRET environment variable (min 32 characters).',
          );
        }

        return {
          secret,
          signOptions: { expiresIn: '24h' },
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [RealtimeGateway, RealtimeEventsService, RealtimeHandshakeService],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
