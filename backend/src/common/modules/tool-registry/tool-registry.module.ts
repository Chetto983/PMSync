import { Global, Module } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';
import { TOOL_REGISTRY_SERVICE } from '../../interfaces/tool-registry.interface';

/**
 * Global module providing the tool registry.
 * Registered early in AppModule so domain modules can inject
 * TOOL_REGISTRY_SERVICE in their OnModuleInit without forwardRef.
 */
@Global()
@Module({
  providers: [
    ToolRegistryService,
    {
      provide: TOOL_REGISTRY_SERVICE,
      useExisting: ToolRegistryService,
    },
  ],
  exports: [ToolRegistryService, TOOL_REGISTRY_SERVICE],
})
export class ToolRegistryModule {}
