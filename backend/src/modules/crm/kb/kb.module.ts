import { Module } from '@nestjs/common';
import { KBController } from './controllers/kb.controller';
import { KBService } from './services/kb.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [KBController],
  providers: [KBService],
  exports: [KBService],
})
export class KBModule {}
