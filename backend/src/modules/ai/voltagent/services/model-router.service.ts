/**
 * Model Router Service
 *
 * Intelligent model selection based on task complexity.
 * Routes requests to the most cost-effective model that can handle the task.
 *
 * Model Tiers:
 * - Small (mistral-small-latest): Simple tasks, 3x cheaper
 * - Medium (mistral-medium-latest): Complex reasoning
 * - Large (mistral-large-latest): Multi-step planning, code generation
 *
 * Routing Criteria:
 * - Token count estimation
 * - Task complexity classification
 * - Response quality requirements
 * - Historical performance data
 *
 * Cost Savings: 40-60% by routing simple queries to smaller models.
 *
 * Multilingual Support:
 * - Patterns loaded from locale files (en.ts, it.ts, etc.)
 * - Easy to add new languages by creating new locale file
 * - Patterns merged for comprehensive coverage
 */
import { Injectable, Logger } from '@nestjs/common';
import type { MistralModel } from '../providers/mistral.provider';
import { getRouterPatterns, patternsToRegex } from '../locales';

export type TaskComplexity = 'simple' | 'moderate' | 'complex';

/**
 * Phase 3 Agent Consolidation (10 → 3):
 * - Supervisor: Orchestrates sub-agents, handles complex multi-domain queries
 * - Actions: ALL WRITE operations (email send/reply/delete, calendar CRUD, contacts CRUD)
 * - Intelligence: ALL READ and ANALYSIS operations (search, list, count, analyze)
 */
export type AgentType = 'Supervisor' | 'Actions' | 'Intelligence';

export interface TaskClassification {
  complexity: TaskComplexity;
  recommendedModel: MistralModel;
  confidence: number;
  reasoning: string;
  estimatedTokens: number;
  suggestedAgent?: AgentType;
}

export interface RoutingStats {
  totalRequests: number;
  byModel: Record<MistralModel, number>;
  avgResponseTime: Record<MistralModel, number>;
  estimatedSavings: number;
}

interface ModelConfig {
  name: MistralModel;
  maxTokens: number;
  costPer1kTokens: number;
  capabilities: string[];
  avgLatencyMs: number;
}

const MODEL_CONFIGS: Record<MistralModel, ModelConfig> = {
  small: {
    name: 'small',
    maxTokens: 8192,
    costPer1kTokens: 0.0002,
    capabilities: ['simple-qa', 'classification', 'extraction', 'summary-short'],
    avgLatencyMs: 200,
  },
  medium: {
    name: 'medium',
    maxTokens: 32768,
    costPer1kTokens: 0.0027,
    capabilities: ['reasoning', 'multi-step', 'summary-long', 'translation', 'analysis'],
    avgLatencyMs: 500,
  },
  large: {
    name: 'large',
    maxTokens: 131072,
    costPer1kTokens: 0.008,
    capabilities: ['code-gen', 'complex-reasoning', 'planning', 'creative', 'specialized'],
    avgLatencyMs: 1000,
  },
};

// Complexity patterns are now loaded from locale files for multilingual support
// See: locales/en.ts and locales/it.ts for pattern definitions

// Tool calls that indicate complexity
const TOOL_COMPLEXITY: Record<string, TaskComplexity> = {
  // Simple tools
  get_unread_emails: 'simple',
  search_emails: 'simple',
  mark_read: 'simple',
  mark_unread: 'simple',
  star: 'simple',
  unstar: 'simple',
  search_contacts: 'simple',
  get_contact: 'simple',

  // Moderate tools
  summarize_email: 'moderate',
  analyze_sentiment: 'moderate',
  compose_reply: 'moderate',
  smart_replies: 'moderate',
  categorize_email: 'moderate',
  create_event: 'moderate',
  update_event: 'moderate',
  check_availability: 'moderate',

  // Complex tools
  analyze_email: 'complex',
  detect_intent: 'complex',
  calculate_priority: 'complex',
  schedule_meeting: 'complex',
  send_email: 'complex',
  forward_email: 'complex',
  merge_contacts: 'complex',
};

// Intent patterns now loaded from locale files for multilingual support
// See: locales/en.ts and locales/it.ts for pattern definitions
type IntentType = 'WRITE_OPS' | 'READ_OPS' | 'SIMPLE';

