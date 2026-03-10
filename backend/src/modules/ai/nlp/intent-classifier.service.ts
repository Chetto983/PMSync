/**
 * Intent Classifier Service
 *
 * Provides fast, local intent classification using a pre-trained FastText model.
 * Falls back to regex patterns if model not available.
 *
 * Features:
 * - Sub-millisecond inference (~0.5ms per classification)
 * - Bilingual (EN/IT) support via training data
 * - Handles typos via FastText's subword embeddings
 * - No external API calls = no latency/cost
 *
 * Usage:
 *   const intent = await intentClassifier.classify("show me emails from John");
 *   // { intent: 'email_search', confidence: 0.95, lang: 'en' }
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PRIMARY_INTENTS, type PrimaryIntent } from './intent-taxonomy';

export interface ClassificationResult {
  intent: PrimaryIntent;
  confidence: number;
  lang: 'en' | 'it' | 'unknown';
  alternatives: Array<{ intent: PrimaryIntent; confidence: number }>;
  latencyMs: number;
}

interface FastTextClassifier {
  predict(text: string, k?: number): Promise<Array<{ label: string; value: number }>>;
  loadModel(path: string): Promise<void>;
}

/**
 * Regex-based fallback patterns for when model is unavailable.
 * Ordered by specificity (most specific first).
 */
const FALLBACK_PATTERNS: Array<{ pattern: RegExp; intent: PrimaryIntent }> = [
  // Email actions
  { pattern: /\b(search|find|cerca|trova|show|mostra)\b.*\b(email|mail|messag)/i, intent: 'email_search' },
  { pattern: /\b(compose|write|scrivi|componi|new|nuov[ao])\b.*\b(email|mail|messag)/i, intent: 'email_compose' },
  { pattern: /\b(reply|respond|rispondi|risposta)\b/i, intent: 'email_reply' },
  { pattern: /\b(forward|inoltra|fwd)\b/i, intent: 'email_forward' },
  { pattern: /\b(delete|remove|elimina|cancella)\b.*\b(email|mail|messag)/i, intent: 'email_delete' },
  { pattern: /\b(archive|archivia)\b/i, intent: 'email_archive' },
  { pattern: /\b(move|sposta)\b.*\b(folder|cartella)/i, intent: 'email_move' },
  { pattern: /\b(read|open|leggi|apri)\b.*\b(email|mail|messag)/i, intent: 'email_read' },
  { pattern: /\b(summarize|summary|riassumi|sintesi)\b/i, intent: 'email_summarize' },

  // Calendar actions
  { pattern: /\b(calendar|agenda|schedule|eventi)\b/i, intent: 'calendar_view' },
  { pattern: /\b(meeting|riunione|event|appuntamento)\b.*\b(create|creat|add|aggiungi|new|nuov)/i, intent: 'calendar_create' },
  { pattern: /\b(reschedule|update|modifica|sposta)\b.*\b(meeting|event|riunione)/i, intent: 'calendar_update' },
  { pattern: /\b(cancel|delete|annulla|elimina)\b.*\b(meeting|event|riunione)/i, intent: 'calendar_delete' },

  // Contact actions
  { pattern: /\b(contact|contatt|person|persona)\b.*\b(search|find|cerca|trova)/i, intent: 'contact_search' },
  { pattern: /\b(search|find|cerca|trova)\b.*\b(contact|contatt)/i, intent: 'contact_search' },
  { pattern: /\b(add|create|aggiungi|crea)\b.*\b(contact|contatt)/i, intent: 'contact_create' },
  { pattern: /\b(update|edit|modifica)\b.*\b(contact|contatt)/i, intent: 'contact_update' },

  // Folder actions
  { pattern: /\b(list|show|mostra|elenca)\b.*\b(folder|cartell)/i, intent: 'folder_list' },
  { pattern: /\b(create|new|crea|nuov)\b.*\b(folder|cartell)/i, intent: 'folder_create' },

  // Settings
  { pattern: /\b(setting|impostazion|preference|preferenz|config)/i, intent: 'settings_view' },

  // Status
  { pattern: /\b(inbox|posta in arrivo|unread|non lett|status|stato)\b/i, intent: 'status_check' },
  { pattern: /\b(how many|quant[ie]|count|contare)\b/i, intent: 'status_check' },

  // Social intents
  { pattern: /^(hi|hello|hey|ciao|salve|buongiorno|buonasera)/i, intent: 'greeting' },
  { pattern: /^(bye|goodbye|arrivederci|ciao ciao|a presto)/i, intent: 'farewell' },
  { pattern: /^(thanks|thank you|grazie|ti ringrazio)/i, intent: 'thanks' },

  // Help
  { pattern: /\b(help|aiuto|assist|come si fa|how to|what can)/i, intent: 'help' },
];

/**
 * Simple language detection based on common words.
 */
function detectLanguage(text: string): 'en' | 'it' | 'unknown' {
  const lower = text.toLowerCase();

  // Italian indicators
  const italianWords = /\b(ciao|grazie|email|cerca|trova|mostra|scrivi|rispondi|elimina|calendario|riunione|contatto|cartella|impostazioni|aiuto|buongiorno|buonasera|arrivederci|prego)\b/;
  // English indicators
  const englishWords = /\b(hello|thanks|email|search|find|show|write|reply|delete|calendar|meeting|contact|folder|settings|help|goodbye|please)\b/;

  const hasItalian = italianWords.test(lower);
  const hasEnglish = englishWords.test(lower);

  if (hasItalian && !hasEnglish) return 'it';
  if (hasEnglish && !hasItalian) return 'en';
  if (hasItalian && hasEnglish) {
    // Mixed - count words
    const itCount = (lower.match(italianWords) || []).length;
    const enCount = (lower.match(englishWords) || []).length;
    return itCount > enCount ? 'it' : 'en';
  }

  return 'unknown';
}

