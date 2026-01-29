import { Injectable, Logger } from '@nestjs/common';
import { MistralService } from '../../services/mistral.service';
import { AIMemoryService, Memory, MemoryWithScore } from './ai-memory.service';
import { PiiDetectionService, type PiiMatch } from '../../guards';
import {
    FACT_RETRIEVAL_PROMPT,
    MEMORY_DEDUCTION_PROMPT,
    MEMORY_SEARCH_PROMPT,
    inferMemoryType,
} from '../prompts';
import { MemoryType } from '@prisma/client';

interface FactExtractionResult {
    facts: string[];
}

interface MemoryAction {
    action: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE';
    content: string;
    memory_id?: string;
}

interface MemoryDeductionResult {
    actions: MemoryAction[];
}

interface MemoryRelevanceResult {
    relevant_memories: Array<{
        memory_id: string;
        score: number;
        reason: string;
    }>;
}

@Injectable()
export class MemoryIntelligenceService {
    private readonly logger = new Logger(MemoryIntelligenceService.name);

    constructor(
        private readonly mistralService: MistralService,
        private readonly memoryService: AIMemoryService,
        private readonly piiDetectionService?: PiiDetectionService,
    ) { }

    /**
     * Process a user message to extract and store significant memories.
     * This is the main entry point for the memory system.
     */
    async processMemoryFromMessage(
        tenantId: string,
        userId: string,
        message: string,
    ): Promise<void> {
        const startTime = Date.now();
        try {
            const piiResult = this.piiDetectionService?.detect(message);
            const safeMessage = piiResult?.redactedText ?? message;
            const piiMatches = piiResult?.details ?? [];

            // 1. Extract facts from conversation
            const facts = await this.extractFacts(safeMessage);
            const extractTime = Date.now() - startTime;

            if (facts.length === 0) {
                this.logger.debug(`[Memory] No facts extracted (${extractTime}ms) - message length: ${message.length}`);
                return;
            }
            this.logger.log(`[Memory] Extracted ${facts.length} facts in ${extractTime}ms: ${facts.slice(0, 3).join('; ')}${facts.length > 3 ? '...' : ''}`);

            // 2. Process each fact against existing memory
            await this.processFacts(tenantId, userId, facts, piiMatches);
            this.logger.log(`[Memory] Processed ${facts.length} facts in ${Date.now() - startTime}ms`);
        } catch (error) {
            this.logger.error(`[Memory] Failed to process memory: ${error}`);
        }
    }

    /**
     * Extract potential facts from a conversation message
     */
    async extractFacts(message: string): Promise<string[]> {
        try {
            const prompt = `${FACT_RETRIEVAL_PROMPT}\n\nUser Message:\n"${message}"`;

            const response = await this.mistralService.completePrompt({
                userPrompt: prompt,
                temperature: 0,
                jsonMode: true,
                modelTier: 'medium',
                validationContext: 'SYSTEM_INTERNAL', // Internal fact extraction - skip jailbreak patterns
            });

            const parsed: FactExtractionResult = JSON.parse(response);
            return parsed.facts || [];
        } catch (error) {
            this.logger.warn(`Fact extraction failed: ${error}`);
            return [];
        }
    }

    /**
     * Compare new facts with existing memories and decide on updates
     * Uses semantic search to find related memories
     */
    async processFacts(
        tenantId: string,
        userId: string,
        facts: string[],
        piiMatches: PiiMatch[] = [],
    ): Promise<void> {
        for (const fact of facts) {
            // Find potentially relevant existing memories using semantic search
            const existingMemories = await this.memoryService.searchMemoriesSemantic(
                tenantId,
                userId,
                fact,
                5,
                0.8, // Only consider fairly similar memories (distance < 0.8)
            );

            let combinedMatches = piiMatches;
            let safeMemories = existingMemories;

            if (this.piiDetectionService) {
                const collected: PiiMatch[] = [...piiMatches];
                safeMemories = existingMemories.map((memory) => {
                    const content = memory.content ?? '';
                    if (content && this.piiDetectionService?.containsPii(content)) {
                        const detected = this.piiDetectionService.detect(content);
                        if (detected.details.length > 0) {
                            collected.push(...detected.details);
                        }
                        return { ...memory, content: detected.redactedText };
                    }
                    return memory;
                });
                combinedMatches = collected;
            }

            const decision = await this.deduceMemoryAction(fact, safeMemories);
            const resolvedActions = combinedMatches.length > 0 && this.piiDetectionService
                ? decision.map((action) => ({
                    ...action,
                    content: this.piiDetectionService?.resolveFromMatches(action.content, combinedMatches) ?? action.content,
                }))
                : decision;
            await this.executeMemoryActions(tenantId, userId, resolvedActions);
        }
    }

