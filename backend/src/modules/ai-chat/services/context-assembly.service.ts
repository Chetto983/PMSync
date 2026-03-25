/**
 * ContextAssemblyService -- Token-budgeted context builder.
 *
 * Assembles graph traversal results, memories, and few-shot examples
 * into structured prompt context within a token budget.
 * Uses structured field extraction (no LLM summarization).
 *
 * Phase 109: Graph RAG Pipeline (Plan 02 + Plan 03)
 */
import { Injectable, Logger } from '@nestjs/common';
import type { GraphTraversalResult } from './entity-graph.service';
import type { MemoryResult } from './memory.service';

export interface AssembledContext {
  graphContext: string;
  memoryContext: string;
  fewShotContext: string;
  rawTokenCount: number;
  assembledTokenCount: number;
}

interface AssembleOptions {
  tokenBudget?: number;
}

/** Default total RAG context budget */
const DEFAULT_TOKEN_BUDGET = 4096;

/** Budget split ratios */
const GRAPH_RATIO = 0.6;
const MEMORY_RATIO = 0.2;
const FEWSHOT_RATIO = 0.2;

@Injectable()
export class ContextAssemblyService {
  private readonly logger = new Logger(ContextAssemblyService.name);

  /**
   * Assemble graph results, memories, and few-shot examples into
   * structured prompt context within a token budget.
   */
  assemble(
    graphResults: GraphTraversalResult[],
    memories: MemoryResult[],
    fewShotExamples: string[],
    options?: AssembleOptions,
  ): AssembledContext {
    const tokenBudget = options?.tokenBudget ?? DEFAULT_TOKEN_BUDGET;
    const graphBudget = Math.floor(tokenBudget * GRAPH_RATIO);
    const memoryBudget = Math.floor(tokenBudget * MEMORY_RATIO);
    const fewShotBudget = Math.floor(tokenBudget * FEWSHOT_RATIO);

    // Track raw token count (before assembly)
    const rawGraphTokens = graphResults.reduce(
      (acc, r) => acc + this.countTokens(JSON.stringify(r)),
      0,
    );
    const rawMemoryTokens = memories.reduce(
      (acc, m) => acc + this.countTokens(m.content),
      0,
    );
    const rawFewShotTokens = fewShotExamples.reduce(
      (acc, ex) => acc + this.countTokens(ex),
      0,
    );
    const rawTokenCount = rawGraphTokens + rawMemoryTokens + rawFewShotTokens;

    // Assemble graph context
    const sortedGraph = [...graphResults].sort((a, b) => b.score - a.score);
    let graphTokens = 0;
    const graphLines: string[] = [];
    for (const node of sortedGraph) {
      const line = this.assembleNodeContext(node);
      const lineTokens = this.countTokens(line);
      if (graphTokens + lineTokens > graphBudget) break;
      graphLines.push(line);
      graphTokens += lineTokens;
    }

    // Assemble memory context
    let memoryTokens = 0;
    const memoryLines: string[] = [];
    for (const memory of memories) {
      const line = `- ${memory.category ? `[${memory.category}] ` : ''}${memory.content}`;
      const lineTokens = this.countTokens(line);
      if (memoryTokens + lineTokens > memoryBudget) break;
      memoryLines.push(line);
      memoryTokens += lineTokens;
    }

    // Assemble few-shot context
    let fewShotTokens = 0;
    const selectedExamples: string[] = [];
    for (const example of fewShotExamples) {
      const exTokens = this.countTokens(example);
      if (fewShotTokens + exTokens > fewShotBudget) break;
      selectedExamples.push(example);
      fewShotTokens += exTokens;
    }

    const assembledTokenCount = graphTokens + memoryTokens + fewShotTokens;

    return {
      graphContext: graphLines.length > 0
        ? `## Relevant Context\n${graphLines.join('\n')}`
        : '',
      memoryContext: memoryLines.length > 0
        ? `## Known Facts\n${memoryLines.join('\n')}`
        : '',
      fewShotContext: selectedExamples.join('\n\n'),
      rawTokenCount,
      assembledTokenCount,
    };
  }

  /**
   * Approximate token count using string length / 4.
   * Good enough for budget enforcement (within 5% of BPE).
   */
  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Format a graph node into a structured one-liner for prompt context.
   */
  private assembleNodeContext(node: GraphTraversalResult): string {
    const meta = node.metadata ?? {};
    switch (node.nodeType) {
      case 'email':
        return `[Email, hop ${node.hop}${node.edgeType ? `, via ${node.edgeType}` : ''}] Subject: ${meta.subject ?? node.label} | From: ${meta.from ?? 'unknown'} | Date: ${meta.receivedAt ?? ''} | Snippet: ${String(meta.snippet ?? '').slice(0, 100)}`;
      case 'contact':
        return `[Contact, hop ${node.hop}] ${node.label} | ${meta.company ?? ''} | ${meta.jobTitle ?? ''} | Score: ${meta.relationshipScore ?? 'N/A'}`;
      case 'thread':
        return `[Thread, hop ${node.hop}] ${node.label} | ${meta.messageCount ?? '?'} messages`;
      case 'calendar_event':
        return `[Event, hop ${node.hop}] ${node.label} | ${meta.startTime ?? ''} | ${meta.location ?? ''}`;
      case 'topic':
        return `[Topic, hop ${node.hop}] ${node.label}`;
      case 'memory':
        return `[Memory] ${node.label} (${meta.category ?? 'general'})`;
      default:
        return `[${node.nodeType}, hop ${node.hop}] ${node.label}`;
    }
  }
}
