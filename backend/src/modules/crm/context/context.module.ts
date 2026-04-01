import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ContextController } from './controllers/context.controller';
import { ContextService } from './services/context.service';

@Module({
  imports: [PrismaModule],
  controllers: [ContextController],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
