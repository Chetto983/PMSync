/**
 * Task Complexity Classifier Service
 *
 * Neural network-based intent detection using NLP.js for intelligent model routing.
 * Replaces regex patterns with semantic understanding.
 *
 * Classification flow:
 * 1. NLP neural network (trained on EN + IT utterances)
 * 2. Falls back to 'unknown' for low confidence
 * 3. Future: LLM fallback with ministral-3b for truly ambiguous cases
 *
 * Created: 2026-01-28 (Smart Model Routing Implementation)
 * Updated: 2026-01-29 (Replaced regex with NLP.js neural network)
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type { MistralModel } from '../providers/mistral.provider';
import type { AgentType } from '../types';
import { NlpIntentClassifierService } from './nlp-intent-classifier.service';

export type TaskIntent =
  | 'greeting'
  | 'search'
  | 'read'
  | 'write'
  | 'compose'
  | 'orchestrate'
  | 'calendar'
  | 'unknown';

export type TaskComplexity = 'simple' | 'medium' | 'complex' | 'creative';

export interface ClassificationResult {
  intent: TaskIntent;
  complexity: TaskComplexity;
  recommendedModel: MistralModel;
  recommendedAgent: AgentType;
  confidence: number;
  /** Method used: 'nlp' or 'fallback' */
  method?: 'nlp' | 'fallback';
}

// Model mapping by intent
// 2026-01-29 AUDIT: Fixed model selection for tool-calling operations
//
// CRITICAL: 'creative' model should ONLY be used for pure text generation (NO tool calls)!
// Operations that require tool calls (send, reply, forward, search) MUST use 'small'.
//
// Model selection:
// - 'small' (mistral-small-3-1): For all tool-calling operations (fast, cheap, supports tools)
// - 'router' (ministral-3b): For intent classification only (ultra-cheap)
// - 'creative': ONLY for pure text generation without tools (email composition TEXT only)
// - 'reasoning': For complex analysis requiring extended thinking
//
const INTENT_TO_MODEL: Record<TaskIntent, MistralModel> = {
  greeting: 'small', // Simple acknowledgment (no tools needed)
  search: 'small', // Uses search_emails, semantic_search tools
  read: 'small', // Uses list_email_index, get_email_content tools
  write: 'small', // Uses manage_email tool (send/reply/forward) - NEEDS TOOL CALLS!
  compose: 'small', // Uses manage_email, compose_reply tools - NEEDS TOOL CALLS!
  orchestrate: 'small', // Multi-step with tools (was 'medium' - too slow!)
  calendar: 'small', // Uses get_events, manage_event tools
  unknown: 'small', // Default to small (was 'medium' - too slow!)
};

// Agent mapping by intent
// All intents now use Supervisor (UnifiedAgent) for simplicity
const INTENT_TO_AGENT: Record<TaskIntent, AgentType> = {
  greeting: 'Supervisor',
  search: 'Supervisor',
  read: 'Supervisor',
  write: 'Supervisor',
  compose: 'Supervisor',
  orchestrate: 'Supervisor',
  calendar: 'Supervisor',
  unknown: 'Supervisor',
};

@Injectable()
export class TaskComplexityClassifierService {
  private readonly logger = new Logger(TaskComplexityClassifierService.name);

  constructor(
    @Optional() @Inject(NlpIntentClassifierService)
    private readonly nlpClassifier?: NlpIntentClassifierService,
  ) {
    if (this.nlpClassifier) {
      this.logger.log('[CLASSIFIER] NLP neural network classifier injected');
    } else {
      this.logger.warn('[CLASSIFIER] NLP classifier not available, using basic fallback');
    }
  }