    /**
     * Ask LLM what to do with a fact given existing context
     */
    private async deduceMemoryAction(
        fact: string,
        existingMemories: Memory[],
    ): Promise<MemoryAction[]> {
        try {
            const context =
                existingMemories.length > 0
                    ? JSON.stringify(
                        existingMemories.map((m) => ({
                            memory_id: m.id,
                            content: m.content,
                            type: m.memoryType,
                        })),
                    )
                    : '[]';

            const prompt = `${MEMORY_DEDUCTION_PROMPT}\n\nExisting Memories:\n${context}\n\nNew Fact:\n"${fact}"`;

            const response = await this.mistralService.completePrompt({
                userPrompt: prompt,
                temperature: 0,
                jsonMode: true,
                modelTier: 'medium',
                validationContext: 'SYSTEM_INTERNAL', // Internal memory deduction - skip jailbreak patterns
            });

            const parsed: MemoryDeductionResult = JSON.parse(response);
            return parsed.actions || [];
        } catch (error) {
            this.logger.warn(`Memory deduction failed: ${error}`);
            return [];
        }
    }

    /**
     * Execute the decided actions (ADD, UPDATE, DELETE)
     */
    private async executeMemoryActions(
        tenantId: string,
        userId: string,
        actions: MemoryAction[],
    ): Promise<void> {
        for (const action of actions) {
            try {
                switch (action.action) {
                    case 'ADD':
                        const memType = inferMemoryType(action.content) as MemoryType;
                        await this.memoryService.storeMemory(tenantId, userId, {
                            content: action.content,
                            type: memType,
                            source: 'INFERRED',
                            confidence: 0.9,
                        });
                        this.logger.log(`[Memory] STORED: type=${memType} content="${action.content.slice(0, 80)}..."`);
                        break;

                    case 'UPDATE':
                        if (action.memory_id) {
                            await this.memoryService.updateMemory(
                                tenantId,
                                userId,
                                action.memory_id,
                                {
                                    content: action.content,
                                    // Re-evaluate type on update? maybe not needed
                                },
                            );
                        }
                        break;

                    case 'DELETE':
                        if (action.memory_id) {
                            await this.memoryService.deleteMemory(
                                tenantId,
                                userId,
                                action.memory_id,
                            );
                        }
                        break;

                    case 'NONE':
                    default:
                        // Do nothing
                        break;
                }
            } catch (error) {
                this.logger.error(
                    `Failed to execute memory action ${action.action}: ${error}`,
                );
            }
        }
    }

    /**
     * Retrieve relevant context for a user query (RAG-lite)
     * Uses semantic search with optional LLM re-ranking
     *
     * @param tenantId - Tenant isolation
     * @param userId - User isolation
     * @param query - User's current query/message
     * @param options - Configuration options
     * @returns Formatted string of relevant memories for context injection
     */
    async getRelevantContext(
        tenantId: string,
        userId: string,
        query: string,
        options: {
            limit?: number;
            useReranking?: boolean;
            minScore?: number;
        } = {},
    ): Promise<string> {
        const startTime = Date.now();
        // minScore 0.55 filters out weak matches (score = 1 - distance/2)
        // Score 0.5 = orthogonal/unrelated, 0.55+ = some semantic similarity
        const { limit = 10, useReranking = false, minScore = 0.55 } = options;

        try {
            // Use semantic search for better relevance
            const searchStart = Date.now();
            const candidates = await this.memoryService.searchMemoriesSemantic(
                tenantId,
                userId,
                query,
                useReranking ? 20 : limit, // Fetch more if re-ranking
                1.4, // Max distance (1.4 = score 0.3)
            );
            const searchTime = Date.now() - searchStart;

            if (candidates.length === 0) {
                this.logger.log(`[PERF] getRelevantContext: search=${searchTime}ms | found=0 | total=${Date.now() - startTime}ms`);
                return '';
            }

            this.logger.debug(`Found ${candidates.length} candidate memories for context`);

            // Filter by minimum score
            let relevant = candidates.filter((m) => m.score >= minScore);

            // Optional: Re-rank with LLM for better precision
            let rerankTime = 0;
            if (useReranking && relevant.length > 3) {
                const rerankStart = Date.now();
                relevant = await this.rerankWithLLM(query, relevant, limit);
                rerankTime = Date.now() - rerankStart;
            }

            // Take top results
            const topMemories = relevant.slice(0, limit);

            // Record usage for retrieved memories (async, fire-and-forget)
            // FIX M5: Pass tenantId/userId for proper tenant scoping
            for (const memory of topMemories) {
                this.memoryService.recordUsage(tenantId, userId, memory.id).catch(() => {
                    // Ignore usage tracking errors
                });
            }

            // Format for context injection with type labels
            const result = this.formatMemoriesForContext(topMemories);

            this.logger.log(
                `[PERF] getRelevantContext: search=${searchTime}ms | ` +
                `rerank=${rerankTime}ms | found=${topMemories.length} | ` +
                `total=${Date.now() - startTime}ms`
            );

            return result;
        } catch (error) {
            this.logger.error(`Failed to get relevant context: ${error}`);
            return '';
        }
    }

