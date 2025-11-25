import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { MistralService } from './mistral.service';
import { EmbeddingsService } from './embeddings.service';
import { ChatMistralAI } from '@langchain/mistralai';
import { z } from 'zod';

interface RunAgentOptions {
  tenantId: string;
  userId: string;
  prompt: string;
  conversationId?: string | null;
  history?: Array<{ role: string; content: string }>;
}

const isAssistantMessage = (message: any): boolean => {
  if (!message) {
    return false;
  }

  const role = message.role ?? message.type ?? message._type;
  if (typeof role === 'string') {
    const normalized = role.toLowerCase();
    if (normalized === 'assistant' || normalized === 'ai') {
      return true;
    }
  }

  if (typeof message._getType === 'function') {
    try {
      const derived = message._getType();
      return typeof derived === 'string' && derived.toLowerCase() === 'ai';
    } catch {
      return false;
    }
  }

  return false;
};

const extractMessageText = (message: any): string => {
  if (!message) {
    return '';
  }

  const content = message.content;
  if (!content) {
    return '';
  }

  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) {
          return '';
        }
        if (typeof part === 'string') {
          return part;
        }
        if (typeof part === 'object') {
          if (typeof part.text === 'string') {
            return part.text;
          }
          if (typeof part.content === 'string') {
            return part.content;
          }
          if (typeof part.message === 'string') {
            return part.message;
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
};

const extractToolSteps = (result: any) => {
  const executed =
    (Array.isArray(result?.executedTools) && result.executedTools) ||
    (Array.isArray(result?.steps) && result.steps) ||
    (Array.isArray(result?.toolInvocations) && result.toolInvocations);

  if (!executed) {
    return undefined;
  }

  const mapped = executed
    .map((entry: any) => {
      const toolName = entry?.name ?? entry?.tool ?? 'tool';
      const rawOutput =
        entry?.result ??
        entry?.output ??
        entry?.response ??
        (Array.isArray(entry?.results) ? entry.results.join('\n') : undefined);

      if (rawOutput === undefined || rawOutput === null) {
        return {
          tool: toolName,
          output: '',
        };
      }

      const output =
        typeof rawOutput === 'string' ? rawOutput : JSON.stringify(rawOutput);

      return {
        tool: toolName,
        output,
      };
    })
    .filter((item: { tool: string; output: string }) => item.output.length > 0);

  return mapped.length ? mapped : undefined;
};

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private langchainModulePromise?: Promise<typeof import('langchain')>;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mistralService: MistralService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  private async getLangChain() {
    if (!this.langchainModulePromise) {
      this.langchainModulePromise = import('langchain');
    }

    return this.langchainModulePromise;
  }

  private getApiKey(): string {
    const apiKey =
      this.configService.get<string>('MISTRAL_API_KEY') || process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error('Mistral API key is not configured');
    }
    return apiKey;
  }

  async runAgent(options: RunAgentOptions): Promise<{
    output: string;
    intermediateSteps?: Array<{ tool: string; output: string }>;
  }> {
    const { createAgent, tool } = await this.getLangChain();

    const apiKey = this.getApiKey();
    const model =
      this.configService.get<string>('MISTRAL_AGENT_MODEL') ||
      this.configService.get<string>('MISTRAL_MODEL') ||
      'mistral-large-latest';

    const chatModel = new ChatMistralAI({
      apiKey,
      model,
      temperature: 0.2,
      maxTokens: 1024,
    });

    const knowledgeSearchTool = tool(
      async ({ query, limit }: { query: string; limit?: number }) => {
        const embedding = await this.mistralService.generateEmbedding(query);
        const results = await this.embeddingsService.findSimilarContent(
          options.tenantId,
          embedding,
          limit ?? 3,
        );

        if (!results.length) {
          return 'No relevant knowledge base entries were found for this query.';
        }

        return results
          .map((item, index) => {
            const title = item.documentName || `Document ${index + 1}`;
            return `${title}:\n${item.content}`;
          })
          .join('\n\n---\n\n');
      },
      {
        name: 'knowledge_search',
        description:
          'Search the internal knowledge base for documents or emails relevant to the user question.',
        schema: z.object({
          query: z.string().describe('Natural language search query'),
          limit: z.number().int().positive().max(10).optional(),
        }),
      },
    );

    const recentEmailsTool = tool(
      async ({ limit, folder }: { limit?: number; folder?: string }) => {
        const emails = await this.prisma.email.findMany({
          where: {
            tenantId: options.tenantId,
            ...(folder ? { folder: folder.toUpperCase() } : {}),
          },
          orderBy: { receivedAt: 'desc' },
          take: Math.min(limit ?? 3, 10),
          select: {
            subject: true,
            from: true,
            snippet: true,
            folder: true,
            receivedAt: true,
          },
        });

        if (!emails.length) {
          return 'No email messages were found for this workspace.';
        }

        return emails
          .map((email) => {
            const received = email.receivedAt
              ? new Date(email.receivedAt).toISOString()
              : 'Unknown date';
            return `Subject: ${email.subject}\nFrom: ${email.from}\nFolder: ${email.folder}\nReceived: ${received}\nSnippet: ${email.snippet ?? '(no snippet available)'}`;
          })
          .join('\n\n---\n\n');
      },
      {
        name: 'recent_emails',
        description:
          'Look up recent emails for this workspace. Useful to summarize or answer questions about new messages.',
        schema: z.object({
          limit: z.number().int().positive().max(10).optional(),
          folder: z.string().optional().describe('Optional folder name (e.g. INBOX, SENT)'),
        }),
      },
    );

    const agent = createAgent({
      model: chatModel,
      tools: [knowledgeSearchTool, recentEmailsTool],
    });

    const conversationId = options.conversationId ?? null;
    await this.prisma.message.create({
      data: {
        tenantId: options.tenantId,
        userId: options.userId,
        conversationId,
        role: 'user',
        content: options.prompt,
      },
    });

    const conversationMessages = [
      ...(options.history ?? []).map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: item.content,
      })),
      { role: 'user', content: options.prompt },
    ];

    const startTime = Date.now();
    this.logger.log(
      `Agent run started for tenant=${options.tenantId} user=${options.userId} ` +
        `promptLength=${options.prompt.length} historyCount=${conversationMessages.length - 1}`,
    );

    let result: any;
    try {
      result = await agent.invoke({
        messages: conversationMessages,
      });
    } catch (error) {
      this.logger.error(
        `Agent run failed for tenant=${options.tenantId} user=${options.userId}: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `Agent run completed for tenant=${options.tenantId} user=${options.userId} in ${durationMs}ms`,
    );

    const resultKeys =
      result && typeof result === 'object' ? Object.keys(result).join(',') : 'n/a';
    const outputType = typeof result?.output;
    this.logger.debug(
      `Agent raw result metadata for tenant=${options.tenantId} user=${options.userId}: ` +
        `type=${typeof result} keys=${resultKeys} outputType=${outputType}`,
    );

    let output = '';
    if (typeof result?.output === 'string') {
      output = result.output.trim();
    } else if (typeof result === 'string') {
      output = result.trim();
    } else if (typeof result?.structuredResponse === 'string') {
      output = result.structuredResponse.trim();
    }

    if (!output && Array.isArray(result?.messages)) {
      const lastAiMessage = [...result.messages]
        .reverse()
        .find((message) => isAssistantMessage(message));
      output = extractMessageText(lastAiMessage);
    }

    if (!output && typeof result?.final_output === 'string') {
      output = result.final_output.trim();
    }

    if (!output) {
      output = 'I could not produce a response for this request.';
    }

    await this.prisma.message.create({
      data: {
        tenantId: options.tenantId,
        userId: options.userId,
        conversationId,
        role: 'assistant',
        content: output,
      },
    });

    const intermediateSteps = extractToolSteps(result);

    const response = {
      output,
      intermediateSteps,
    };

    this.logger.debug(
      `Agent response summary for tenant=${options.tenantId} user=${options.userId}: ` +
        `outputLength=${output.length} steps=${intermediateSteps?.length ?? 0}`,
    );

    return response;
  }
}
