import { Injectable, Logger } from '@nestjs/common';
import { encode } from 'gpt-tokenizer';
import type { GraphTraversalResult } from './entity-graph.service';
import type { MemoryResult } from './memory.service';

// ─── Result types ───────────────────────────────────────────

export interface AssembledContext {
  /** Structured graph context (~60% of budget) */
  graphContext: string;
  /** Memory context (~20% of budget) */
  memoryContext: string;
  /** Few-shot context (~20% of budget, populated by Plan 03) */
  fewShotContext: string;
  /** Total tokens of all raw results before assembly */
  rawTokenCount: number;
  /** Total tokens after structured assembly */
  assembledTokenCount: number;
}

export interface AssembleOptions {
  /** Total token budget (default 4096) */
  tokenBudget?: number;
  /** Fraction for graph context (default 0.6) */
  graphRatio?: number;
  /** Fraction for memory context (default 0.2) */
  memoryRatio?: number;
  /** Fraction for few-shot context (default 0.2) */
  fewShotRatio?: number;
}

// ─── Service ────────────────────────────────────────────────

/**
 * ContextAssemblyService -- Token-budgeted structured context builder.
 *
 * Assembles graph traversal results, memories, and few-shot examples
 * into structured text within a configurable token budget (default 4K).
 * Budget split: 60% graph / 20% memory / 20% few-shot.
 *
 * Uses gpt-tokenizer (cl100k_base BPE) for accurate token counting.
 * Structured extraction produces ~40-60% fewer tokens than raw JSON injection.
 *
 * Phase 109 Plan 02
 */
@Injectable()
export class ContextAssemblyService {
  private readonly logger = new Logger(ContextAssemblyService.name);

  private static readonly DEFAULT_TOKEN_BUDGET = 4096;
  private static readonly DEFAULT_GRAPH_RATIO = 0.6;
  private static readonly DEFAULT_MEMORY_RATIO = 0.2;
  private static readonly DEFAULT_FEWSHOT_RATIO = 0.2;

  /** Snippet length limit for email metadata */
  private static readonly SNIPPET_MAX_LENGTH = 100;

  /**
   * Count tokens in a text string using BPE encoding.
   *
   * @param text - Input text
   * @returns Token count
   */
  countTokens(text: string): number {
    if (!text) return 0;
    return encode(text).length;
  }

