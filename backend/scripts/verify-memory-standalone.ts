import { MemoryIntelligenceService } from '../src/modules/ai/voltagent/services/memory-intelligence.service';

// Mock Interfaces matching the minimal shape needed
const mockLogger = {
    debug: (msg: any) => console.log('[DEBUG]', msg),
    log: (msg: any) => console.log('[LOG]', msg),
    warn: (msg: any) => console.warn('[WARN]', msg),
    error: (msg: any) => console.error('[ERROR]', msg),
};

// Mock Services
class MockMistralService {
    private responses: string[] = [];

    queueResponse(response: any) {
        this.responses.push(JSON.stringify(response));
    }

    async completePrompt(options: any) {
        const response = this.responses.shift();
        if (!response) throw new Error('No mock response queued');
        return response;
    }
}

class MockAIMemoryService {
    public memories: any[] = [];

    async searchMemories(tenantId: string, userId: string, query: string) {
        // Simple mock search
        return this.memories.filter(m => m.content.toLowerCase().includes(query.toLowerCase()));
    }

    async storeMemory(tenantId: string, userId: string, input: any) {
        const memory = { id: 'mem_' + Date.now(), ...input, tenantId, userId };
        this.memories.push(memory);
        console.log('[MockDB] Stored:', memory);
        return memory;
    }

    async updateMemory(tenantId: string, userId: string, id: string, input: any) {
        const index = this.memories.findIndex(m => m.id === id);
        if (index !== -1) {
            this.memories[index] = { ...this.memories[index], ...input };
            console.log('[MockDB] Updated:', this.memories[index]);
            return this.memories[index];
        }
    }

    async deleteMemory(tenantId: string, userId: string, id: string) {
        this.memories = this.memories.filter(m => m.id !== id);
        console.log('[MockDB] Deleted:', id);
    }
}

async function runVerification() {
    console.log('--- Starting Standalone Verification ---');

    const mockMistral = new MockMistralService();
    const mockMemory = new MockAIMemoryService();

    // Manually instantiate service (ignoring NestJS DI for this standalone check)
    const service = new MemoryIntelligenceService(
        mockMistral as any,
        mockMemory as any
    );
    // @ts-ignore
    service.logger = mockLogger;

    const TENANT = 'test-tenant';
    const USER = 'test-user';

    // --- Test Case 1: New Fact ---
    console.log('\n--- Test 1: Extract New Fact ---');
    mockMistral.queueResponse({ facts: ['User likes TypeScript'] }); // Extraction result
    mockMistral.queueResponse({ actions: [{ action: 'ADD', content: 'User likes TypeScript' }] }); // Deduction result

    await service.processMemoryFromMessage(TENANT, USER, "I really like using TypeScript");

    if (mockMemory.memories.length === 1 && mockMemory.memories[0].content === 'User likes TypeScript') {
        console.log('✅ Test 1 Passed: Memory stored');
    } else {
        console.error('❌ Test 1 Failed', mockMemory.memories);
        process.exit(1);
    }

    // --- Test Case 2: Update Fact ---
    console.log('\n--- Test 2: Update Fact ---');
    // Existing memory is already in mockMemory from Test 1.

    mockMistral.queueResponse({ facts: ['User prefers Rust now'] }); // Extraction
    mockMistral.queueResponse({ // Deduction (mocking that it saw the previous memory)
        actions: [{ action: 'UPDATE', memory_id: mockMemory.memories[0].id, content: 'User prefers Rust over TypeScript' }]
    });

    await service.processMemoryFromMessage(TENANT, USER, "Actually I prefer Rust now");

    if (mockMemory.memories.length === 1 && mockMemory.memories[0].content === 'User prefers Rust over TypeScript') {
        console.log('✅ Test 2 Passed: Memory updated');
    } else {
        console.error('❌ Test 2 Failed', mockMemory.memories);
        process.exit(1);
    }

    console.log('\n✅✅ ALL TESTS PASSED ✅✅');
}

runVerification().catch(console.error);