  /**
   * Classify a user message using NLP neural network.
   *
   * @param message - User's input message
   * @param locale - User's locale (en/it) for language hint
   * @returns Classification result with recommended model and agent
   */
  async classifyAsync(message: string, locale?: string): Promise<ClassificationResult> {
    // Use NLP classifier if available
    if (this.nlpClassifier?.isModelReady()) {
      try {
        const nlpResult = await this.nlpClassifier.classify(message, locale);

        this.logger.log(
          `[CLASSIFY/NLP] intent=${nlpResult.intent} confidence=${nlpResult.confidence.toFixed(2)} lang=${nlpResult.language}`,
        );

        return {
          intent: nlpResult.intent,
          complexity: this.modelToComplexity(nlpResult.recommendedModel),
          recommendedModel: nlpResult.recommendedModel,
          recommendedAgent: nlpResult.recommendedAgent,
          confidence: nlpResult.confidence,
          method: 'nlp',
        };
      } catch (error) {
        this.logger.error(`[CLASSIFY/NLP] Error: ${error}`);
        // Fall through to basic fallback
      }
    }

    // Fallback: return unknown
    return this.classify(message, locale);
  }

  /**
   * Synchronous classify (basic fallback when NLP not available).
   * Used for backward compatibility.
   *
   * @param message - User's input message
   * @param _locale - User's locale (en/it)
   * @returns Classification result
   */
  classify(message: string, _locale?: string): ClassificationResult {
    const normalizedMessage = message.trim().toLowerCase();

    this.logger.debug(`[CLASSIFY/FALLBACK] Input: "${normalizedMessage.substring(0, 100)}"`);

    // Basic keyword detection as fallback (less accurate than NLP)
    const intent = this.detectIntentBasic(normalizedMessage);
    const recommendedModel = INTENT_TO_MODEL[intent];
    const recommendedAgent = INTENT_TO_AGENT[intent];

    this.logger.log(
      `[CLASSIFY/FALLBACK] intent=${intent} model=${recommendedModel} agent=${recommendedAgent}`,
    );

    return {
      intent,
      complexity: this.modelToComplexity(recommendedModel),
      recommendedModel,
      recommendedAgent,
      confidence: intent === 'unknown' ? 0.5 : 0.7, // Lower confidence for keyword fallback
      method: 'fallback',
    };
  }

  /**
   * Basic keyword-based intent detection (fallback only).
   * Less accurate than NLP, but synchronous and zero-dependency.
   */
  private detectIntentBasic(message: string): TaskIntent {
    // Greeting detection
    if (/^(hi|hello|hey|ciao|salve|buongiorno|buonasera|thanks|grazie)\b/i.test(message)) {
      return 'greeting';
    }

    // Calendar keywords
    if (/\b(schedule|meeting|calendar|appointment|event|riunione|calendario|appuntamento)\b/i.test(message)) {
      return 'calendar';
    }

    // Write/Send keywords
    if (/\b(send|reply|respond|forward|invia|rispondi|inoltra)\b/i.test(message)) {
      return 'write';
    }

    // Compose keywords
    if (/\b(draft|compose|help.*write|bozza|componi|aiutami.*scrivere)\b/i.test(message)) {
      return 'compose';
    }

    // Search keywords
    if (/\b(find|search|look\s*for|cerca|trova)\b/i.test(message)) {
      return 'search';
    }

    // Read keywords
    if (/\b(read|summarize|unread|leggi|riassumi|non\s*lett)/i.test(message)) {
      return 'read';
    }

    // Orchestrate (multi-step) keywords
    if (/\b(and\s*then|after\s*that|also|e\s*poi|dopo|anche)\b/i.test(message)) {
      return 'orchestrate';
    }

    return 'unknown';
  }

  /**
   * Convert model tier to complexity label.
   */
  private modelToComplexity(model: MistralModel): TaskComplexity {
    switch (model) {
      case 'small':
      case 'router':
        return 'simple';
      case 'creative':
        return 'creative';
      case 'large':
      case 'reasoning':
        return 'complex';
      case 'medium':
      default:
        return 'medium';
    }
  }
}
