/**
 * Few-shot examples for dynamic injection into the system prompt.
 *
 * Each example demonstrates a multi-step tool chain for a specific
 * query sub-type. Selected dynamically based on QueryClassification:
 * - simple: 0 examples
 * - search: 1 example (best match by keywords)
 * - multi_hop: 2-3 examples (matching sub-type first, then others)
 *
 * Phase 109: Graph RAG Pipeline (Plan 03)
 */
import type { MultiHopSubType, QueryClassification } from '../services/query-router.service';

export interface FewShotExample {
  id: string;
  subType: MultiHopSubType;
  description: string;
  /** The actual prompt text injected into the system prompt */
  example: string;
  /** Pre-measured token count (approximate via string length / 4) */
  tokenCount: number;
}

export const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    id: 'relationship',
    subType: 'relationship',
    description: 'Relationship query: finding what a contact said about a topic',
    example: `Example: "What did Marco say about the project?"
Approach: 1) Use graph_context_search to find Marco's contact node 2) Traverse edges to emails Marco sent/received 3) Filter by topic relevance 4) Assemble timeline of Marco's statements about the project`,
    tokenCount: 0,
  },
  {
    id: 'temporal_entity',
    subType: 'temporal_entity',
    description: 'Temporal+entity query: finding emails from people at an event',
    example: `Example: "Find emails from people I met at the conference about budget"
Approach: 1) Search calendar events for "conference" 2) Extract attendee contacts 3) Search those contacts' emails for "budget" 4) Return relevant threads with context`,
    tokenCount: 0,
  },
  {
    id: 'memory_context',
    subType: 'memory',
    description: 'Memory+context query: recalling stored knowledge about an entity',
    example: `Example: "What do I know about Acme Corp's payment terms?"
Approach: 1) Search memories anchored to Acme Corp contact 2) Search emails from Acme Corp contacts 3) Combine memory facts with email evidence 4) Present consolidated answer with sources`,
    tokenCount: 0,
  },
  {
    id: 'cross_domain',
    subType: 'cross_domain',
    description: 'Cross-domain correlation: combining calendar, email, and relationship data',
    example: `Example: "Who should I follow up with this week?"
Approach: 1) Scan calendar for this week's meetings 2) Check email recency for each contact 3) Score by relationship strength and last contact date 4) Return prioritized follow-up list`,
    tokenCount: 0,
  },
];

// Pre-measure token counts at module load (approximate: length / 4)
for (const ex of FEW_SHOT_EXAMPLES) {
  ex.tokenCount = Math.ceil(ex.example.length / 4);
}

/** Max token budget for few-shot section */
const FEW_SHOT_TOKEN_BUDGET = 800;

/**
 * Select few-shot examples based on query classification.
 *
 * - simple: 0 examples (empty array)
 * - search: 1 most relevant example
 * - multi_hop: 2-3 examples, starting with matching sub-type
 *
 * @returns Array of example text strings ready for prompt injection
 */
export function selectFewShotExamples(classification: QueryClassification): string[] {
  if (classification.complexity === 'simple') {
    return [];
  }

  if (classification.complexity === 'search') {
    // Return the first example that fits in budget (any is useful for search)
    const first = FEW_SHOT_EXAMPLES[0];
    return first && first.tokenCount <= FEW_SHOT_TOKEN_BUDGET
      ? [first.example]
      : [];
  }

  // multi_hop: match sub-type first, then add others up to budget
  const subType = classification.multiHopSubType ?? 'general';
  const matching = FEW_SHOT_EXAMPLES.find((ex) => ex.subType === subType);
  const others = FEW_SHOT_EXAMPLES.filter((ex) => ex.subType !== subType);

  const selected: string[] = [];
  let usedTokens = 0;

  // Primary: matching sub-type example
  if (matching && usedTokens + matching.tokenCount <= FEW_SHOT_TOKEN_BUDGET) {
    selected.push(matching.example);
    usedTokens += matching.tokenCount;
  }

  // Fill with others until budget or 3 total
  for (const ex of others) {
    if (selected.length >= 3) break;
    if (usedTokens + ex.tokenCount > FEW_SHOT_TOKEN_BUDGET) continue;
    selected.push(ex.example);
    usedTokens += ex.tokenCount;
  }

  return selected;
}
