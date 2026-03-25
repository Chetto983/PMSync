import { Module } from '@nestjs/common';
import { DealController } from './controllers/deal.controller';
import { DealService } from './services/deal.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DealController],
  providers: [DealService],
  exports: [DealService],
})
export class DealModule {}
