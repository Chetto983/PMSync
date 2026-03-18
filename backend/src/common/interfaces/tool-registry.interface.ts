/**
 * Interface contract for AI tool registration.
 * Phase 31: Contract only. Implementation in Phase 32.
 * Phase 77: Extended with governance metadata (domain, riskLevel, requiresApproval, inputSchema).
 *
 * Used by AiChatModule to discover tools without forwardRef to domain modules.
 * Domain modules self-register their tools via this interface.
 */

/**
 * Tool domain classification -- matches tool service file boundaries.
 */
export type ToolDomain =
  | 'email'
  | 'calendar'
  | 'contacts'
  | 'knowledge'
  | 'productivity'
  | 'system';

/**
 * Risk level taxonomy (3-tier):
 * - LOW: read-only, no side effects
 * - MEDIUM: reversible mutations
 * - HIGH: irreversible or external side effects
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface IAiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    input: Record<string, unknown>,
    context: IToolContext,
  ): Promise<unknown>;

  // Governance metadata -- optional in TypeScript type, enforced at runtime by registerTool()
  domain?: ToolDomain;
  riskLevel?: RiskLevel;
  requiresApproval?: boolean;
  inputSchema?: unknown;
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
