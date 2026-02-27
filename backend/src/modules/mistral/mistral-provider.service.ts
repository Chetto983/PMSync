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

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('MISTRAL_API_KEY');
    this.provider = createMistral({ apiKey });
  }

  /** Get a chat/completion model. Defaults to mistral-small-latest. */
  getChatModel(modelId?: string): LanguageModel {
    return this.provider(modelId ?? 'mistral-small-latest');
  }

  /** Get an embedding model. Defaults to mistral-embed (1024 dims). */
  getEmbeddingModel(modelId?: string): EmbeddingModel {
    return this.provider.embedding(modelId ?? 'mistral-embed');
  }
}
