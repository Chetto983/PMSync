import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PushDispatchHandler } from './push-dispatch.handler';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [PushController],
  providers: [PushService, PushDispatchHandler],
  exports: [PushService],
})
export class PushModule {}
