/**
 * Mistral AI Provider for VoltAgent
 *
 * Wraps the Mistral API for use with VoltAgent's agent system.
 * Model names are configurable via environment variables.
 */
import { createMistral } from '@ai-sdk/mistral';
import type { LanguageModel } from 'ai';

// Type for the Mistral provider instance
type MistralProviderInstance = ReturnType<typeof createMistral>;
// Type for model returned by provider - using ReturnType to avoid portability issues
type MistralModelInstance = ReturnType<MistralProviderInstance>;

// Validate API key at module load time
const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.warn('[MistralProvider] MISTRAL_API_KEY not configured - AI features will be disabled');
}

// Model configuration from environment variables with defaults
// CRITICAL: Medium must be smarter than small for supervisor delegation to work!
// Using mistral-small for supervisor causes it to ignore tool calls and reply directly.
const MISTRAL_MODEL_SMALL = process.env.AI_MODEL_SIMPLE || 'mistral-small-latest';
const MISTRAL_MODEL_MEDIUM = process.env.AI_MODEL_MEDIUM || 'mistral-medium-latest'; // Required for proper delegation
const MISTRAL_MODEL_LARGE = process.env.AI_MODEL_COMPLEX || 'mistral-large-latest';
// CREATIVE: Same price as SMALL ($0.1/M) but optimized for writing tasks (email composition, smart replies)
const MISTRAL_MODEL_CREATIVE = process.env.AI_MODEL_CREATIVE || 'mistral-small-creative-25-12';
// ROUTER: Ultra-cheap 3B model for intent classification (~$0.04/1M tokens)
const MISTRAL_MODEL_ROUTER = process.env.AI_MODEL_ROUTER || 'ministral-3b-latest';

// Create Mistral provider instance (lazy initialization to allow for missing API key)
let _mistralProvider: ReturnType<typeof createMistral> | null = null;

function getMistralProvider() {
  if (!_mistralProvider) {
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY environment variable is required for AI features');
    }
    _mistralProvider = createMistral({ apiKey });
  }
  return _mistralProvider;
}

// Model instances for different use cases (lazy initialization)
export function getMistralSmall(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_SMALL);
}

export function getMistralMedium(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_MEDIUM);
}

export function getMistralLarge(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_LARGE);
}

export function getMistralCreative(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_CREATIVE);
}

export function getMistralRouter(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_ROUTER);
}

// NOTE: parallelToolCalls and structuredOutputs are now passed via
// providerOptions in voltagent.service.ts generateText/streamText calls.
// @see https://ai-sdk.dev/providers/ai-sdk-providers/mistral

// Legacy exports for backward compatibility
export const mistralProvider: {
  readonly small: MistralModelInstance;
  readonly medium: MistralModelInstance;
  readonly large: MistralModelInstance;
} = {
  get small() {
    return getMistralSmall();
  },
  get medium() {
    return getMistralMedium();
  },
  get large() {
    return getMistralLarge();
  },
};

// Lazy-loaded model instances (deprecated - use getMistralModel instead)
export const mistralSmall = { get: getMistralSmall };
export const mistralMedium = { get: getMistralMedium };
export const mistralLarge = { get: getMistralLarge };

// Model selection helper
export type MistralModel = 'small' | 'medium' | 'large' | 'creative' | 'router';

export function getMistralModel(model: MistralModel = 'small'): LanguageModel {
  // Type cast required: @ai-sdk/mistral returns LanguageModelV1 which is compatible
  // with VoltAgent's LanguageModel interface at runtime, but TypeScript needs the cast.
  // Using double-cast (unknown) to bridge V1 → V2 type differences.
  switch (model) {
    case 'large':
      return getMistralLarge() as unknown as LanguageModel;
    case 'medium':
      return getMistralMedium() as unknown as LanguageModel;
    case 'creative':
      return getMistralCreative() as unknown as LanguageModel;
    case 'router':
      return getMistralRouter() as unknown as LanguageModel;
    case 'small':
    default:
      return getMistralSmall() as unknown as LanguageModel;
  }
}

// Check if Mistral is configured
export function isMistralConfigured(): boolean {
  return !!apiKey;
}

// Get configured model names (for debugging/monitoring)
export function getMistralModelConfig() {
  return {
    small: MISTRAL_MODEL_SMALL,
    medium: MISTRAL_MODEL_MEDIUM,
    large: MISTRAL_MODEL_LARGE,
    creative: MISTRAL_MODEL_CREATIVE,
    router: MISTRAL_MODEL_ROUTER,
    isConfigured: isMistralConfigured(),
  };
}
