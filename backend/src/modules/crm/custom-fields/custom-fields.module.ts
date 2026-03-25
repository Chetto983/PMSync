import { Module } from '@nestjs/common';
import { CustomFieldService } from './services/custom-field.service';
import { CustomFieldController } from './controllers/custom-field.controller';

@Module({
  controllers: [CustomFieldController],
  providers: [CustomFieldService],
  exports: [CustomFieldService],
})
export class CustomFieldsModule {}
