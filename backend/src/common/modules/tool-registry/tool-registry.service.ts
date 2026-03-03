import { Injectable, Logger } from '@nestjs/common';
import {
  IAiTool,
  IToolRegistryService,
} from '../../interfaces/tool-registry.interface';

/**
 * Central registry for AI tools.
 * Domain modules self-register their tools at startup via OnModuleInit.
 * AiChatModule reads from this registry instead of importing domain modules.
 */
@Injectable()
export class ToolRegistryService implements IToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, IAiTool>();

  registerTool(tool: IAiTool): void {
    if (this.tools.has(tool.name)) {
      this.logger.warn(
        `Tool "${tool.name}" already registered -- overwriting`,
      );
    }
    this.tools.set(tool.name, tool);
    this.logger.log(`Registered tool: ${tool.name}`);
  }

  getTool(name: string): IAiTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): IAiTool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}
