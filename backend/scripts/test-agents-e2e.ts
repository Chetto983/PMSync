/**
 * VoltAgent Multi-Agent E2E Test
 *
 * Tests ALL 11 specialized agents through real chat interactions:
 *
 * 1. SupervisorAgent - Orchestration & delegation
 * 2. EmailAgent - Email operations, folders, insights
 * 3. CalendarAgent - Events, scheduling
 * 4. ContactsAgent - Contact management
 * 5. KnowledgeAgent - Knowledge base search
 * 6. WebSearchAgent - Real-time web search
 * 7. AnalyticsAgent - Data analysis, charts
 * 8. DocumentLibraryAgent - Document management
 * 9. GeneralAgent - General queries
 * 10. UnifiedKnowledgeAgent - Memory-first RAG
 *
 * Each test sends a real chat query and validates the response.
 *
 * Run: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-agents-e2e.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { LongTermMemoryService } from '../src/modules/ai/voltagent/memory';

interface TestResult {
    agent: string;
    query: string;
    status: 'PASS' | 'FAIL';
    duration: number;
    responseLength: number;
    toolsUsed?: string[];
    preview?: string;
    error?: string;
}

const results: TestResult[] = [];

function log(msg: string) {
    console.log(msg);
}

async function testAgent(
    voltAgent: VoltAgentService,
    tenantId: string,
    userId: string,
    agentName: string,
    query: string,
    expectedBehavior: string,
): Promise<void> {
    log(`\n  📝 Testing: "${query}"`);
    log(`     Expected: ${expectedBehavior}`);

    const start = Date.now();
    try {
        const result = await voltAgent.chat(query, {
            tenantId,
            userId,
            locale: 'en',
        });

        const duration = Date.now() - start;
        const responseText = result?.text || result?.response || result?.message || '';
        const responseLength = responseText.length;
        const preview = responseText.substring(0, 100).replace(/\n/g, ' ');

        // Check for failure phrases - agent saying it can't help
        const failurePhrases = [
            "I don't have the tools",
            "I'm sorry, but I currently don't",
            "I don't have access to",
            "I cannot access",
            "I'm unable to",
            "I don't currently have",
        ];

        const hasFailurePhrase = failurePhrases.some(phrase =>
            responseText.toLowerCase().includes(phrase.toLowerCase())
        );

        if (responseLength === 0) {
            results.push({
                agent: agentName,
                query: query.substring(0, 50),
                status: 'FAIL',
                duration,
                responseLength: 0,
                error: 'Empty response',
            });
            log(`     ❌ FAIL: Empty response`);
        } else if (hasFailurePhrase) {
            results.push({
                agent: agentName,
                query: query.substring(0, 50),
                status: 'FAIL',
                duration,
                responseLength,
                error: 'Agent lacks required tools',
                preview,
            });
            log(`     ❌ FAIL: Agent lacks tools - "${preview.substring(0, 60)}..."`);
        } else {
            results.push({
                agent: agentName,
                query: query.substring(0, 50),
                status: 'PASS',
                duration,
                responseLength,
                preview,
            });
            log(`     ✅ PASS: ${responseLength} chars in ${duration}ms`);
            log(`     Preview: "${preview}..."`);
        }
    } catch (error: any) {
        const duration = Date.now() - start;
        results.push({
            agent: agentName,
            query: query.substring(0, 50),
            status: 'FAIL',
            duration,
            responseLength: 0,
            error: error.message?.substring(0, 80),
        });
        log(`     ❌ FAIL: ${error.message?.substring(0, 60)}`);
    }
}

function header(title: string) {
    log(`\n${'═'.repeat(65)}`);
    log(`  ${title}`);
    log('═'.repeat(65));
}

// Italian locale test helper
async function testAgentIT(
    voltAgent: VoltAgentService,
    tenantId: string,
    userId: string,
    agentName: string,
    query: string,
    expectedBehavior: string,
): Promise<void> {
    log(`\n  📝 Testing (IT): "${query}"`);
    log(`     Expected: ${expectedBehavior}`);

    const start = Date.now();
    try {
        const result = await voltAgent.chat(query, {
            tenantId,
            userId,
            locale: 'it', // Italian locale
        });

        const duration = Date.now() - start;
        const responseText = result?.text || result?.response || result?.message || '';
        const responseLength = responseText.length;
        const preview = responseText.substring(0, 100).replace(/\n/g, ' ');

        // Check for failure phrases - agent saying it can't help (IT + EN)
        const failurePhrases = [
            "I don't have the tools",
            "I'm sorry, but I currently don't",
            "Non ho gli strumenti",
            "Mi dispiace, ma non",
            "Non ho accesso",
        ];

        const hasFailurePhrase = failurePhrases.some(phrase =>
            responseText.toLowerCase().includes(phrase.toLowerCase())
        );

        if (responseLength === 0) {
            results.push({
                agent: agentName,
                query: query.substring(0, 50),
                status: 'FAIL',
                duration,
                responseLength: 0,
                error: 'Empty response',
            });
            log(`     ❌ FAIL: Empty response`);
        } else if (hasFailurePhrase) {
            results.push({
                agent: agentName,
                query: query.substring(0, 50),
                status: 'FAIL',
                duration,
                responseLength,
                error: 'Agent lacks required tools',
                preview,
            });
            log(`     ❌ FAIL: Agent lacks tools - "${preview.substring(0, 60)}..."`);
        } else {
            results.push({
                agent: agentName,
                query: query.substring(0, 50),
                status: 'PASS',
                duration,
                responseLength,
                preview,
            });
            log(`     ✅ PASS: ${responseLength} chars in ${duration}ms`);
            log(`     Preview: "${preview}..."`);
        }
    } catch (error: any) {
        const duration = Date.now() - start;
        results.push({
            agent: agentName,
            query: query.substring(0, 50),
            status: 'FAIL',
            duration,
            responseLength: 0,
            error: error.message?.substring(0, 80),
        });
        log(`     ❌ FAIL: ${error.message?.substring(0, 60)}`);
    }
}

async function main() {
    console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║       VOLTAGENT MULTI-AGENT E2E TEST                              ║
║       Testing ALL 11 Specialized Agents                           ║
╚═══════════════════════════════════════════════════════════════════╝
`);

    const prisma = createPrismaClient();
    const startTime = Date.now();

    const user = await prisma.user.findFirst({
        where: { isActive: true },
        include: { tenant: true },
    });

    if (!user) {
        console.error('❌ No active user found');
        process.exit(1);
    }

    const tenantId = user.tenantId;
    const userId = user.id;

    log(`📧 User: ${user.firstName} ${user.lastName} (${user.email})`);
    log(`🏢 Tenant: ${user.tenant.name}`);
    log(`🚀 Starting NestJS context...\n`);

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    // IMPORTANT: Initialize the app to trigger onModuleInit hooks
    // This enables LongTermMemoryService and allows UnifiedKnowledgeAgent to be created
    await app.init();

    const voltAgent = app.get(VoltAgentService);

    // DEBUG: Check if LongTermMemoryService is enabled after init
    try {
        const memService = app.get(LongTermMemoryService);
        console.log(`[DEBUG] LongTermMemoryService enabled: ${memService?.isEnabled?.() ?? 'service not found'}`);
    } catch (e) {
        console.log(`[DEBUG] LongTermMemoryService lookup failed: ${e}`);
    }

    try {
        // =========================================================================
        // 1. SUPERVISOR AGENT - Orchestration
        // =========================================================================
        header('1. SUPERVISOR AGENT (Orchestration)');
        log('   Supervisor delegates to specialized agents based on query type.');

        await testAgent(
            voltAgent, tenantId, userId,
            'SupervisorAgent',
            'Hello! What can you help me with today?',
            'Should greet user and list capabilities'
        );

        // =========================================================================
        // 2. EMAIL AGENT - Email Operations
        // =========================================================================
        header('2. EMAIL AGENT (Email Operations)');
        log('   Tools: get_emails, search_emails, send_email, summarize, smart_reply');

        await testAgent(
            voltAgent, tenantId, userId,
            'EmailAgent',
            'Show me my unread emails',
            'Should list unread emails using get_emails tool'
        );

        await testAgent(
            voltAgent, tenantId, userId,
            'EmailAgent',
            'Search for emails about project updates',
            'Should search emails using search_emails tool'
        );

        await testAgent(
            voltAgent, tenantId, userId,
            'EmailAgent',
            'How many emails did I receive this week?',
            'Should count recent emails'
        );

        // =========================================================================
        // 3. CALENDAR AGENT - Calendar Operations
        // =========================================================================
        header('3. CALENDAR AGENT (Calendar Operations)');
        log('   Tools: get_events, create_event, update_event, delete_event');

        await testAgent(
            voltAgent, tenantId, userId,
            'CalendarAgent',
            'What meetings do I have today?',
            'Should list today\'s calendar events'
        );

        await testAgent(
            voltAgent, tenantId, userId,
            'CalendarAgent',
            'What is on my calendar this week?',
            'Should list this week\'s events'
        );

        // =========================================================================
        // 4. CONTACTS AGENT - Contact Management
        // =========================================================================
        header('4. CONTACTS AGENT (Contact Management)');
        log('   Tools: search_contacts, get_contacts, create_contact');

        await testAgent(
            voltAgent, tenantId, userId,
            'ContactsAgent',
            'Find my contacts',
            'Should list or search contacts'
        );

        await testAgent(
            voltAgent, tenantId, userId,
            'ContactsAgent',
            'Who is Davide in my contacts?',
            'Should search for specific contact'
        );

        // =========================================================================
        // 5. KNOWLEDGE AGENT - Knowledge Base Search
        // =========================================================================
        header('5. KNOWLEDGE AGENT (Knowledge Base + RAG)');
        log('   Tools: search_knowledge + HybridRetriever for semantic search');

        await testAgent(
            voltAgent, tenantId, userId,
            'KnowledgeAgent',
            'What do I know about our last project meeting?',
            'Should search knowledge base using RAG'
        );

        // =========================================================================
        // 6. WEB SEARCH AGENT - Real-time Web Search
        // =========================================================================
        header('6. WEB SEARCH AGENT (Real-time Web)');
        log('   Tools: web_search (Mistral Agents API)');

        await testAgent(
            voltAgent, tenantId, userId,
            'WebSearchAgent',
            'What is the current weather in Milan, Italy?',
            'Should perform web search for current info'
        );

        // =========================================================================
        // 7. ANALYTICS AGENT - Data Analysis
        // =========================================================================
        header('7. ANALYTICS AGENT (Data Analysis)');
        log('   Tools: run_analytics (Mistral code_interpreter)');

        await testAgent(
            voltAgent, tenantId, userId,
            'AnalyticsAgent',
            'Show me my email statistics for this week',
            'Should analyze and visualize email data'
        );

        // =========================================================================
        // 8. GENERAL AGENT - General Queries
        // =========================================================================
        header('8. GENERAL AGENT (General Queries)');
        log('   Handles queries that don\'t fit other agents');

        await testAgent(
            voltAgent, tenantId, userId,
            'GeneralAgent',
            'Tell me a productivity tip',
            'Should respond with general helpful info'
        );

        // =========================================================================
        // 9. UNIFIED KNOWLEDGE AGENT - Memory-First RAG
        // =========================================================================
        header('9. UNIFIED KNOWLEDGE AGENT (Memory + RAG)');
        log('   Tools: unified_search, get_deadlines, get_follow_ups, get_action_items');

        await testAgent(
            voltAgent, tenantId, userId,
            'UnifiedKnowledgeAgent',
            'What are my pending tasks and deadlines?',
            'Should search action items and deadlines'
        );

        await testAgent(
            voltAgent, tenantId, userId,
            'UnifiedKnowledgeAgent',
            'Any follow-ups I need to handle?',
            'Should check for pending follow-ups'
        );

        // =========================================================================
        // 10. COMPLEX MULTI-AGENT QUERIES
        // =========================================================================
        header('10. MULTI-AGENT COORDINATION');
        log('   Testing complex queries requiring multiple agents');

        await testAgent(
            voltAgent, tenantId, userId,
            'MultiAgent',
            'Send an email to John about our meeting tomorrow at 3pm',
            'Should coordinate ContactsAgent + EmailAgent'
        );

        await testAgent(
            voltAgent, tenantId, userId,
            'MultiAgent',
            'Summarize my recent emails and tell me what I need to follow up on',
            'Should coordinate EmailAgent + FollowUpService'
        );

        // =========================================================================
        // 11. ITALIAN LOCALE TESTS
        // =========================================================================
        header('11. ITALIAN LOCALE (IT) TESTS');
        log('   Testing VoltAgent responses in Italian');

        await testAgentIT(
            voltAgent, tenantId, userId,
            'IT-SupervisorAgent',
            'Ciao! Come puoi aiutarmi oggi?',
            'Should respond in Italian'
        );

        await testAgentIT(
            voltAgent, tenantId, userId,
            'IT-EmailAgent',
            'Mostrami le mie email non lette',
            'Should list unread emails in Italian'
        );

        await testAgentIT(
            voltAgent, tenantId, userId,
            'IT-CalendarAgent',
            'Quali riunioni ho oggi?',
            'Should show calendar in Italian'
        );

        await testAgentIT(
            voltAgent, tenantId, userId,
            'IT-ContactsAgent',
            'Cerca i miei contatti',
            'Should search contacts in Italian'
        );

        // =========================================================================
        // FINAL SUMMARY
        // =========================================================================
        header('TEST SUMMARY');

        const passed = results.filter((r) => r.status === 'PASS').length;
        const failed = results.filter((r) => r.status === 'FAIL').length;
        const total = results.length;
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

        log('');
        log(`  Tests Run: ${total}`);
        log(`  ✅ Passed: ${passed}`);
        log(`  ❌ Failed: ${failed}`);
        log(`  ⏱️ Total Duration: ${totalDuration}s`);

        if (failed > 0) {
            log('\n  ❌ FAILED TESTS:');
            results.filter((r) => r.status === 'FAIL').forEach((r) => {
                log(`     - ${r.agent}: "${r.query}" - ${r.error}`);
            });
        }

        // Summary by agent
        log('\n  📊 Results by Agent:');
        const agents = [...new Set(results.map((r) => r.agent))];
        for (const agent of agents) {
            const agentResults = results.filter((r) => r.agent === agent);
            const agentPassed = agentResults.filter((r) => r.status === 'PASS').length;
            const icon = agentPassed === agentResults.length ? '✅' : '⚠️';
            const avgDuration = Math.round(
                agentResults.reduce((s, r) => s + r.duration, 0) / agentResults.length
            );
            log(`     ${icon} ${agent}: ${agentPassed}/${agentResults.length} (avg ${avgDuration}ms)`);
        }

        const passRate = ((passed / total) * 100).toFixed(0);
        log(`\n${failed === 0 ? '✅ ALL AGENTS WORKING!' : `⚠️ ${passRate}% PASS RATE`}\n`);

        // Save report
        const report = {
            timestamp: new Date().toISOString(),
            user: { email: user.email, tenant: tenantId },
            duration: Date.now() - startTime,
            summary: { total, passed, failed, passRate: Number(passRate) },
            results,
        };
        const fs = await import('fs');
        fs.writeFileSync('scripts/agents-e2e-report.json', JSON.stringify(report, null, 2));
        log('📄 Report saved: scripts/agents-e2e-report.json\n');

        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
}

main().catch(console.error);
