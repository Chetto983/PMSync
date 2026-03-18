import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from '../../../common/interfaces/tool-registry.interface';

/**
 * ConversationToolsService -- Structured conversation tools for AI chat.
 *
 * Tools: ask_user
 *
 * ask_user enables the LLM to ask structured clarifying questions
 * instead of guessing when parameters are ambiguous.
 *
 * Phase AI-AUDIT: New tool for disambiguation workflow.
 */
const schemas = {
  ask_user: z.object({
    question: z.string().describe('The question to ask the user'),
    options: z.array(z.string()).optional().describe('Suggested options for the user to choose from'),
    context: z.string().optional().describe('Brief context about why you are asking'),
  }),
};

@Injectable()
export class ConversationToolsService implements OnModuleInit {
  private readonly logger = new Logger(ConversationToolsService.name);

  constructor(
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    this.toolRegistry.registerTool({
      name: 'ask_user', description: 'ask_user', parameters: {}, execute: noop,
      domain: 'system', riskLevel: 'LOW', requiresApproval: false, inputSchema: schemas.ask_user,
    });
  }

  /**
   * Returns conversation tools.
   * These tools don't need PII resolution (no user data in/out).
   */
  getTools() {
    return {
      ask_user: this.buildAskUser(),
    };
  }

  private buildAskUser() {
    return tool({
      description:
        'Ask the user a clarifying question when you need more information to proceed. ' +
        'Use when: multiple emails match a query, recipient is ambiguous, date is unclear, ' +
        'or you need confirmation for a bulk operation. ' +
        'Present clear options when possible (e.g., "Did you mean: A, B, or C?"). ' +
        'Returns the question back as a structured clarification request for the frontend.',
      inputSchema: schemas.ask_user,
      execute: async (args) => {
        this.logger.debug(`ask_user: "${args.question}"`);

        return {
          type: 'clarification_request' as const,
          question: args.question,
          options: args.options ?? [],
          context: args.context ?? null,
        };
      },
    });
  }
}