/**
 * Cached compiled patterns for performance
 * Patterns are loaded from locale files and compiled to RegExp once
 */
interface CompiledPatterns {
  intent: Record<IntentType, RegExp[]>;
  complexity: Record<TaskComplexity, RegExp[]>;
}

@Injectable()
export class ModelRouterService {
  private readonly logger = new Logger(ModelRouterService.name);

  // Cached compiled patterns (loaded once, reused)
  private compiledPatterns: CompiledPatterns | null = null;

  // Performance tracking
  private stats = {
    totalRequests: 0,
    byModel: { small: 0, medium: 0, large: 0 } as Record<MistralModel, number>,
    totalTokens: { small: 0, medium: 0, large: 0 } as Record<MistralModel, number>,
    totalLatency: { small: 0, medium: 0, large: 0 } as Record<MistralModel, number>,
  };

  /**
   * Load and compile patterns from locale files (cached for performance).
   * Combines English + Italian patterns for comprehensive coverage.
   */
  private getPatterns(): CompiledPatterns {
    if (this.compiledPatterns) {
      return this.compiledPatterns;
    }

    // Load patterns from both locales and merge
    const enPatterns = getRouterPatterns('en');
    const itPatterns = getRouterPatterns('it');

    // Merge and deduplicate
    const mergeUnique = (a: string[], b: string[]) => [...new Set([...a, ...b])];

    this.compiledPatterns = {
      intent: {
        WRITE_OPS: patternsToRegex(mergeUnique(enPatterns.writeOps, itPatterns.writeOps)),
        READ_OPS: patternsToRegex(mergeUnique(enPatterns.readOps, itPatterns.readOps)),
        SIMPLE: patternsToRegex(mergeUnique(enPatterns.simple, itPatterns.simple)),
      },
      complexity: {
        simple: patternsToRegex(mergeUnique(enPatterns.complexitySimple, itPatterns.complexitySimple)),
        moderate: patternsToRegex(mergeUnique(enPatterns.complexityModerate, itPatterns.complexityModerate)),
        complex: patternsToRegex(mergeUnique(enPatterns.complexityComplex, itPatterns.complexityComplex)),
      },
    };

    this.logger.log('Loaded router patterns from locale files (en + it)');
    return this.compiledPatterns;
  }

  /**
   * Route a message to the appropriate model and agent based on complexity and intent.
   */
  routeMessage(
    message: string,
    options?: {
      forceModel?: MistralModel;
      preferSpeed?: boolean;
      preferQuality?: boolean;
      expectedTools?: string[];
    },
  ): TaskClassification {
    const estimatedTokens = this.estimateTokens(message);
    const messageComplexity = this.classifyMessageComplexity(message);
    const intent = this.classifyIntent(message);

    // Determine suggested agent based on intent (Phase 3 Consolidation)
    let suggestedAgent: AgentType = 'Supervisor'; // Default to Supervisor for complex queries
    if (intent === 'WRITE_OPS') suggestedAgent = 'Actions';
    else if (intent === 'READ_OPS') suggestedAgent = 'Intelligence';
    // SIMPLE intents stay with Supervisor (small model, direct response)

    // Honor forced model (after intent classification)
    if (options?.forceModel) {
      return {
        complexity: this.getComplexityForModel(options.forceModel),
        recommendedModel: options.forceModel,
        confidence: 1.0,
        reasoning: 'Model explicitly specified',
        estimatedTokens,
        suggestedAgent,
      };
    }

    const toolComplexity = this.classifyToolComplexity(options?.expectedTools || []);

    // Take the higher complexity between message and tools
    const complexity = this.maxComplexity(messageComplexity, toolComplexity);

    // Apply preference modifiers
    let recommendedModel = this.complexityToModel(complexity);

    if (options?.preferSpeed && recommendedModel !== 'small') {
      // Downgrade if possible
      recommendedModel = complexity === 'complex' ? 'medium' : 'small';
    }

    if (options?.preferQuality && recommendedModel !== 'large') {
      // Upgrade if complex enough
      recommendedModel = complexity === 'simple' ? 'medium' : 'large';
    }

    // Force 'medium' or 'large' for specialized agents (tool calls need reasoning)
    // ActionsAgent: Always needs at least medium for HITL decisions
    // IntelligenceAgent: Needs medium for semantic search and analysis
    if (suggestedAgent === 'Actions' || suggestedAgent === 'Intelligence') {
      if (recommendedModel === 'small') recommendedModel = 'medium';
    }
    // Supervisor with SIMPLE intent can stay small (direct responses)
    if (suggestedAgent === 'Supervisor' && intent === 'SIMPLE') {
      recommendedModel = 'small';
    }

    // Track stats
    this.stats.totalRequests++;
    this.stats.byModel[recommendedModel]++;
    this.stats.totalTokens[recommendedModel] += estimatedTokens;

    const reasoning = this.generateReasoning(message, complexity, recommendedModel);

    this.logger.debug(
      `Routed to ${recommendedModel} (Agent: ${suggestedAgent}): "${message.substring(0, 50)}..." (${complexity})`,
    );

    return {
      complexity,
      recommendedModel,
      confidence: this.calculateConfidence(message, complexity),
      reasoning,
      estimatedTokens,
      suggestedAgent,
    };
  }

