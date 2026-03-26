import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { CustomFieldService } from './services/custom-field.service';
import { SegmentService } from './services/segment.service';
import { CustomFieldController } from './controllers/custom-field.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CustomFieldController],
  providers: [CustomFieldService, SegmentService],
  exports: [CustomFieldService, SegmentService],
})
export class CustomFieldsModule {}
