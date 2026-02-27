import { Module, Global } from '@nestjs/common';
import { MistralProviderService } from './mistral-provider.service';

@Global()
@Module({
  providers: [MistralProviderService],
  exports: [MistralProviderService],
})
export class MistralModule {}