  /**
   * Classify intent based on regex patterns (loaded from locale files).
   */
  private classifyIntent(message: string): IntentType | 'UNKNOWN' {
    const patterns = this.getPatterns();
    for (const [intent, regexList] of Object.entries(patterns.intent)) {
      for (const pattern of regexList) {
        if (pattern.test(message)) {
          return intent as IntentType;
        }
      }
    }
    return 'UNKNOWN';
  }

  /**
   * Route based on tool call requirements.
   */
  routeForTools(tools: string[]): TaskClassification {
    const complexity = this.classifyToolComplexity(tools);
    const model = this.complexityToModel(complexity);

    this.stats.totalRequests++;
    this.stats.byModel[model]++;

    return {
      complexity,
      recommendedModel: model,
      confidence: 0.9,
      reasoning: `Tool-based routing: ${tools.join(', ')}`,
      estimatedTokens: 500, // Default estimate for tool calls
    };
  }

  /**
   * Get routing statistics.
   */
  getStats(): RoutingStats {
    const estimatedSavings = this.calculateEstimatedSavings();

    return {
      totalRequests: this.stats.totalRequests,
      byModel: { ...this.stats.byModel },
      avgResponseTime: {
        small:
          this.stats.byModel.small > 0
            ? this.stats.totalLatency.small / this.stats.byModel.small
            : 0,
        medium:
          this.stats.byModel.medium > 0
            ? this.stats.totalLatency.medium / this.stats.byModel.medium
            : 0,
        large:
          this.stats.byModel.large > 0
            ? this.stats.totalLatency.large / this.stats.byModel.large
            : 0,
      },
      estimatedSavings,
    };
  }

