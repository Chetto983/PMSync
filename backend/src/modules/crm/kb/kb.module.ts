import { Module } from '@nestjs/common';
import { KBController } from './controllers/kb.controller';
import { PortalKBController } from './controllers/portal-kb.controller';
import { KBService } from './services/kb.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [KBController, PortalKBController],
  providers: [KBService],
  exports: [KBService],
})
export class KBModule {}
