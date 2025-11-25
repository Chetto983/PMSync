/**
 * Intents that can be classified by the RouterAgent
 */
export enum AgentIntent {
  EMAIL = 'EMAIL', // Email-related tasks
  CALENDAR = 'CALENDAR', // Calendar/scheduling tasks
  CONTACTS = 'CONTACTS', // Contact management
  KNOWLEDGE = 'KNOWLEDGE', // Knowledge base queries
  GENERAL = 'GENERAL', // General chat/questions
  MULTI = 'MULTI', // Multiple intents detected
  UNKNOWN = 'UNKNOWN', // Could not classify
}

/**
 * Context passed to agents for processing
 */
export interface AgentContext {
  /** Tenant ID for multi-tenancy */
  tenantId: string;

  /** User ID */
  userId: string;

  /** Chat session ID (optional) */
  sessionId?: string;

  /** The user's message/request */
  userMessage: string;

  /** Classified intent (set by RouterAgent) */
  intent?: AgentIntent;

  /** Confidence of intent classification */
  intentConfidence?: number;

  /** Conversation history */
  history?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: Date;
  }>;

  /** Additional context from RAG or previous tools */
  enrichedContext?: {
    relevantEmails?: Array<{
      id: string;
      subject: string;
      from: string;
      snippet: string;
      receivedAt: Date;
    }>;
    relevantContacts?: Array<{
      id: string;
      name: string;
      email: string;
      company?: string;
    }>;
    relevantEvents?: Array<{
      id: string;
      title: string;
      startTime: Date;
      endTime: Date;
    }>;
    knowledgeResults?: Array<{
      content: string;
      source: string;
      similarity: number;
    }>;
  };

  /** User preferences */
  preferences?: {
    language?: string;
    timezone?: string;
    autoApproveThreshold?: number; // Confidence threshold for auto-execution
    // AI feature flags from user settings
    aiSmartRepliesEnabled?: boolean;
    aiSummarizationEnabled?: boolean;
    aiSchedulingEnabled?: boolean;
  };

  /** Provider context */
  providers?: Array<{
    id: string;
    type: string;
    email: string;
    supportsEmail: boolean;
    supportsCalendar: boolean;
    supportsContacts: boolean;
  }>;

  /** Personalization context for tailored responses */
  personalization?: {
    profile: {
      jobRole: string;
      jobTitle?: string;
      department?: string;
      industry?: string;
      companySize?: string;
      communicationStyle: string;
      responseLength: string;
      proactivityLevel: string;
      workingHoursStart?: string;
      workingHoursEnd?: string;
      workingDays?: string[];
      timezone: string;
      language: string;
    };
    promptModifiers: string;
    recentMemories: Array<{
      content: string;
      type: string;
      relevance: number;
    }>;
  };
}

/**
 * Minimal context for agent canHandle check
 */
export interface AgentCanHandleContext {
  userMessage: string;
  intent?: AgentIntent;
  intentConfidence?: number;
}
