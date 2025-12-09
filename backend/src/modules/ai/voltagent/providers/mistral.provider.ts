/**
 * Mistral AI Provider for VoltAgent
 *
 * Wraps the Mistral API for use with VoltAgent's agent system.
 * Model names are configurable via environment variables.
 */
import { createMistral } from '@ai-sdk/mistral';

// Validate API key at module load time
const apiKey = process.env.MISTRAL_API_KEY;
if (!apiKey) {
  console.warn('[MistralProvider] MISTRAL_API_KEY not configured - AI features will be disabled');
}

// Model configuration from environment variables with defaults
const MISTRAL_MODEL_SMALL = process.env.MISTRAL_MODEL_SMALL || 'mistral-small-latest';
const MISTRAL_MODEL_MEDIUM = process.env.MISTRAL_MODEL_MEDIUM || 'mistral-medium-latest';
const MISTRAL_MODEL_LARGE = process.env.MISTRAL_MODEL_LARGE || 'mistral-large-latest';

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
export function getMistralSmall() {
  return getMistralProvider()(MISTRAL_MODEL_SMALL);
}

export function getMistralMedium() {
  return getMistralProvider()(MISTRAL_MODEL_MEDIUM);
}

export function getMistralLarge() {
  return getMistralProvider()(MISTRAL_MODEL_LARGE);
}

// Legacy exports for backward compatibility
export const mistralProvider = {
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
export type MistralModel = 'small' | 'medium' | 'large';

export function getMistralModel(model: MistralModel = 'small') {
  switch (model) {
    case 'large':
      return getMistralLarge();
    case 'medium':
      return getMistralMedium();
    case 'small':
    default:
      return getMistralSmall();
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
    isConfigured: isMistralConfigured(),
  };
}
