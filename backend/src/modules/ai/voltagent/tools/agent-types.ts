/**
 * Mistral Agent Type Constants
 *
 * Defines the types of Mistral agents used by MailAgent.
 * These are stored in PostgreSQL for persistence and GDPR compliance.
 */

/**
 * Agent types for Mistral agents stored in PostgreSQL
 */
export const MistralAgentType = {
  WEB_SEARCH: 'web-search',
  ANALYTICS: 'analytics',
} as const;

export type MistralAgentTypeValue = (typeof MistralAgentType)[keyof typeof MistralAgentType];

/**
 * All agent types for iteration (e.g., GDPR cleanup)
 */
export const ALL_MISTRAL_AGENT_TYPES: MistralAgentTypeValue[] = [
  MistralAgentType.WEB_SEARCH,
  MistralAgentType.ANALYTICS,
];
