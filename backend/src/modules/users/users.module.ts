import { Module } from '@nestjs/common';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { EmailSyncModule } from '../email-sync/email-sync.module';

/**
 * UsersModule - User management and profile operations.
 *
 * Phase 32: Changed forwardRef(() => EmailSyncModule) to direct import.
 * EmailSyncModule does NOT import UsersModule, so no circular dependency exists.
 */
@Module({
  imports: [PrismaModule, AiModule, EmailSyncModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
