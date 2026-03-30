import {
  Injectable,
  Logger,
  Inject,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { tool } from "ai";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../../../prisma/prisma.service";
import { MistralEmbeddingService } from "../../ai/services/mistral-embedding.service";
import { HybridSearchService } from "../services/hybrid-search.service";
import { GraphExpansionService } from "../services/graph-expansion.service";
import { EntityGraphService } from "../services/entity-graph.service";
import { ContextAssemblyService } from "../services/context-assembly.service";
import { truncateToolResult } from "../utils/tool-result-truncator";
import { validateEmbeddingVector } from "../../../common/utils/vector-validation";
import {
  TOOL_REGISTRY_SERVICE,
  IToolRegistryService,
} from "../../../common/interfaces/tool-registry.interface";

/**
 * PII resolve function type -- provided by AiChatService closure.
 */
type PiiResolveFn = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

interface ExistingMemoryCandidate {
  id: string;
  content: string;
  updatedAt: Date;
}

interface SemanticDuplicateCandidate {
  id: string;
  content: string;
}

/**
 * RagToolsService -- 5 RAG tools for the AI chat pipeline.
 *
 * Tools: semantic_search, graph_context_search, save_memory, list_memories, delete_memory
 *
 * semantic_search: Generates an embedding for the query and performs
 * vector similarity search across emails, contacts, and calendar data.
 *
 * save_memory: Stores a memory note with vector embedding for later retrieval.
 * Deduplicates by checking semantic similarity before inserting.
 *
 * list_memories: Lists all stored memories for the current user.
 *
 * delete_memory: Deletes a specific memory by ID.
 *
 * Phase 25: Tools & RAG
 */
const schemas = {
  semantic_search: z.object({
    query: z.string().describe("Natural language search query"),
    sources: z
      .array(z.enum(["emails", "contacts", "calendar"]))
      .optional()
      .describe("Sources to search. Omit to search all."),
    limit: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum results (default 10)"),
  }),
  graph_context_search: z.object({
    query: z.string().describe("Natural language search query"),
    limit: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .describe("Maximum seed results for expansion (default 5)"),
    hops: z
      .number()
      .min(1)
      .max(3)
      .optional()
      .describe("Graph traversal depth (default 2, max 3)"),
  }),
  save_memory: z.object({
    content: z.string().max(5000).describe("The information to remember"),
    category: z
      .string()
      .optional()
      .describe(
        'Category for organizing memories (e.g., "preference", "fact", "decision")',
      ),
    tags: z.string().optional().describe("Comma-separated tags for filtering"),
    contactId: z
      .string()
      .optional()
      .describe(
        "ID of the contact to anchor this memory to. Pass when memory relates to a specific contact.",
      ),
    emailId: z
      .string()
      .optional()
      .describe(
        "ID of the email to anchor this memory to. Pass when memory relates to a specific email.",
      ),
  }),
  list_memories: z.object({
    category: z
      .string()
      .optional()
      .describe(
        'Filter by category (e.g., "preference", "fact"). Omit to list all.',
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe("Maximum memories to return (default 20)"),
  }),
  delete_memory: z.object({
    memoryId: z.string().describe("The ID of the memory to delete"),
  }),
};

@Injectable()
export class RagToolsService implements OnModuleInit {
  private readonly logger = new Logger(RagToolsService.name);
  private static readonly MEMORY_DEDUP_SCAN_LIMIT = 50;
  private static readonly MEMORY_DEDUP_TOKEN_OVERLAP_THRESHOLD = 0.8;
  private static readonly MEMORY_DEDUP_VECTOR_DISTANCE_THRESHOLD = 0.15;

  constructor(
    private readonly mistralEmbeddingService: MistralEmbeddingService,
    private readonly prisma: PrismaService,
    private readonly hybridSearchService: HybridSearchService,
    private readonly graphExpansionService: GraphExpansionService,
    @Optional() private readonly entityGraphService: EntityGraphService,
    @Optional() private readonly contextAssemblyService: ContextAssemblyService,
    @Inject(TOOL_REGISTRY_SERVICE)
    private readonly toolRegistry: IToolRegistryService,
  ) {}

  onModuleInit() {
    const noop = async () => ({});
    const tools = [
      {
        name: "semantic_search",
        description:
          "Vector similarity search across emails, contacts, and calendar",
        riskLevel: "LOW" as const,
        requiresApproval: false,
        inputSchema: schemas.semantic_search,
      },
      {
        name: "graph_context_search",
        description: "Deep contextual search with graph expansion",
        riskLevel: "LOW" as const,
        requiresApproval: false,
        inputSchema: schemas.graph_context_search,
      },
      {
        name: "save_memory",
        description: "Store a fact or preference for future conversations",
        riskLevel: "MEDIUM" as const,
        requiresApproval: false,
        inputSchema: schemas.save_memory,
      },
      {
        name: "list_memories",
        description: "List stored user memories",
        riskLevel: "LOW" as const,
        requiresApproval: false,
        inputSchema: schemas.list_memories,
      },
      {
        name: "delete_memory",
        description: "Delete a stored memory by ID",
        riskLevel: "MEDIUM" as const,
        requiresApproval: true,
        inputSchema: schemas.delete_memory,
      },
    ];
    for (const t of tools) {
      this.toolRegistry.registerTool({
        name: t.name,
        description: t.description,
        parameters: {},
        execute: noop,
        domain: "knowledge",
        riskLevel: t.riskLevel,
        requiresApproval: t.requiresApproval,
        inputSchema: t.inputSchema,
      });
    }
  }

  /**
   * Returns all RAG tools with PII resolution via closure.
   */
  getTools(tenantId: string, userId: string, piiResolve: PiiResolveFn) {
    return {
      semantic_search: this.buildSemanticSearch(tenantId, piiResolve),
      graph_context_search: this.buildGraphContextSearch(tenantId, piiResolve),
      save_memory: this.buildSaveMemory(tenantId, userId, piiResolve),
      list_memories: this.buildListMemories(tenantId, userId),
      delete_memory: this.buildDeleteMemory(tenantId, userId),
    };
  }

  private buildSemanticSearch(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        "Search across emails, contacts, and calendar events by MEANING, not just keywords. " +
        "Use when the user describes what they are looking for in natural language: " +
        '"that conversation about the project deadline", "emails where Marco talked about budget". ' +
        "Do NOT use for specific keyword/sender lookups — use search_emails instead. " +
        "Optionally filter by source: emails, contacts, calendar. Omit to search all. " +
        "Returns: array of unified results ranked by semantic similarity. Max 20 results.",
      inputSchema: schemas.semantic_search,
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        const results = await this.hybridSearchService.search(
          tenantId,
          resolved.query,
          resolved.sources ?? ["emails", "contacts", "calendar"],
          resolved.limit ?? 10,
        );

        return truncateToolResult({ results, count: results.length });
      },
    });
  }

  private buildGraphContextSearch(tenantId: string, piiResolve: PiiResolveFn) {
    return tool({
      description:
        "Deep contextual search that finds emails AND expands related context via entity graph traversal: " +
        "thread conversation history, sender contact info, related calendar events, and entity relationships. " +
        "Use when the user needs to understand the FULL PICTURE around a topic — not just matching emails. " +
        'Examples: "what\'s the full context around the Acme deal?", "give me everything about the project deadline discussion", ' +
        '"what do I know about my interactions with Marco?". ' +
        "Returns: graph-expanded context with entity relationships and structured summaries.",
      inputSchema: schemas.graph_context_search,
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        const limit = resolved.limit ?? 5;
        const hops = resolved.hops ?? 2;

        // Use EntityGraphService if available, otherwise fall back to legacy
        if (this.entityGraphService && this.contextAssemblyService) {
          // Step 1: Find seed nodes via entity graph
          const seedIds = await this.entityGraphService.findSeedNodes(
            tenantId,
            resolved.query,
            limit,
          );

          if (seedIds.length === 0) {
            // Fallback: try hybrid search for seed emails
            const seedResults = await this.hybridSearchService.searchEmails(
              tenantId,
              resolved.query,
              limit,
            );
            if (seedResults.length === 0) {
              return truncateToolResult({
                context: "",
                summary: "No matching results found.",
              });
            }
            return truncateToolResult({
              context: seedResults
                .map((r) => `${r.subject} (from: ${r.from})`)
                .join("\n"),
              summary: `Found ${seedResults.length} matching emails via keyword search.`,
            });
          }

          // Step 2: Multi-hop traversal
          const traversalResults = await this.entityGraphService.traverse(
            tenantId,
            seedIds,
            { maxHops: hops },
          );

          // Step 3: Assemble structured context
          const assembled = this.contextAssemblyService.assemble(
            traversalResults,
            [],
            [],
          );

          return truncateToolResult({
            context: assembled.graphContext,
            summary: `Graph traversal found ${traversalResults.length} related entities across ${hops} hops.`,
            tokenCount: assembled.assembledTokenCount,
          });
        }

        // Legacy fallback: use GraphExpansionService
        const seedResults = await this.hybridSearchService.searchEmails(
          tenantId,
          resolved.query,
          limit,
        );

        if (seedResults.length === 0) {
          return truncateToolResult({
            seeds: [],
            expansion: {
              threadSiblings: [],
              contactMatches: [],
              calendarMatches: [],
            },
            summary: "No matching emails found.",
          });
        }

        const seedEmailIds = seedResults.map((r) => r.emailId);
        const seedThreadIds = seedResults.map(
          (r) => (r as any).threadId ?? null,
        );
        const seedSenders = seedResults.map((r) => r.from);

        const expansion = await this.graphExpansionService.expand(
          tenantId,
          seedEmailIds,
          seedThreadIds,
          seedSenders,
        );

        return truncateToolResult({
          seeds: seedResults.map((r) => ({
            emailId: r.emailId,
            subject: r.subject,
            from: r.from,
            snippet: r.snippet,
            receivedAt: r.receivedAt,
            score: r.rrfScore,
          })),
          expansion: {
            threadSiblings: expansion.threadSiblings,
            contactMatches: expansion.contactMatches,
            calendarMatches: expansion.calendarMatches,
          },
          summary: `Found ${seedResults.length} seed emails, expanded to ${expansion.threadSiblings.length} thread siblings, ${expansion.contactMatches.length} contacts, ${expansion.calendarMatches.length} calendar events.`,
        });
      },
    });
  }

  private buildSaveMemory(
    tenantId: string,
    userId: string,
    piiResolve: PiiResolveFn,
  ) {
    return tool({
      description:
        "Save a fact or preference that the AI should remember for future conversations. " +
        'Use when the user explicitly states a preference ("I prefer emails in Italian") ' +
        "or when you learn an important fact about the user during conversation. " +
        'If the user says "remember this", "save this", "store this", or "remember this exactly", call save_memory with that content instead of just summarizing existing memories. ' +
        'When the user asks to remember something exactly, preserve the user text verbatim in content. Do not translate or paraphrase it. ' +
        "Deduplicates automatically — if a very similar memory already exists, it updates instead of creating a duplicate. " +
        'Categories: "preference" (user preferences), "fact" (important info), ' +
        '"contact_note" (notes about specific contacts), "workflow" (user workflows). ' +
        "Returns: { id, content, category, savedAt, deduplicated }. " +
        "Do NOT call delete_memory to replace or deduplicate a memory â€” save_memory already handles that safely.",
      inputSchema: schemas.save_memory,
      execute: async (args) => {
        const resolved = (await piiResolve(
          args as unknown as Record<string, unknown>,
        )) as typeof args;

        // Generate embedding for the memory content
        const vector = await this.mistralEmbeddingService.generateEmbedding(
          resolved.content,
          undefined,
          { tenantId },
        );
        const validatedVector = validateEmbeddingVector(vector);
        const vectorLiteral = Prisma.raw(
          `'[${validatedVector.join(",")}]'::vector`,
        );

        const normalizedContent = this.normalizeMemoryContent(resolved.content);
        const recentMemories: ExistingMemoryCandidate[] =
          await this.prisma.aIMemory.findMany({
            where: { tenantId, userId },
            select: {
              id: true,
              content: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: RagToolsService.MEMORY_DEDUP_SCAN_LIMIT,
          });

        const exactDuplicates = recentMemories.filter(
          (memory) =>
            this.normalizeMemoryContent(memory.content) === normalizedContent,
        );

        const overlapCandidates =
          exactDuplicates.length > 0
            ? []
            : recentMemories
                .map((memory) => ({
                  ...memory,
                  overlap: this.computeTokenOverlap(
                    normalizedContent,
                    this.normalizeMemoryContent(memory.content),
                  ),
                }))
                .filter(
                  (candidate) =>
                    candidate.overlap >=
                    RagToolsService.MEMORY_DEDUP_TOKEN_OVERLAP_THRESHOLD,
                )
                .sort(
                  (left, right) =>
                    right.overlap - left.overlap ||
                    right.updatedAt.getTime() - left.updatedAt.getTime(),
                );

        let semanticCandidate: SemanticDuplicateCandidate | null = null;
        if (exactDuplicates.length === 0 && overlapCandidates.length === 0) {
          const vectorStr = `[${validatedVector.join(",")}]`;
          const dupVectorParam = Prisma.raw(`'${vectorStr}'::vector`);
          const duplicates = await this.prisma.$queryRaw<
            Array<{ id: string; content: string }>
          >(
            Prisma.sql`SELECT id, content FROM ai_memories
             WHERE "tenantId" = ${tenantId} AND "userId" = ${userId}
               AND vector IS NOT NULL
               AND (vector <-> ${dupVectorParam}) < ${RagToolsService.MEMORY_DEDUP_VECTOR_DISTANCE_THRESHOLD}
             ORDER BY (vector <-> ${dupVectorParam}) ASC
             LIMIT 1`,
          );
          semanticCandidate = duplicates[0] ?? null;
        }

        const canonicalMemory =
          exactDuplicates[0] ?? overlapCandidates[0] ?? semanticCandidate;

        if (canonicalMemory) {
          await this.prisma.aIMemory.update({
            where: { id: canonicalMemory.id },
            data: {
              content: resolved.content,
              category: resolved.category ?? undefined,
              tags: resolved.tags ?? undefined,
              contactId: resolved.contactId ?? undefined,
              emailId: resolved.emailId ?? undefined,
              updatedAt: new Date(),
            },
          });
          await this.prisma.$executeRaw(
            Prisma.sql`UPDATE "ai_memories" SET "vector" = ${vectorLiteral} WHERE "id" = ${canonicalMemory.id}`,
          );

          const duplicateIdsToDelete = exactDuplicates
            .filter((memory) => memory.id !== canonicalMemory.id)
            .map((memory) => memory.id);
          if (duplicateIdsToDelete.length > 0) {
            await this.prisma.aIMemory.deleteMany({
              where: {
                tenantId,
                userId,
                id: { in: duplicateIdsToDelete },
              },
            });
          }

          return truncateToolResult({
            id: canonicalMemory.id,
            content: resolved.content,
            category: resolved.category ?? null,
            savedAt: new Date(),
            deduplicated: true,
            previousContent: canonicalMemory.content,
            mergedDuplicates: duplicateIdsToDelete.length,
          });
        }

        // Save new memory
        const memory = await this.prisma.aIMemory.create({
          data: {
            tenantId,
            userId,
            content: resolved.content,
            category: resolved.category,
            tags: resolved.tags,
            memoryType: "FACT",
            confidence: 1.0,
            source: "chat",
            contactId: resolved.contactId ?? null,
            emailId: resolved.emailId ?? null,
          },
        });

        await this.prisma.$executeRaw(
          Prisma.sql`UPDATE "ai_memories" SET "vector" = ${vectorLiteral} WHERE "id" = ${memory.id}`,
        );

        // Auto-anchor memory to entity graph (fire-and-forget)
        this.anchorMemoryToGraph(
          tenantId,
          memory.id,
          resolved.contactId,
          resolved.emailId,
        ).catch((err) =>
          this.logger.warn(
            `Memory graph anchoring failed (non-blocking): ${err.message}`,
          ),
        );

        return truncateToolResult({
          id: memory.id,
          content: resolved.content,
          category: resolved.category ?? null,
          savedAt: memory.createdAt,
          deduplicated: false,
        });
      },
    });
  }

  private buildListMemories(tenantId: string, userId: string) {
    return tool({
      description:
        "List all memories stored for the current user. " +
        'Use when the user asks "what do you remember about me?", "show my memories", ' +
        "or similar requests. Optionally filter by category. " +
        "Returns: array of { id, content, category, tags, savedAt }.",
      inputSchema: schemas.list_memories,
      execute: async (args) => {
        const where: Prisma.AIMemoryWhereInput = {
          tenantId,
          userId,
          ...(args.category ? { category: args.category } : {}),
        };

        const memories = await this.prisma.aIMemory.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: args.limit ?? 20,
          select: {
            id: true,
            content: true,
            category: true,
            tags: true,
            createdAt: true,
            usageCount: true,
          },
        });

        return truncateToolResult({
          memories: memories.map((m) => ({
            id: m.id,
            content: m.content,
            category: m.category,
            tags: m.tags,
            savedAt: m.createdAt,
            timesUsed: m.usageCount,
          })),
          total: memories.length,
        });
      },
    });
  }

  private buildDeleteMemory(tenantId: string, userId: string) {
    return tool({
      description:
        "Delete a specific memory by its ID. " +
        'Use when the user asks to "forget" something or wants to remove a stored memory. ' +
        "Use list_memories first to find the memory ID. " +
        "Delete exactly ONE memory per request. If multiple memories could match, ask the user which single memory to remove instead of issuing multiple delete_memory calls. " +
        "Requires user approval before executing.",
      inputSchema: schemas.delete_memory,
      needsApproval: true,
      execute: async (args) => {
        const result = await this.prisma.aIMemory.deleteMany({
          where: {
            id: args.memoryId,
            tenantId,
            userId,
          },
        });

        if (result.count === 0) {
          return {
            success: false,
            error: "Memory not found or already deleted",
          };
        }

        return { success: true, deletedId: args.memoryId };
      },
    });
  }

  /**
   * Anchor a memory to entity graph nodes via 'anchored_to' edges.
   * Fire-and-forget -- failure must not break memory save.
   */
  private async anchorMemoryToGraph(
    tenantId: string,
    memoryId: string,
    contactId?: string,
    emailId?: string,
  ): Promise<void> {
    if (!contactId && !emailId) return;
    if (!this.entityGraphService) return;

    // Find or create memory node
    let memoryNode = await this.prisma.graphNode.findFirst({
      where: { tenantId, externalId: memoryId, nodeType: "memory" },
    });

    if (!memoryNode) {
      memoryNode = await this.prisma.graphNode.create({
        data: {
          tenantId,
          nodeType: "memory",
          externalId: memoryId,
          label: `Memory: ${memoryId.slice(0, 8)}`,
          metadata: {},
        },
      });
    }

    // Create anchored_to edges
    const targets: Array<{ externalId: string; nodeType: string }> = [];
    if (contactId) targets.push({ externalId: contactId, nodeType: "contact" });
    if (emailId) targets.push({ externalId: emailId, nodeType: "email" });

    for (const target of targets) {
      const targetNode = await this.prisma.graphNode.findFirst({
        where: {
          tenantId,
          externalId: target.externalId,
          nodeType: target.nodeType,
        },
      });
      if (!targetNode) continue;

      // Upsert edge (prevent duplicates)
      const existingEdge = await this.prisma.graphEdge.findFirst({
        where: {
          tenantId,
          sourceId: memoryNode.id,
          targetId: targetNode.id,
          edgeType: "anchored_to",
        },
      });

      if (!existingEdge) {
        await this.prisma.graphEdge.create({
          data: {
            tenantId,
            sourceId: memoryNode.id,
            targetId: targetNode.id,
            edgeType: "anchored_to",
            weight: 1.0,
            metadata: {},
          },
        });
      }
    }
  }

  private normalizeMemoryContent(content: string): string {
    return content
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  private computeTokenOverlap(
    normalizedLeft: string,
    normalizedRight: string,
  ): number {
    if (!normalizedLeft || !normalizedRight) return 0;

    const leftTokens = new Set(normalizedLeft.split(" ").filter(Boolean));
    const rightTokens = new Set(normalizedRight.split(" ").filter(Boolean));
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

    let shared = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) {
        shared += 1;
      }
    }

    return shared / Math.max(leftTokens.size, rightTokens.size);
  }
}
