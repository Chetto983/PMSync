/**
 * Interface contract for AI tool registration.
 * Phase 31: Contract only. Implementation in Phase 32.
 * Used by AiChatModule to discover tools without forwardRef to domain modules.
 * Domain modules self-register their tools via this interface.
 */
export interface IAiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    input: Record<string, unknown>,
    context: IToolContext,
  ): Promise<unknown>;
}

export interface IToolContext {
  tenantId: string;
  userId: string;
  conversationId?: string;
  requestId?: string;
}

export interface IToolRegistryService {
  registerTool(tool: IAiTool): void;
  getTool(name: string): IAiTool | undefined;
  getAllTools(): IAiTool[];
  getToolNames(): string[];
}

export const TOOL_REGISTRY_SERVICE = Symbol('IToolRegistryService');
