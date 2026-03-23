/**
 * MistralProviderService - AI model provider with dual backend:
 *   - Chat/code models: OpenRouter (Qwen 3.5 flash + plus)
 *   - Embedding models: Mistral (mistral-embed, EU-hosted)
 *   - OCR: Mistral (mistral-ocr-latest)
 *
 * OpenRouter is REQUIRED for chat. Mistral is kept only for embeddings + OCR.
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
  private readonly openRouterProvider: ReturnType<typeof createOpenRouter>;
  private readonly defaultChatModel: string;
  private readonly defaultEmbeddingModel: string;

  constructor(private readonly config: ConfigService) {
    // Mistral — kept for embeddings + OCR only
    const mistralKey = this.config.getOrThrow<string>('MISTRAL_API_KEY');
    this.mistralProvider = createMistral({ apiKey: mistralKey });

    // OpenRouter — required for all chat/completion models
    const openRouterKey = this.config.getOrThrow<string>('OPENROUTER_API_KEY');
    this.openRouterProvider = createOpenRouter({ apiKey: openRouterKey });
    this.logger.log('OpenRouter enabled for chat models (Qwen 3.5)');

    this.defaultChatModel = this.config.get<string>(
      'AI_CHAT_MODEL',
      'qwen/qwen3.5-flash-02-23',
    );
    this.defaultEmbeddingModel = this.config.get<string>(
      'AI_EMBEDDING_MODEL',
      'mistral-embed',
    );
  }

  /** Get a chat model via OpenRouter. */
  getChatModel(modelId?: string): LanguageModel {
    const id = modelId ?? this.defaultChatModel;
    return this.openRouterProvider.chat(id, {
      extraBody: {
        // Qwen uses max_tokens for reasoning budget (not effort)
        // See: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
        reasoning: { max_tokens: 4096 },
      },
      provider: {
        data_collection: 'deny',
        sort: 'latency',
      },
    });
  }

  /** Get the chat model name (for ledger/logging). */
  getChatModelName(modelId?: string): string {
    return modelId ?? this.defaultChatModel;
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
