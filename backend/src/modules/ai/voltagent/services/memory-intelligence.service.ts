import { Injectable, Logger } from '@nestjs/common';
import { MistralService } from '../../services/mistral.service';
import { AIMemoryService, Memory } from './ai-memory.service';
import {
    FACT_RETRIEVAL_PROMPT,
    MEMORY_DEDUCTION_PROMPT,
    MEMORY_SEARCH_PROMPT,
    inferMemoryType,
} from './memory-prompts';
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

@Injectable()
export class MemoryIntelligenceService {
    private readonly logger = new Logger(MemoryIntelligenceService.name);

    constructor(
        private readonly mistralService: MistralService,
        private readonly memoryService: AIMemoryService,
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
        try {
            // 1. Extract facts
            const facts = await this.extractFacts(message);
            if (facts.length === 0) {
                return;
            }
            this.logger.debug(`Extracted ${facts.length} facts from message`);

            // 2. Process each fact against existing memory
            await this.processFacts(tenantId, userId, facts);
        } catch (error) {
            this.logger.error(`Failed to process memory from message: ${error}`);
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
     */
    async processFacts(
        tenantId: string,
        userId: string,
        facts: string[],
    ): Promise<void> {
        for (const fact of facts) {
            // Find potentially relevant existing memories to provide context
            // Using simple text search for now
            const existingMemories = await this.memoryService.searchMemories(
                tenantId,
                userId,
                fact,
                5,
            );

            const decision = await this.deduceMemoryAction(fact, existingMemories);
            await this.executeMemoryActions(tenantId, userId, decision);
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
                        await this.memoryService.storeMemory(tenantId, userId, {
                            content: action.content,
                            type: inferMemoryType(action.content) as MemoryType, // Use helper to guess type
                            source: 'INFERRED',
                            confidence: 0.9,
                        });
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
     */
    async getRelevantContext(
        tenantId: string,
        userId: string,
        query: string,
    ): Promise<string> {
        const candidates = await this.memoryService.searchMemories(
            tenantId,
            userId,
            query,
            20 // Fetch a broader set
        );

        if (candidates.length === 0) return '';

        // Optional: Rerank with LLM if needed, for now just returning them formatted
        // If we wanted to use MEMORY_SEARCH_PROMPT we would do it here.
        // For cost/latency, we might just return the top search results for now
        // or implement the search prompt later.

        return candidates.map(m => `- ${m.content}`).join('\n');
    }
}
