import { Module, Global } from '@nestjs/common';
import { OpenRouterProviderService } from './openrouter-provider.service';

@Global()
@Module({
  providers: [OpenRouterProviderService],
  exports: [OpenRouterProviderService],
})
export class OpenRouterModule {}
