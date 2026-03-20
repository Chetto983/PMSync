/**
 * MistralProviderService - AI model provider with dual backend:
 *   - Chat models: OpenRouter (access to Qwen, DeepSeek, GPT, Claude, etc.)
 *   - Embedding models: Mistral (mistral-embed, EU-hosted)
 *
 * Falls back to Mistral for chat if OPENROUTER_API_KEY is not set.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel, EmbeddingModel } from 'ai';

@Injectable()
export class MistralProviderService {
  private readonly logger = new Logger(MistralProviderService.name);
  private readonly mistralProvider: ReturnType<typeof createMistral>;
  private readonly openRouterProvider: ReturnType<typeof createOpenRouter> | null;
  private readonly defaultChatModel: string;
  private readonly defaultCodeModel: string;
  private readonly defaultEmbeddingModel: string;
  private readonly useOpenRouter: boolean;

  constructor(private readonly config: ConfigService) {
    // Mistral — always needed for embeddings
    const mistralKey = this.config.getOrThrow<string>('MISTRAL_API_KEY');
    this.mistralProvider = createMistral({ apiKey: mistralKey });

    // OpenRouter — optional, used for chat if configured
    const openRouterKey = this.config.get<string>('OPENROUTER_API_KEY');
    if (openRouterKey) {
      this.openRouterProvider = createOpenRouter({ apiKey: openRouterKey });
      this.useOpenRouter = true;
      this.logger.log('OpenRouter enabled for chat models');
    } else {
      this.openRouterProvider = null;
      this.useOpenRouter = false;
      this.logger.log('OpenRouter not configured, using Mistral for chat');
    }

    this.defaultChatModel = this.config.get<string>(
      'AI_CHAT_MODEL',
      this.config.get<string>(
        'MISTRAL_CHAT_MODEL',
        'qwen/qwen3.5-flash-02-23',
      ),
    );
    this.defaultCodeModel = this.config.get<string>(
      'MISTRAL_CODE_MODEL',
      'devstral-small-latest',
    );
    this.defaultEmbeddingModel = this.config.get<string>(
      'AI_EMBEDDING_MODEL',
      'mistral-embed',
    );
  }

  /** Get a chat model. Uses OpenRouter if configured, Mistral otherwise. */
  getChatModel(modelId?: string): LanguageModel {
    const id = modelId ?? this.defaultChatModel;
    if (this.useOpenRouter && this.openRouterProvider) {
      return this.openRouterProvider.chat(id, {
        // GDPR: deny data collection, sort by latency
        provider: {
          data_collection: 'deny',
          sort: 'latency',
        },
      });
    }
    return this.mistralProvider(id);
  }

  /** Get the chat model name (for ledger/logging). */
  getChatModelName(modelId?: string): string {
    return modelId ?? this.defaultChatModel;
  }

  /** Get Devstral coding model. Always uses Mistral directly. */
  getCodeModel(): LanguageModel {
    return this.mistralProvider(this.defaultCodeModel);
  }

  /** Get an embedding model. Always uses Mistral (EU-hosted). */
  getEmbeddingModel(modelId?: string): EmbeddingModel {
    return this.mistralProvider.embedding(modelId ?? this.defaultEmbeddingModel);
  }

  /** Get the embedding model name (for ledger/logging). */
  getEmbeddingModelName(): string {
    return this.defaultEmbeddingModel;
  }
}
