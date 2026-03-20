/**
 * MistralProviderService - Thin provider wrapping @ai-sdk/mistral.
 *
 * Exposes getChatModel() and getEmbeddingModel() for injection into
 * any service that needs LLM or embedding models. No retry logic here --
 * callers decide retry strategy based on their own context.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createMistral } from '@ai-sdk/mistral';
import type { LanguageModel, EmbeddingModel } from 'ai';

@Injectable()
export class MistralProviderService {
  private readonly provider: ReturnType<typeof createMistral>;
  private readonly defaultChatModel: string;
  private readonly defaultCodeModel: string;
  private readonly defaultEmbeddingModel: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('MISTRAL_API_KEY');
    this.provider = createMistral({ apiKey });
    this.defaultChatModel = this.config.get<string>(
      'MISTRAL_CHAT_MODEL',
      'mistral-medium-latest',
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

  /** Get a chat/completion model. Defaults to MISTRAL_CHAT_MODEL env or mistral-medium-latest. */
  getChatModel(modelId?: string): LanguageModel {
    return this.provider(modelId ?? this.defaultChatModel);
  }

  /** Get the chat model name (for ledger/logging). */
  getChatModelName(modelId?: string): string {
    return modelId ?? this.defaultChatModel;
  }

  /** Get Devstral coding model for code generation tasks. */
  getCodeModel(): LanguageModel {
    return this.provider(this.defaultCodeModel);
  }

  /** Get an embedding model. Defaults to AI_EMBEDDING_MODEL env or mistral-embed. */
  getEmbeddingModel(modelId?: string): EmbeddingModel {
    return this.provider.embedding(modelId ?? this.defaultEmbeddingModel);
  }

  /** Get the embedding model name (for ledger/logging). */
  getEmbeddingModelName(): string {
    return this.defaultEmbeddingModel;
  }
}
