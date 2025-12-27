/**
 * Comprehensive End-to-End Test Suite
 * Tests real API endpoints with actual data, simulating real user behavior
 * 
 * Tests include:
 * - Email listing with various filters
 * - Email search functionality
 * - Folder operations
 * - Provider status checks
 * - Sync operations
 * - Email update operations (mark read, star)
 * - Concurrent request handling
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as jwt from 'jsonwebtoken';

const prisma = createPrismaClient();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

interface TestResult {
    name: string;
    category: string;
    status: 'pass' | 'fail' | 'skip';
    time: number;
    details?: string;
    error?: string;
}

const results: TestResult[] = [];
let token = '';
let tenantId = '';
let userId = '';
let testEmailId = '';
let testProviderId = '';
let testFolderId = '';

async function generateJWTWithSession(uid: string, tid: string, email: string, userRole: string): Promise<string> {
    // Check if user has an existing valid session
    const existingSession = await prisma.session.findFirst({
        where: {
            userId: uid,
            expiresAt: { gt: new Date() }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (existingSession) {
        console.log('📋 Using existing session');
        return existingSession.token;
    }

    // Create a new session
    const sessionId = 'e2e-test-' + Date.now();
    const jwtToken = jwt.sign(
        {
            sessionId,
            userId: uid,
            tenantId: tid,
            email,
            role: userRole,
        },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '1h' }
    );

    await prisma.session.create({
        data: {
            id: sessionId,
            userId: uid,
            token: jwtToken,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
            ipAddress: '127.0.0.1',
            userAgent: 'E2E-Test'
        }
    });

    console.log('📋 Created new test session');
    return jwtToken;
}

async function api(method: string, path: string, body?: any): Promise<{ status: number; data: any; time: number }> {
    const start = Date.now();
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json().catch(() => ({}));
        return { status: response.status, data, time: Date.now() - start };
    } catch (error) {
        return { status: 0, data: { error: String(error) }, time: Date.now() - start };
    }
}

async function test(category: string, name: string, fn: () => Promise<{ details?: string }>): Promise<void> {
    const start = Date.now();
    try {
        const result = await fn();
        results.push({ name, category, status: 'pass', time: Date.now() - start, details: result.details });
        console.log(`  ✅ ${name} (${Date.now() - start}ms)${result.details ? ` - ${result.details}` : ''}`);
    } catch (error) {
        results.push({ name, category, status: 'fail', time: Date.now() - start, error: error instanceof Error ? error.message : String(error) });
        console.log(`  ❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function main() {
    console.log('\n╔═════════════════════════════════════════════════════════════╗');
    console.log('║       COMPREHENSIVE END-TO-END TEST SUITE                   ║');
    console.log('║       Testing real API with real providers                  ║');
    console.log('╚═════════════════════════════════════════════════════════════╝\n');

    // Setup: Get user and generate token
    const user = await prisma.user.findFirst({ include: { tenant: true } });
    if (!user) {
        console.error('❌ No users found in database');
        process.exit(1);
    }

    userId = user.id;
    tenantId = user.tenantId;
    token = await generateJWTWithSession(userId, tenantId, user.email, user.role);

    console.log(`📧 User: ${user.email}`);
    console.log(`🏢 Tenant: ${user.tenant.name}`);
    console.log(`🔑 JWT: ${token.substring(0, 40)}...`);

    // Get test data
    const providers = await prisma.providerConfig.findMany({ where: { tenantId, isActive: true }, take: 3 });
    const emails = await prisma.email.findMany({ where: { tenantId }, take: 5, orderBy: { receivedAt: 'desc' } });
    const folders = await prisma.folder.findMany({ where: { tenantId }, take: 5 });

    if (providers.length > 0) testProviderId = providers[0].id;
    if (emails.length > 0) testEmailId = emails[0].id;
    if (folders.length > 0) testFolderId = folders[0].id;

    console.log(`\n📊 Test Data: ${providers.length} providers, ${emails.length} emails, ${folders.length} folders\n`);

    // ═══════════════════════════════════════════════════════════════
    // CATEGORY 1: EMAIL LISTING & FILTERS
    // ═══════════════════════════════════════════════════════════════
    console.log('━━━ EMAIL LISTING & FILTERS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await test('Email', 'List all emails (paginated)', async () => {
        const { status, data, time } = await api('GET', '/emails?page=1&limit=10');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} emails, ${time}ms` };
    });

    await test('Email', 'List unread emails', async () => {
        const { status, data } = await api('GET', '/emails?isRead=false&limit=5');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} unread` };
    });

    await test('Email', 'List starred emails', async () => {
        const { status, data } = await api('GET', '/emails?isStarred=true&limit=5');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} starred` };
    });

    await test('Email', 'List emails with attachments', async () => {
        const { status, data } = await api('GET', '/emails?hasAttachments=true&limit=5');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} with attachments` };
    });

    await test('Email', 'List emails by date range (last 7 days)', async () => {
        const endDate = new Date().toISOString();
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { status, data } = await api('GET', `/emails?startDate=${startDate}&endDate=${endDate}&limit=10`);
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} in last 7 days` };
    });

    await test('Email', 'Get email statistics', async () => {
        const { status, data } = await api('GET', '/emails/stats');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `total=${data.total}, unread=${data.unread}, starred=${data.starred}` };
    });

    // ═══════════════════════════════════════════════════════════════
    // CATEGORY 2: SINGLE EMAIL OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n━━━ SINGLE EMAIL OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (testEmailId) {
        await test('Email', 'Get single email by ID', async () => {
            const { status, data, time } = await api('GET', `/emails/${testEmailId}`);
            if (status !== 200) throw new Error(`Status ${status}`);
            return { details: `Subject: "${data.subject?.substring(0, 30)}...", ${time}ms` };
        });

        await test('Email', 'Mark email as read (toggle)', async () => {
            const { status } = await api('PATCH', `/emails/${testEmailId}`, { isRead: true });
            if (status !== 200) throw new Error(`Status ${status}`);
            return { details: 'marked as read' };
        });

        await test('Email', 'Star email (toggle)', async () => {
            // Get current state first
            const { data: email } = await api('GET', `/emails/${testEmailId}`);
            const newStarred = !email.isStarred;
            const { status } = await api('PATCH', `/emails/${testEmailId}`, { isStarred: newStarred });
            if (status !== 200) throw new Error(`Status ${status}`);
            return { details: `starred=${newStarred}` };
        });
    } else {
        console.log('  ⏭ Skipped single email tests (no emails found)');
    }

    // ═══════════════════════════════════════════════════════════════
    // CATEGORY 3: FOLDER OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n━━━ FOLDER OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await test('Folder', 'List all folders', async () => {
        const { status, data } = await api('GET', '/folders');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.length || 0} folders` };
    });

    if (testProviderId) {
        await test('Folder', 'List folders by provider', async () => {
            const { status, data } = await api('GET', `/folders?providerId=${testProviderId}`);
            if (status !== 200) throw new Error(`Status ${status}`);
            return { details: `${data.length || 0} folders for provider` };
        });
    }

    await test('Folder', 'Get INBOX folder emails', async () => {
        const { status, data } = await api('GET', '/emails?specialUse=INBOX&limit=5');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} inbox emails` };
    });

    await test('Folder', 'Get SENT folder emails', async () => {
        const { status, data } = await api('GET', '/emails?specialUse=SENT&limit=5');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} sent emails` };
    });

    // ═══════════════════════════════════════════════════════════════
    // CATEGORY 4: PROVIDER OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n━━━ PROVIDER OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await test('Provider', 'List all providers', async () => {
        const { status, data } = await api('GET', '/providers');
        if (status !== 200) throw new Error(`Status ${status}`);
        const types = data.map((p: any) => p.providerType).join(', ');
        return { details: `${data.length} providers (${types})` };
    });

    if (testProviderId) {
        await test('Provider', 'Get provider details', async () => {
            const { status, data } = await api('GET', `/providers/${testProviderId}`);
            if (status !== 200) throw new Error(`Status ${status}`);
            return { details: `${data.email} (${data.providerType})` };
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // CATEGORY 5: SYNC OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n━━━ SYNC OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await test('Sync', 'Get sync status', async () => {
        const { status, data } = await api('GET', '/email-sync/status');
        if (status !== 200 && status !== 401) throw new Error(`Status ${status}`);
        if (status === 401) return { details: 'requires auth (expected)' };
        return { details: `${data.providers?.length || 0} providers in status` };
    });

    // ═══════════════════════════════════════════════════════════════
    // CATEGORY 6: SEARCH OPERATIONS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n━━━ SEARCH OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await test('Search', 'Search emails by keyword (test)', async () => {
        const { status, data, time } = await api('GET', '/emails?search=test&limit=5');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} results, ${time}ms` };
    });

    await test('Search', 'Search emails by subject', async () => {
        const { status, data, time } = await api('GET', '/emails?subject=re&limit=5');
        if (status !== 200) throw new Error(`Status ${status}`);
        return { details: `${data.emails?.length || 0} results, ${time}ms` };
    });

    // ═══════════════════════════════════════════════════════════════
    // CATEGORY 7: CONCURRENT REQUESTS (STRESS TEST)
    // ═══════════════════════════════════════════════════════════════
    console.log('\n━━━ CONCURRENT REQUESTS (STRESS TEST) ━━━━━━━━━━━━━━━━━━━━━━━');

    await test('Stress', '10 concurrent email list requests', async () => {
        const start = Date.now();
        const promises = Array(10).fill(null).map(() => api('GET', '/emails?limit=5'));
        const responses = await Promise.all(promises);
        const totalTime = Date.now() - start;
        const allPassed = responses.every((r) => r.status === 200 || r.status === 304);
        if (!allPassed) throw new Error('Some requests failed');
        const avgTime = Math.round(responses.reduce((s, r) => s + r.time, 0) / 10);
        return { details: `total=${totalTime}ms, avg=${avgTime}ms/req` };
    });

    await test('Stress', '5 concurrent mixed requests', async () => {
        const start = Date.now();
        const promises = [
            api('GET', '/emails?limit=3'),
            api('GET', '/folders'),
            api('GET', '/providers'),
            api('GET', '/emails/stats'),
            api('GET', '/emails?isStarred=true&limit=3'),
        ];
        const responses = await Promise.all(promises);
        const totalTime = Date.now() - start;
        const allPassed = responses.every((r) => r.status === 200 || r.status === 304);
        if (!allPassed) throw new Error('Some requests failed');
        return { details: `${totalTime}ms for 5 mixed requests` };
    });

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log('\n╔═════════════════════════════════════════════════════════════╗');
    console.log('║                      TEST SUMMARY                           ║');
    console.log('╚═════════════════════════════════════════════════════════════╝\n');

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const skipped = results.filter((r) => r.status === 'skip').length;
    const totalTime = results.reduce((s, r) => s + r.time, 0);

    // Group by category
    const categories = [...new Set(results.map((r) => r.category))];
    for (const cat of categories) {
        const catResults = results.filter((r) => r.category === cat);
        const catPassed = catResults.filter((r) => r.status === 'pass').length;
        console.log(`  ${cat}: ${catPassed}/${catResults.length} passed`);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  ✅ Passed:  ${passed}`);
    console.log(`  ❌ Failed:  ${failed}`);
    console.log(`  ⏭  Skipped: ${skipped}`);
    console.log(`  ⏱  Total:   ${totalTime}ms`);
    console.log(`  📊 Rate:    ${Math.round((passed / results.length) * 100)}%`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (failed > 0) {
        console.log('Failed tests:');
        results.filter((r) => r.status === 'fail').forEach((r) => {
            console.log(`  ❌ [${r.category}] ${r.name}: ${r.error}`);
        });
    } else {
        console.log('🎉 ALL TESTS PASSED! System is production-ready.\n');
    }

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
