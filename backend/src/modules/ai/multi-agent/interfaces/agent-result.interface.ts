import { AgentAction } from './agent-action.interface';

export interface KnowledgeHitSummary {
  id: string;
  subject: string | null;
  snippet: string;
  source?: string | null;
  score?: number | null;
  emailId?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Result returned by an agent after processing
 */
export interface AgentResult {
  /** User-facing messages to display */
  messages: string[];

  /** Actions proposed by the agent (may require HITL approval) */
  actions: AgentAction[];

  /** Metadata about the processing */
  metadata?: {
    intent?: string;
    agentUsed?: string;
    executionTimeMs?: number;
    toolsUsed?: string[];
    tokensUsed?: number;
    knowledgeHits?: KnowledgeHitSummary[];
  };

  /** Knowledge search hits (for RAG cards) */
  knowledgeHits?: KnowledgeHitSummary[];

  /** Intermediate steps/tool calls for transparency */
  intermediateSteps?: Array<{
    tool: string;
    input?: Record<string, any>;
    output: string;
  }>;

  /** Whether the agent needs more information */
  needsMoreInfo?: boolean;
  clarifyingQuestions?: string[];

  /** Raw LLM response (for debugging) */
  rawResponse?: string;
}

/**
 * Extended result with pending actions after HITL evaluation
 */
export interface AgentResultWithPending extends AgentResult {
  /** Actions that were auto-executed (high confidence) */
  autoExecutedActions?: AgentAction[];

  /** Actions pending user approval */
  pendingActions?: Array<{
    id: string;
    type: string;
    status: string;
    confidence: number;
    severity: string;
    payload: Record<string, any>;
    createdAt: Date;
  }>;
}

/**
 * Streaming chunk for real-time updates
 */
export interface AgentStreamChunk {
  type: 'text' | 'tool_start' | 'tool_end' | 'action_proposed' | 'complete' | 'error';
  content?: string;
  tool?: string;
  toolInput?: Record<string, any>;
  toolOutput?: string;
  action?: AgentAction;
  error?: string;
}
