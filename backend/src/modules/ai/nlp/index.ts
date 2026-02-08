/**
 * NLP Module Exports
 *
 * Provides intent classification and natural language understanding.
 */

export { IntentClassifierService, type ClassificationResult } from './intent-classifier.service';
export {
  type PrimaryIntent,
  type IntentDefinition,
  type SlotType,
  PRIMARY_INTENTS,
  INTENT_TAXONOMY,
  SLOT_FILLERS,
} from './intent-taxonomy';
export { EmbeddingIntentClassifierService, type EmbeddingClassificationResult } from './embedding-intent-classifier.service';
