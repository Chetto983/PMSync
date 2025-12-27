/**
 * Comprehensive API Stress Test with JWT Token Generation
 * Tests email and email-sync modules with real providers
 */
import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaClient } from '@prisma/client';
import * as jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

interface TestResult {
    name: string;
    status: 'pass' | 'fail' | 'skip';
    time: number;
    statusCode?: number;
    error?: string;
}

const results: TestResult[] = [];

async function generateJWT(userId: string, tenantId: string): Promise<string> {
    const payload = {
        sub: userId,
        tenantId,
        type: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
    };
    return jwt.sign(payload, JWT_SECRET, { algorithm: 'HS256' });
}

async function apiCall(
    method: string,
    path: string,
    token: string,
    body?: any,
): Promise<{ status: number; data: any; time: number }> {
    const start = Date.now();
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await response.json().catch(() => ({}));
        return { status: response.status, data, time: Date.now() - start };
    } catch (error) {
        return { status: 0, data: { error: String(error) }, time: Date.now() - start };
    }
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
    const start = Date.now();
    try {
        await fn();
        results.push({ name, status: 'pass', time: Date.now() - start });
        console.log(`✅ ${name} (${Date.now() - start}ms)`);
    } catch (error) {
        results.push({
            name,
            status: 'fail',
            time: Date.now() - start,
            error: error instanceof Error ? error.message : String(error),
        });
        console.log(`❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  API STRESS TEST WITH REAL PROVIDERS');
    console.log('═══════════════════════════════════════════════════════════\n');

    // 1. Get first user and tenant from database
    const user = await prisma.user.findFirst({
        include: { tenant: true },
    });

    if (!user) {
        console.error('❌ No users found in database. Cannot run tests.');
        process.exit(1);
    }

    console.log(`📧 Testing with user: ${user.email}`);
    console.log(`🏢 Tenant: ${user.tenant.name} (${user.tenantId})\n`);

    // 2. Generate JWT token
    const token = await generateJWT(user.id, user.tenantId);
    console.log(`🔑 JWT generated: ${token.substring(0, 50)}...\n`);

    // 3. Get providers for this tenant
    const providers = await prisma.providerConfig.findMany({
        where: { tenantId: user.tenantId, isActive: true },
        select: { id: true, email: true, providerType: true },
    });

    console.log(`📬 Active providers: ${providers.length}`);
    providers.forEach((p) => console.log(`   - ${p.email} (${p.providerType})`));
    console.log();

    // ====== EMAIL SYNC MODULE TESTS ======
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  EMAIL-SYNC MODULE');
    console.log('═══════════════════════════════════════════════════════════\n');

    await test('GET /email-sync/status', async () => {
        const { status, data, time } = await apiCall('GET', '/email-sync/status', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Response time: ${time}ms, Providers: ${data.providers?.length || 0}`);
    });

    await test('GET /email-sync/health', async () => {
        const { status, data, time } = await apiCall('GET', '/email-sync/health', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Redis: ${data.redisConnected ? '✓' : '✗'}, Workers: ${data.workersEnabled ? '✓' : '✗'}`);
    });

    await test('GET /email-sync/queues', async () => {
        const { status, data, time } = await apiCall('GET', '/email-sync/queues', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Queues found: ${Object.keys(data).length}`);
    });

    await test('GET /email-sync/alerts', async () => {
        const { status, data, time } = await apiCall('GET', '/email-sync/alerts', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Alerts: ${data.criticalCount || 0} critical, ${data.warningCount || 0} warning`);
    });

    await test('GET /email-sync/alerts/thresholds', async () => {
        const { status, data, time } = await apiCall('GET', '/email-sync/alerts/thresholds', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Thresholds configured: ✓`);
    });

    // ====== EMAIL MODULE TESTS ======
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  EMAIL MODULE');
    console.log('═══════════════════════════════════════════════════════════\n');

    await test('GET /emails (list)', async () => {
        const { status, data, time } = await apiCall('GET', '/emails?limit=10', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Emails returned: ${data.emails?.length || data.length || 0}, Time: ${time}ms`);
    });

    await test('GET /emails?isRead=false (unread)', async () => {
        const { status, data, time } = await apiCall('GET', '/emails?isRead=false&limit=5', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Unread emails: ${data.emails?.length || data.length || 0}`);
    });

    await test('GET /emails?isStarred=true (starred)', async () => {
        const { status, data, time } = await apiCall('GET', '/emails?isStarred=true&limit=5', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Starred emails: ${data.emails?.length || data.length || 0}`);
    });

    // ====== FOLDER MODULE TESTS ======
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  FOLDER MODULE');
    console.log('═══════════════════════════════════════════════════════════\n');

    await test('GET /folders', async () => {
        const { status, data, time } = await apiCall('GET', '/folders', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Folders: ${data.length || 0}, Time: ${time}ms`);
    });

    if (providers.length > 0) {
        await test(`GET /folders?providerId=${providers[0].id}`, async () => {
            const { status, data, time } = await apiCall('GET', `/folders?providerId=${providers[0].id}`, token);
            if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
            console.log(`   Provider folders: ${data.length || 0}`);
        });
    }

    // ====== PROVIDER MODULE TESTS ======
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  PROVIDER MODULE');
    console.log('═══════════════════════════════════════════════════════════\n');

    await test('GET /providers', async () => {
        const { status, data, time } = await apiCall('GET', '/providers', token);
        if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        console.log(`   Providers: ${data.length || 0}`);
    });

    if (providers.length > 0) {
        await test(`GET /providers/${providers[0].id}`, async () => {
            const { status, data, time } = await apiCall('GET', `/providers/${providers[0].id}`, token);
            if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
            console.log(`   Provider: ${data.email || data.id}`);
        });
    }

    // ====== STRESS TEST: CONCURRENT REQUESTS ======
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  STRESS TEST: CONCURRENT REQUESTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    await test('10 concurrent email list requests', async () => {
        const start = Date.now();
        const promises = Array(10).fill(null).map(() => apiCall('GET', '/emails?limit=5', token));
        const responses = await Promise.all(promises);
        const totalTime = Date.now() - start;
        const avgTime = Math.round(totalTime / 10);
        const allSucceeded = responses.every((r) => r.status === 200);
        if (!allSucceeded) throw new Error('Some requests failed');
        console.log(`   Total: ${totalTime}ms, Avg: ${avgTime}ms/request`);
    });

    await test('5 concurrent folder list requests', async () => {
        const start = Date.now();
        const promises = Array(5).fill(null).map(() => apiCall('GET', '/folders', token));
        const responses = await Promise.all(promises);
        const totalTime = Date.now() - start;
        const allSucceeded = responses.every((r) => r.status === 200);
        if (!allSucceeded) throw new Error('Some requests failed');
        console.log(`   Total: ${totalTime}ms`);
    });

    // ====== SUMMARY ======
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const totalTime = results.reduce((sum, r) => sum + r.time, 0);

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏱️  Total time: ${totalTime}ms`);
    console.log(`📊 Pass rate: ${Math.round((passed / results.length) * 100)}%\n`);

    if (failed > 0) {
        console.log('Failed tests:');
        results
            .filter((r) => r.status === 'fail')
            .forEach((r) => console.log(`  ❌ ${r.name}: ${r.error}`));
    }

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