  /**
   * Assemble structured context from graph results, memories, and few-shot examples.
   *
   * Fills each section up to its budget fraction, sorted by relevance.
   * Tracks raw vs assembled token counts for GRAG-02 measurement.
   *
   * @param graphResults - Scored graph traversal results
   * @param memories - Retrieved memory results
   * @param fewShotExamples - Pre-formatted few-shot example strings
   * @param options - Budget configuration
   * @returns Assembled context with token metrics
   */
  assemble(
    graphResults: GraphTraversalResult[],
    memories: MemoryResult[],
    fewShotExamples: string[],
    options?: AssembleOptions,
  ): AssembledContext {
    const tokenBudget =
      options?.tokenBudget ?? ContextAssemblyService.DEFAULT_TOKEN_BUDGET;
    const graphRatio =
      options?.graphRatio ?? ContextAssemblyService.DEFAULT_GRAPH_RATIO;
    const memoryRatio =
      options?.memoryRatio ?? ContextAssemblyService.DEFAULT_MEMORY_RATIO;
    const fewShotRatio =
      options?.fewShotRatio ?? ContextAssemblyService.DEFAULT_FEWSHOT_RATIO;

    const graphBudget = Math.floor(tokenBudget * graphRatio);
    const memoryBudget = Math.floor(tokenBudget * memoryRatio);
    const fewShotBudget = Math.floor(tokenBudget * fewShotRatio);

    // ── Calculate raw token count (what unstructured injection would cost) ──
    let rawTokenCount = 0;
    for (const node of graphResults) {
      rawTokenCount += this.countTokens(JSON.stringify(node));
    }
    for (const memory of memories) {
      rawTokenCount += this.countTokens(JSON.stringify(memory));
    }
    for (const example of fewShotExamples) {
      rawTokenCount += this.countTokens(example);
    }

    // ── Graph context: sort by score DESC, fill until budget ──
    const sortedGraph = [...graphResults].sort(
      (a: GraphTraversalResult, b: GraphTraversalResult) => b.score - a.score,
    );
    let graphTokens = 0;
    const graphLines: string[] = [];

    for (const node of sortedGraph) {
      const line = this.assembleNodeContext(node);
      const lineTokens = this.countTokens(line);
      if (graphTokens + lineTokens > graphBudget) break;
      graphLines.push(line);
      graphTokens += lineTokens;
    }

    // ── Memory context: fill until budget ──
    let memoryTokens = 0;
    const memoryLines: string[] = [];

    for (const memory of memories) {
      const line = `[Memory] ${memory.content} (${memory.category ?? 'general'})`;
      const lineTokens = this.countTokens(line);
      if (memoryTokens + lineTokens > memoryBudget) break;
      memoryLines.push(line);
      memoryTokens += lineTokens;
    }

    // ── Few-shot context: fill until budget ──
    let fewShotTokens = 0;
    const selectedExamples: string[] = [];

    for (const example of fewShotExamples) {
      const lineTokens = this.countTokens(example);
      if (fewShotTokens + lineTokens > fewShotBudget) break;
      selectedExamples.push(example);
      fewShotTokens += lineTokens;
    }

    const assembledTokenCount = graphTokens + memoryTokens + fewShotTokens;

    this.logger.debug(
      `Context assembly: ${graphLines.length} graph nodes (${graphTokens}t), ` +
        `${memoryLines.length} memories (${memoryTokens}t), ` +
        `${selectedExamples.length} few-shot (${fewShotTokens}t) | ` +
        `raw=${rawTokenCount}t assembled=${assembledTokenCount}t ` +
        `(${rawTokenCount > 0 ? Math.round((1 - assembledTokenCount / rawTokenCount) * 100) : 0}% reduction)`,
    );

    return {
      graphContext: graphLines.join('\n'),
      memoryContext: memoryLines.join('\n'),
      fewShotContext: selectedExamples.join('\n\n'),
      rawTokenCount,
      assembledTokenCount,
    };
  }

  /**
   * Format a single graph node into a structured context line.
   *
   * Per-type extraction produces compact representations:
   * - email: Subject, From, Date, Snippet (truncated)
   * - contact: Name, Company, JobTitle, Score
   * - thread: Label, message count
   * - calendar_event: Label, start time, location
   * - topic: Label only
   * - memory: Label with category
   *
   * @param node - Graph traversal result
   * @returns Formatted context line
   */
  assembleNodeContext(node: GraphTraversalResult): string {
    const metadata = node.metadata ?? {};
    const hop = node.hop;
    const edgeType = node.edgeType;

    switch (node.nodeType) {
      case 'email': {
        const snippet =
          typeof metadata.snippet === 'string'
            ? metadata.snippet.slice(
                0,
                ContextAssemblyService.SNIPPET_MAX_LENGTH,
              )
            : '';
        return (
          `[Email, hop ${hop}, via ${edgeType ?? 'seed'}] ` +
          `Subject: ${metadata.subject ?? ''} | ` +
          `From: ${metadata.from ?? ''} | ` +
          `Date: ${metadata.receivedAt ?? ''} | ` +
          `Snippet: ${snippet}`
        );
      }

      case 'contact':
        return (
          `[Contact, hop ${hop}] ${node.label} | ` +
          `${metadata.company ?? ''} | ` +
          `${metadata.jobTitle ?? ''} | ` +
          `Score: ${metadata.relationshipScore ?? 'N/A'}`
        );

      case 'thread':
        return (
          `[Thread, hop ${hop}] ${node.label} | ` +
          `${metadata.messageCount ?? 0} messages`
        );

      case 'calendar_event':
        return (
          `[Event, hop ${hop}] ${node.label} | ` +
          `${metadata.startTime ?? ''} | ` +
          `${metadata.location ?? ''}`
        );

      case 'topic':
        return `[Topic, hop ${hop}] ${node.label}`;

      case 'memory':
        return `[Memory] ${node.label} (${metadata.category ?? 'general'})`;

      default:
        return `[${node.nodeType}, hop ${hop}] ${node.label}`;
    }
  }
}
