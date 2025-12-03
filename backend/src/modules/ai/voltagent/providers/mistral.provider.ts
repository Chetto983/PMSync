/**
 * Mistral AI Provider for VoltAgent
 *
 * Wraps the Mistral API for use with VoltAgent's agent system.
 */
import { createMistral } from '@ai-sdk/mistral';

// Create Mistral provider instance
export const mistralProvider = createMistral({
  apiKey: process.env.MISTRAL_API_KEY || '',
});

// Model instances for different use cases
export const mistralSmall = mistralProvider('mistral-small-latest');
export const mistralMedium = mistralProvider('mistral-medium-latest');
export const mistralLarge = mistralProvider('mistral-large-latest');

// Model selection helper
export type MistralModel = 'small' | 'medium' | 'large';

export function getMistralModel(model: MistralModel = 'small') {
  switch (model) {
    case 'large':
      return mistralLarge;
    case 'medium':
      return mistralMedium;
    case 'small':
    default:
      return mistralSmall;
  }
}
