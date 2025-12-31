/**
 * AI Module HTTP API E2E Test
 * 
 * Tests AI APIs as a REAL USER would - making HTTP requests with JWT auth.
 * NO mocks, NO service injection - pure API testing!
 * 
 * Run with: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-ai-api-e2e.ts
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import axios, { AxiosInstance } from 'axios';
import * as jwt from 'jsonwebtoken';

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
    name: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    duration: number;
    details?: string;
    error?: string;
}

const results: TestResult[] = [];

function log(msg: string) { console.log(msg); }

async function test(name: string, testFn: () => Promise<any>): Promise<void> {
    const start = Date.now();
    try {
        const details = await testFn();
        const duration = Date.now() - start;
        results.push({ name, status: 'PASS', duration, details: JSON.stringify(details).substring(0, 100) });
        log(`  ✅ ${name} (${duration}ms)`);
        if (details) log(`     ${JSON.stringify(details).substring(0, 80)}`);
    } catch (error: any) {
        const duration = Date.now() - start;
        const errMsg = error.response?.data?.message || error.message;
        results.push({ name, status: 'FAIL', duration, error: errMsg });
        log(`  ❌ ${name} (${duration}ms) - ${errMsg}`);
    }
}

async function main() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║       AI MODULE HTTP API E2E TEST                              ║
║       Testing as REAL USER with JWT Auth                       ║
╚════════════════════════════════════════════════════════════════╝
`);

    const prisma = createPrismaClient();
    const startTime = Date.now();

    try {
        // Get test user
        const user = await prisma.user.findFirst({
            where: { isActive: true },
            include: { tenant: true },
        });

        if (!user) {
            console.error('❌ No active user found');
            process.exit(1);
        }

        log(`📧 User: ${user.email}`);
        log(`🏢 Tenant: ${user.tenant.name} (${user.tenantId})`);
        log(`🌐 API: ${API_URL}\n`);

        // Create real JWT token (same as frontend would use)
        const token = jwt.sign(
            {
                userId: user.id,
                tenantId: user.tenantId,
                email: user.email,
                sub: user.id,
            },
            process.env.JWT_SECRET!,
            { expiresIn: '1h' }
        );

        const api: AxiosInstance = axios.create({
            baseURL: API_URL,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000, // 60s for LLM calls
            validateStatus: () => true,
        });

        // ==================================================================
        // AI HEALTH & STATUS
        // ==================================================================
        log('═══════════════════════════════════════════════════════════');
        log('  AI HEALTH & STATUS');
        log('═══════════════════════════════════════════════════════════');

        await test('GET /ai/health', async () => {
            const res = await api.get('/ai/health');
            if (res.status !== 200) throw new Error(`Status ${res.status}`);
            return res.data;
        });

        // ==================================================================
        // VOLTAGENT ENDPOINTS
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  VOLTAGENT ENDPOINTS');
        log('═══════════════════════════════════════════════════════════');

        await test('GET /api/v1/voltagent/stats/performance', async () => {
            const res = await api.get('/api/v1/voltagent/stats/performance');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        await test('GET /api/v1/voltagent/cache/analytics', async () => {
            const res = await api.get('/api/v1/voltagent/cache/analytics');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        await test('GET /api/v1/voltagent/stats/optimizations', async () => {
            const res = await api.get('/api/v1/voltagent/stats/optimizations');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        // ==================================================================
        // HITL (Human-in-the-Loop) ENDPOINTS
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  HITL ENDPOINTS');
        log('═══════════════════════════════════════════════════════════');

        await test('GET /api/v1/voltagent/actions/pending', async () => {
            const res = await api.get('/api/v1/voltagent/actions/pending');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return { count: res.data.actions?.length || 0, total: res.data.total };
        });

        await test('GET /api/v1/voltagent/actions/counts', async () => {
            const res = await api.get('/api/v1/voltagent/actions/counts');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        await test('GET /api/v1/voltagent/actions/history', async () => {
            const res = await api.get('/api/v1/voltagent/actions/history?limit=10');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return { count: res.data.actions?.length || 0 };
        });

        // ==================================================================
        // DAILY BRIEFING
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  DAILY BRIEFING');
        log('═══════════════════════════════════════════════════════════');

        await test('GET /api/v1/voltagent/briefing', async () => {
            const res = await api.get('/api/v1/voltagent/briefing');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return {
                hasData: !!res.data.briefing,
                unread: res.data.briefing?.stats?.totalUnread
            };
        });

        await test('GET /api/v1/voltagent/briefing/status', async () => {
            const res = await api.get('/api/v1/voltagent/briefing/status');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        // ==================================================================
        // FOLLOW-UPS & ACTION ITEMS
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  FOLLOW-UPS & ACTION ITEMS');
        log('═══════════════════════════════════════════════════════════');

        await test('GET /api/v1/voltagent/follow-ups', async () => {
            const res = await api.get('/api/v1/voltagent/follow-ups');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return { count: res.data.followUps?.length || res.data.length || 0 };
        });

        await test('GET /api/v1/voltagent/follow-ups/stats', async () => {
            const res = await api.get('/api/v1/voltagent/follow-ups/stats');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        await test('GET /api/v1/voltagent/action-items', async () => {
            const res = await api.get('/api/v1/voltagent/action-items');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return { count: res.data.items?.length || res.data.length || 0 };
        });

        await test('GET /api/v1/voltagent/action-items/stats', async () => {
            const res = await api.get('/api/v1/voltagent/action-items/stats');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        // ==================================================================
        // DEADLINES
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  DEADLINES');
        log('═══════════════════════════════════════════════════════════');

        await test('GET /api/v1/voltagent/deadlines/upcoming', async () => {
            const res = await api.get('/api/v1/voltagent/deadlines/upcoming?days=7');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return { count: res.data.deadlines?.length || res.data.length || 0 };
        });

        // ==================================================================
        // ANALYTICS & FEEDBACK
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  ANALYTICS & FEEDBACK');
        log('═══════════════════════════════════════════════════════════');

        await test('GET /api/v1/voltagent/analytics/email', async () => {
            const res = await api.get('/api/v1/voltagent/analytics/email?period=week');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        await test('GET /api/v1/voltagent/analytics/dashboard', async () => {
            const res = await api.get('/api/v1/voltagent/analytics/dashboard');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return { hasData: true };
        });

        await test('GET /api/v1/voltagent/feedback/learning-stats', async () => {
            const res = await api.get('/api/v1/voltagent/feedback/learning-stats');
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return res.data;
        });

        // ==================================================================
        // CHAT (Real LLM call!)
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  VOLTAGENT CHAT (Real LLM)');
        log('═══════════════════════════════════════════════════════════');

        await test('POST /api/v1/voltagent/chat - Simple greeting', async () => {
            const res = await api.post('/api/v1/voltagent/chat', {
                message: 'Hello! What can you help me with?',
                locale: 'en',
            });
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            const responseText = res.data.text || res.data.response || res.data.message || '';
            if (responseText.length === 0) throw new Error('Empty response from chat');
            return { responseLength: responseText.length };
        });

        await test('POST /api/v1/voltagent/chat - Email query', async () => {
            const res = await api.post('/api/v1/voltagent/chat', {
                message: 'Show me my unread emails',
                locale: 'en',
            });
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return {
                hasResponse: !!(res.data.text || res.data.response || res.data.message),
                hasToolCalls: res.data.toolCalls?.length > 0 || res.data.actions?.length > 0
            };
        });

        await test('POST /api/v1/voltagent/chat - Calendar query', async () => {
            const res = await api.post('/api/v1/voltagent/chat', {
                message: 'What meetings do I have today?',
                locale: 'en',
            });
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return { hasResponse: !!(res.data.text || res.data.response || res.data.message) };
        });

        // ==================================================================
        // AI EMAIL INSIGHTS
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  AI EMAIL INSIGHTS');
        log('═══════════════════════════════════════════════════════════');

        // Get a real email to test AI features
        const emails = await prisma.email.findMany({
            where: { tenantId: user.tenantId, isDeleted: false, body: { not: null } },
            take: 1,
            select: { id: true, subject: true },
        });

        if (emails.length > 0) {
            const emailId = emails[0].id;
            log(`   Using email: ${emails[0].subject?.substring(0, 40)}...`);

            await test(`POST /ai/emails/${emailId}/summarize`, async () => {
                const res = await api.post(`/ai/emails/${emailId}/summarize`);
                if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
                return { hasSummary: !!res.data.summary, length: res.data.summary?.length };
            });

            await test(`POST /ai/emails/${emailId}/smart-replies`, async () => {
                const res = await api.post(`/ai/emails/${emailId}/smart-replies`);
                if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
                return { count: res.data.replies?.length || 0 };
            });

            await test(`POST /ai/emails/${emailId}/categorize`, async () => {
                const res = await api.post(`/ai/emails/${emailId}/categorize`);
                if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
                return { category: res.data.category, confidence: res.data.confidence };
            });

            await test(`POST /ai/emails/${emailId}/priority`, async () => {
                const res = await api.post(`/ai/emails/${emailId}/priority`);
                if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
                return { priority: res.data.priority, score: res.data.score };
            });
        } else {
            log('   ⏭️ Skipping email insights - no emails found');
        }

        // ==================================================================
        // KNOWLEDGE BASE
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  KNOWLEDGE BASE');
        log('═══════════════════════════════════════════════════════════');

        await test('POST /ai/knowledge/search', async () => {
            const res = await api.post('/ai/knowledge/search', {
                query: 'project updates',
                limit: 5,
            });
            if (res.status !== 200) throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
            return { count: res.data.results?.length || 0 };
        });

        // ==================================================================
        // SUMMARY
        // ==================================================================
        log('\n═══════════════════════════════════════════════════════════');
        log('  TEST SUMMARY');
        log('═══════════════════════════════════════════════════════════');

        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.filter(r => r.status === 'FAIL').length;
        const total = results.length;
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        log('');
        log(`  Total: ${total} API endpoints tested`);
        log(`  ✅ Passed: ${passed}`);
        log(`  ❌ Failed: ${failed}`);
        log(`  ⏱️ Duration: ${duration}s`);

        if (failed > 0) {
            log('\n  ❌ Failed tests:');
            results.filter(r => r.status === 'FAIL').forEach(r => {
                log(`     - ${r.name}: ${r.error}`);
            });
        }

        const passRate = ((passed / total) * 100).toFixed(0);
        log(`\n${failed === 0 ? '✅ ALL TESTS PASSED' : `⚠️ ${passRate}% PASS RATE`}\n`);

        // Save report
        const report = {
            timestamp: new Date().toISOString(),
            duration: Date.now() - startTime,
            user: user.email,
            tenant: user.tenantId,
            summary: { total, passed, failed },
            results,
        };
        const fs = await import('fs');
        fs.writeFileSync('scripts/ai-api-e2e-report.json', JSON.stringify(report, null, 2));
        log('📄 Report: scripts/ai-api-e2e-report.json\n');

        process.exit(failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