@Injectable()
export class IntentClassifierService implements OnModuleInit {
  private readonly logger = new Logger(IntentClassifierService.name);
  private classifier: FastTextClassifier | null = null;
  private modelLoaded = false;
  private readonly modelPath: string;

  constructor(private readonly configService: ConfigService) {
    this.modelPath = this.configService.get<string>(
      'INTENT_MODEL_PATH',
      path.join(process.cwd(), 'backend', 'models', 'intent-classifier.bin'),
    );
  }

  async onModuleInit(): Promise<void> {
    await this.loadModel();
  }

  /**
   * Load the FastText model if available.
   */
  private async loadModel(): Promise<void> {
    try {
      if (!fs.existsSync(this.modelPath)) {
        this.logger.warn(`Intent model not found at ${this.modelPath}. Using regex fallback.`);
        return;
      }

      // Dynamic import - fasttext is optional dependency
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Classifier } = require('fasttext');
        const classifier = new Classifier();
        await classifier.loadModel(this.modelPath);
        this.classifier = classifier as unknown as FastTextClassifier;
        this.modelLoaded = true;
        this.logger.log(`Intent classifier loaded from ${this.modelPath}`);
      } catch {
        this.logger.warn('fasttext not installed. Using regex fallback.');
      }
    } catch (error) {
      this.logger.warn(`Failed to load intent model: ${error}. Using regex fallback.`);
    }
  }

  /**
   * Classify user intent from text.
   *
   * @param text - User input text (can be EN or IT)
   * @returns Classification result with intent, confidence, and language
   */
  async classify(text: string): Promise<ClassificationResult> {
    const startTime = Date.now();
    const normalizedText = this.normalizeText(text);
    const lang = detectLanguage(normalizedText);

    let intent: PrimaryIntent = 'unknown';
    let confidence = 0;
    let alternatives: Array<{ intent: PrimaryIntent; confidence: number }> = [];

    if (this.modelLoaded && this.classifier) {
      // Use FastText model
      try {
        const predictions = await this.classifier.predict(normalizedText, 5);

        if (predictions.length > 0) {
          const top = predictions[0];
          intent = (top.label.replace('__label__', '') as PrimaryIntent) || 'unknown';
          confidence = top.value;

          // Validate intent is in taxonomy
          if (!PRIMARY_INTENTS.includes(intent)) {
            this.logger.warn(`Unknown intent from model: ${intent}`);
            intent = 'unknown';
          }

          // Get alternatives
          alternatives = predictions.slice(1, 4).map((p) => ({
            intent: (p.label.replace('__label__', '') as PrimaryIntent) || 'unknown',
            confidence: p.value,
          }));
        }
      } catch (error) {
        this.logger.warn(`FastText prediction failed: ${error}`);
        // Fall through to regex
      }
    }

    // Fallback to regex if no model or low confidence
    if (!this.modelLoaded || confidence < 0.5) {
      const regexResult = this.classifyWithRegex(normalizedText);
      if (regexResult.confidence > confidence) {
        intent = regexResult.intent;
        confidence = regexResult.confidence;
      }
    }

    const latencyMs = Date.now() - startTime;

    return {
      intent,
      confidence,
      lang,
      alternatives,
      latencyMs,
    };
  }

  /**
   * Classify using regex patterns (fallback).
   */
  private classifyWithRegex(text: string): { intent: PrimaryIntent; confidence: number } {
    for (const { pattern, intent } of FALLBACK_PATTERNS) {
      if (pattern.test(text)) {
        return { intent, confidence: 0.7 }; // Regex gives medium confidence
      }
    }
    return { intent: 'unknown', confidence: 0.1 };
  }

  /**
   * Normalize text for classification.
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s\u00C0-\u017F]/g, ' ') // Keep letters including accented
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if model is loaded.
   */
  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  /**
   * Batch classify multiple texts.
   */
  async classifyBatch(texts: string[]): Promise<ClassificationResult[]> {
    return Promise.all(texts.map((text) => this.classify(text)));
  }

  /**
   * Get classification with context (previous intents can influence current).
   */
  async classifyWithContext(
    text: string,
    previousIntents: PrimaryIntent[],
  ): Promise<ClassificationResult> {
    const result = await this.classify(text);

    // If current intent is ambiguous, consider context
    if (result.confidence < 0.6 && previousIntents.length > 0) {
      const lastIntent = previousIntents[previousIntents.length - 1];

      // Context-aware boosting
      const contextBoosts: Partial<Record<PrimaryIntent, PrimaryIntent[]>> = {
        email_search: ['email_read', 'email_reply', 'email_forward', 'email_delete'],
        email_compose: ['email_reply', 'email_forward'],
        calendar_view: ['calendar_create', 'calendar_update', 'calendar_delete'],
        contact_search: ['contact_update', 'email_compose'],
      };

      const relatedIntents = contextBoosts[lastIntent];
      if (relatedIntents) {
        // Check if any alternative matches context
        for (const alt of result.alternatives) {
          if (relatedIntents.includes(alt.intent)) {
            return {
              ...result,
              intent: alt.intent,
              confidence: Math.min(alt.confidence + 0.15, 0.95), // Boost confidence
            };
          }
        }
      }
    }

    return result;
  }
}
