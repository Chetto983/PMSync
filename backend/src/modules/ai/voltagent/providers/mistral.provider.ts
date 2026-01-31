/**
 * Mistral AI Provider for VoltAgent
 *
 * Wraps the Mistral API for use with VoltAgent's agent system.
 * Model names are configurable via environment variables.
 *
 * Model Tiers (2026-01-29 Audit - Updated Pricing):
 *
 * | Tier      | Model ID                    | Input $/M | Output $/M | Speed   | Use Case                |
 * |-----------|----------------------------|-----------|------------|---------|-------------------------|
 * | ROUTER    | ministral-3b-latest        | $0.04     | $0.04      | ⚡⚡ Fastest | Intent classification, triage |
 * | SMALL     | mistral-small-3-1-2503     | $0.03     | $0.11      | ⚡ Fast | Agent orchestration, tools |
 * | CREATIVE  | mistral-small-creative     | $0.10     | $0.30      | ⚡ Fast | Email composition (NO tools) |
 * | LARGE     | mistral-large-3-2512       | $0.50     | $1.50      | Medium  | Complex reasoning       |
 * | REASONING | magistral-small-2509       | $0.50     | $1.50      | Medium  | Extended thinking [THINK] |
 *
 * ⚠️ IMPORTANT: mistral-medium is SLOW and EXPENSIVE!
 * Use mistral-small-3-1 for orchestration (13x cheaper, faster, supports tools)
 *
 * @see https://docs.mistral.ai/models/
 * @see https://pricepertoken.com/pricing-page/provider/mistral-ai
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
// 2026-01-29: Updated to use faster, cheaper models based on pricing audit
//
// IMPORTANT: mistral-small-3-1-2503 ($0.03/$0.11) replaces mistral-medium ($0.40/$2.00)
// for orchestration - it's 13x cheaper AND faster while still supporting tool calls!
//
// Model defaults (override via .env):
const MISTRAL_MODEL_SMALL = process.env.AI_MODEL_SIMPLE || 'mistral-small-3-1-2503-latest';
const MISTRAL_MODEL_LARGE = process.env.AI_MODEL_COMPLEX || 'mistral-large-3-2512-latest';
// CREATIVE: Optimized for writing tasks (email composition, smart replies)
// ⚠️ Use ONLY for pure text generation - may not work well with complex tool calls
const MISTRAL_MODEL_CREATIVE = process.env.AI_MODEL_CREATIVE || 'mistral-small-creative-25-12';
// ROUTER: Ultra-cheap 3B model for intent classification, triage (~$0.04/1M tokens)
// Best for: classify intent, email priority, simple decisions
const MISTRAL_MODEL_ROUTER = process.env.AI_MODEL_ROUTER || 'ministral-3b-latest';
// REASONING: Magistral - Extended thinking with [THINK]/[/THINK] tokens
// Use for complex reasoning, analysis, planning
// @see https://docs.mistral.ai/capabilities/reasoning
const MISTRAL_MODEL_REASONING = process.env.AI_MODEL_REASONING || 'magistral-small-2509-latest';

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

export function getMistralLarge(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_LARGE);
}

export function getMistralCreative(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_CREATIVE);
}

export function getMistralRouter(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_ROUTER);
}

/**
 * Get Magistral reasoning model with thinking mode support.
 * Output includes [THINK]...[/THINK] tokens for reasoning traces.
 * @see https://docs.mistral.ai/capabilities/reasoning
 */
export function getMistralReasoning(): MistralModelInstance {
  return getMistralProvider()(MISTRAL_MODEL_REASONING);
}

// NOTE: parallelToolCalls and structuredOutputs are now passed via
// providerOptions in voltagent.service.ts generateText/streamText calls.
// @see https://ai-sdk.dev/providers/ai-sdk-providers/mistral

// Legacy exports for backward compatibility
export const mistralProvider: {
  readonly small: MistralModelInstance;
  readonly large: MistralModelInstance;
} = {
  get small() {
    return getMistralSmall();
  },
  get large() {
    return getMistralLarge();
  },
};

// Lazy-loaded model instances - prefer getMistralModel() - Remove by 2026-04-01
export const mistralSmall = { get: getMistralSmall };
export const mistralLarge = { get: getMistralLarge };

// Model selection helper
// NOTE: 'reasoning' uses Magistral with extended thinking (outputs [THINK]...[/THINK] traces)
export type MistralModel = 'small' | 'large' | 'creative' | 'router' | 'reasoning';

export function getMistralModel(model: MistralModel = 'small'): LanguageModel {
  // Type cast required: @ai-sdk/mistral returns LanguageModelV1 which is compatible
  // with VoltAgent's LanguageModel interface at runtime, but TypeScript needs the cast.
  // Using double-cast (unknown) to bridge V1 → V2 type differences.
  switch (model) {
    case 'large':
      return getMistralLarge() as unknown as LanguageModel;
    case 'creative':
      return getMistralCreative() as unknown as LanguageModel;
    case 'router':
      return getMistralRouter() as unknown as LanguageModel;
    case 'reasoning':
      return getMistralReasoning() as unknown as LanguageModel;
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
    large: MISTRAL_MODEL_LARGE,
    creative: MISTRAL_MODEL_CREATIVE,
    router: MISTRAL_MODEL_ROUTER,
    reasoning: MISTRAL_MODEL_REASONING,
    isConfigured: isMistralConfigured(),
  };
}

/**
 * Model Pricing Reference (as of 2026-01-29 - pricepertoken.com audit)
 *
 * RECOMMENDED MODELS (Best price/performance):
 * | Model                | Input $/M | Output $/M | Speed   | Tool Calls | Use Case               |
 * |---------------------|-----------|------------|---------|------------|------------------------|
 * | ministral-3b        | $0.04     | $0.04      | ⚡⚡ Fast | ✅ Yes     | Intent classification  |
 * | mistral-small-3-1   | $0.03     | $0.11      | ⚡ Fast  | ✅ Yes     | Orchestration, tools   |
 * | mistral-small-creative | $0.10  | $0.30      | ⚡ Fast  | ⚠️ Limited | Email composition only |
 * | mistral-large-3     | $0.50     | $1.50      | Medium  | ✅ Yes     | Complex reasoning      |
 * | magistral-small     | $0.50     | $1.50      | Medium  | ✅ Yes     | Extended thinking      |
 *
 * ⚠️ REMOVED MODELS (too slow/expensive - deleted 2026-01-31):
 * | mistral-medium      | $0.40     | $2.00      | 🐢 SLOW | ✅ Yes     | REMOVED - use mistral-small-3-1! |
 * | mistral-large (old) | $2.00     | $6.00      | Slow    | ✅ Yes     | Use mistral-large-3!             |
 *
 * MODEL SELECTION GUIDE:
 * - Intent/triage: ministral-3b (cheapest, fastest)
 * - Agent orchestration: mistral-small-3-1 (NOT medium!)
 * - Email composition: mistral-small-creative (pure text only)
 * - Complex reasoning: mistral-large-3 or magistral-small
 *
 * @see https://docs.mistral.ai/models/
 * @see https://pricepertoken.com/pricing-page/provider/mistral-ai
 */
