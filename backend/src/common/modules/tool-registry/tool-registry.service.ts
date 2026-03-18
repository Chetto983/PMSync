import { Injectable, Logger } from '@nestjs/common';
import {
  IAiTool,
  IToolRegistryService,
} from '../../interfaces/tool-registry.interface';

/**
 * Central registry for AI tools.
 * Domain modules self-register their tools at startup via OnModuleInit.
 * AiChatModule reads from this registry instead of importing domain modules.
 *
 * Phase 77: Validates governance metadata (domain, riskLevel, requiresApproval, inputSchema)
 * at registration time. Tools missing metadata fail fast at startup.
 */
@Injectable()
export class ToolRegistryService implements IToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, IAiTool>();

  registerTool(tool: IAiTool): void {
    // Phase 77: Validate governance metadata at registration time
    const requiredFields = [
      'domain',
      'riskLevel',
      'requiresApproval',
      'inputSchema',
    ] as const;
    const missingFields = requiredFields.filter(
      (field) => tool[field] === undefined || tool[field] === null,
    );

    if (missingFields.length > 0) {
      throw new Error(
        `Tool "${tool.name}" missing required governance metadata: ${missingFields.join(', ')}`,
      );
    }

    if (this.tools.has(tool.name)) {
      this.logger.warn(
        `Tool "${tool.name}" already registered -- overwriting`,
      );
    }
    this.tools.set(tool.name, tool);
    this.logger.log(
      `Registered tool: ${tool.name} (domain=${tool.domain}, risk=${tool.riskLevel}, approval=${tool.requiresApproval})`,
    );
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
