import { Module } from '@nestjs/common';
import { PipelineController, StageController } from './controllers/pipeline.controller';
import { PipelineService } from './services/pipeline.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PipelineController, StageController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