  /**
   * Record actual response time for accuracy improvement.
   */
  recordLatency(model: MistralModel, latencyMs: number): void {
    this.stats.totalLatency[model] += latencyMs;
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      byModel: { small: 0, medium: 0, large: 0 },
      totalTokens: { small: 0, medium: 0, large: 0 },
      totalLatency: { small: 0, medium: 0, large: 0 },
    };
  }

  /**
   * Estimate token count for a message.
   * Uses a simple heuristic: ~4 chars per token for English.
   */
  private estimateTokens(message: string): number {
    // Simple heuristic: ~4 characters per token for English
    const charCount = message.length;
    const wordCount = message.split(/\s+/).length;

    // Use a weighted average of character and word-based estimates
    const charBasedEstimate = Math.ceil(charCount / 4);
    const wordBasedEstimate = Math.ceil(wordCount * 1.3);

    return Math.max(charBasedEstimate, wordBasedEstimate);
  }

  /**
   * Classify message complexity based on patterns (loaded from locale files).
   */
  private classifyMessageComplexity(message: string): TaskComplexity {
    const normalizedMessage = message.toLowerCase().trim();
    const patterns = this.getPatterns();

    // Check complex patterns first (highest priority)
    for (const pattern of patterns.complexity.complex) {
      if (pattern.test(normalizedMessage)) {
        return 'complex';
      }
    }

    // Check moderate patterns
    for (const pattern of patterns.complexity.moderate) {
      if (pattern.test(normalizedMessage)) {
        return 'moderate';
      }
    }

    // Check simple patterns
    for (const pattern of patterns.complexity.simple) {
      if (pattern.test(normalizedMessage)) {
        return 'simple';
      }
    }

    // Default based on message length
    const wordCount = normalizedMessage.split(/\s+/).length;

    if (wordCount <= 10) {
      return 'simple';
    } else if (wordCount <= 50) {
      return 'moderate';
    } else {
      return 'complex';
    }
  }

  /**
   * Classify complexity based on expected tool calls.
   */
  private classifyToolComplexity(tools: string[]): TaskComplexity {
    if (tools.length === 0) {
      return 'simple';
    }

    let maxComplexity: TaskComplexity = 'simple';

    for (const tool of tools) {
      const toolComplexity = TOOL_COMPLEXITY[tool] || 'moderate';
      maxComplexity = this.maxComplexity(maxComplexity, toolComplexity);
    }

    // Multiple tools increase complexity
    if (tools.length >= 3 && maxComplexity === 'simple') {
      maxComplexity = 'moderate';
    }

    if (tools.length >= 5 && maxComplexity === 'moderate') {
      maxComplexity = 'complex';
    }

    return maxComplexity;
  }

  /**
   * Get the higher of two complexity levels.
   */
  private maxComplexity(a: TaskComplexity, b: TaskComplexity): TaskComplexity {
    const order: Record<TaskComplexity, number> = {
      simple: 0,
      moderate: 1,
      complex: 2,
    };

    return order[a] >= order[b] ? a : b;
  }

  /**
   * Map complexity to recommended model.
   */
  private complexityToModel(complexity: TaskComplexity): MistralModel {
    switch (complexity) {
      case 'simple':
        return 'small';
      case 'moderate':
        return 'medium';
      case 'complex':
        return 'large';
      default:
        return 'medium';
    }
  }

  /**
   * Get complexity level for a model.
   */
  private getComplexityForModel(model: MistralModel): TaskComplexity {
    switch (model) {
      case 'small':
        return 'simple';
      case 'medium':
        return 'moderate';
      case 'large':
        return 'complex';
      default:
        return 'moderate';
    }
  }

  /**
   * Calculate confidence in classification.
   */
  private calculateConfidence(message: string, complexity: TaskComplexity): number {
    // Higher confidence for shorter, clearer messages
    const wordCount = message.split(/\s+/).length;
    const patterns = this.getPatterns();

    // Pattern match bonus
    let patternBonus = 0;
    for (const pattern of patterns.complexity[complexity]) {
      if (pattern.test(message)) {
        patternBonus = 0.15;
        break;
      }
    }

    // Base confidence
    let confidence = 0.7;

    // Adjust based on message length
    if (wordCount <= 20) {
      confidence += 0.1;
    } else if (wordCount > 100) {
      confidence -= 0.1;
    }

    return Math.min(1.0, Math.max(0.5, confidence + patternBonus));
  }

  /**
   * Generate human-readable reasoning.
   */
  private generateReasoning(
    message: string,
    complexity: TaskComplexity,
    model: MistralModel,
  ): string {
    const wordCount = message.split(/\s+/).length;
    const config = MODEL_CONFIGS[model];

    const reasons: string[] = [];

    if (complexity === 'simple') {
      reasons.push('Simple query detected');
    } else if (complexity === 'complex') {
      reasons.push('Complex reasoning required');
    }

    if (wordCount <= 10) {
      reasons.push('Short message');
    } else if (wordCount > 50) {
      reasons.push('Long message');
    }

    reasons.push(`Model: ${config.name} (${config.costPer1kTokens * 1000}¢/1K tokens)`);

    return reasons.join('; ');
  }

  /**
   * Calculate estimated cost savings from routing.
   */
  private calculateEstimatedSavings(): number {
    const { totalTokens } = this.stats;

    // Calculate actual cost
    let actualCost = 0;
    for (const model of ['small', 'medium', 'large'] as MistralModel[]) {
      actualCost += (totalTokens[model] / 1000) * MODEL_CONFIGS[model].costPer1kTokens;
    }

    // Calculate cost if all requests used large model
    const totalAllTokens = totalTokens.small + totalTokens.medium + totalTokens.large;
    const baselineCost = (totalAllTokens / 1000) * MODEL_CONFIGS.large.costPer1kTokens;

    return Math.max(0, baselineCost - actualCost);
  }
}