    /**
     * Re-rank memories using LLM for better precision
     * Uses MEMORY_SEARCH_PROMPT to evaluate relevance
     */
    private async rerankWithLLM(
        query: string,
        memories: MemoryWithScore[],
        limit: number,
    ): Promise<MemoryWithScore[]> {
        try {
            const safeQuery = this.piiDetectionService
                ? this.piiDetectionService.redact(query)
                : query;
            const safeMemories = this.piiDetectionService
                ? memories.map((m) => ({
                    ...m,
                    content: this.piiDetectionService?.redact(m.content ?? '') ?? m.content,
                }))
                : memories;

            const memoriesContext = JSON.stringify(
                safeMemories.map((m) => ({
                    memory_id: m.id,
                    content: m.content,
                    type: m.memoryType,
                    vector_score: m.score.toFixed(2),
                })),
            );

            const prompt = `${MEMORY_SEARCH_PROMPT}\n\nQuery:\n"${safeQuery}"\n\nMemories:\n${memoriesContext}`;

            const response = await this.mistralService.completePrompt({
                userPrompt: prompt,
                temperature: 0,
                jsonMode: true,
                modelTier: 'fast', // Use fast model for re-ranking (cost optimization)
                validationContext: 'SYSTEM_INTERNAL', // Internal memory search - skip jailbreak patterns
            });

            const parsed: MemoryRelevanceResult = JSON.parse(response);

            if (!parsed.relevant_memories?.length) {
                return memories.slice(0, limit);
            }

            // Merge LLM scores with vector scores
            const reranked: MemoryWithScore[] = [];
            for (const ranked of parsed.relevant_memories) {
                const original = memories.find((m) => m.id === ranked.memory_id);
                if (original && ranked.score >= 0.3) {
                    reranked.push({
                        ...original,
                        // Combine vector score (70%) with LLM score (30%)
                        score: original.score * 0.7 + ranked.score * 0.3,
                    });
                }
            }

            // Sort by combined score
            reranked.sort((a, b) => b.score - a.score);

            this.logger.debug(`Re-ranked ${reranked.length} memories with LLM`);
            return reranked.slice(0, limit);
        } catch (error) {
            this.logger.warn(`LLM re-ranking failed, using vector scores: ${error}`);
            return memories.slice(0, limit);
        }
    }

    /**
     * Format memories for injection into chat context
     * Groups by type and includes relevance indicators
     */
    private formatMemoriesForContext(memories: MemoryWithScore[]): string {
        if (memories.length === 0) return '';

        // Group by type for better organization
        const byType: Record<string, MemoryWithScore[]> = {};
        for (const memory of memories) {
            const type = memory.memoryType;
            if (!byType[type]) byType[type] = [];
            byType[type].push(memory);
        }

        const lines: string[] = [];

        // Format each type group
        const typeLabels: Record<string, string> = {
            PREFERENCE: 'User Preferences',
            FACT: 'Known Facts',
            PATTERN: 'Behavioral Patterns',
            INTERACTION: 'Past Interactions',
            CONTACT_NOTE: 'Contact Notes',
        };

        for (const [type, typeMemories] of Object.entries(byType)) {
            const label = typeLabels[type] || type;
            lines.push(`**${label}:**`);
            for (const m of typeMemories) {
                // Include score indicator for high-confidence memories
                const confidence = m.score >= 0.7 ? ' [high relevance]' : '';
                lines.push(`- ${m.content}${confidence}`);
            }
        }

        return lines.join('\n');
    }
}
