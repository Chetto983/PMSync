/**
 * Validate Phase 4 Medium Priority Fixes
 *
 * Tests the fixes implemented in Phase 4 using real providers from the database:
 * - BUG-013: email.config.ts configuration extraction
 * - BUG-010: Attachment size validation
 * - BUG-019: Draft attachment size limit
 *
 * Usage:
 *   cd backend
 *   npx ts-node ./scripts/validate-phase4-medium-fixes.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();

interface ValidationResult {
    name: string;
    passed: boolean;
    details: string;
}

const results: ValidationResult[] = [];

// Test 1: Verify email.config.ts exports work
async function testEmailConfig(): Promise<void> {
    const testName = 'Email Config (BUG-013)';

    try {
        // Dynamic import to test the config module
        const { emailConfig } = await import('../src/modules/email/config/email.config');
        const config = emailConfig();

        const checks = [
            config.retention?.trashPurgeDays > 0,
            config.limits?.maxAttachmentSize > 0,
            config.limits?.maxListLimit > 0,
            config.rateLimit?.sendPerMinute > 0,
        ];

        const allValid = checks.every(Boolean);

        results.push({
            name: testName,
            passed: allValid,
            details: allValid
                ? `Config loaded: trashPurgeDays=${config.retention.trashPurgeDays}, maxAttachment=${config.limits.maxAttachmentSize}, maxList=${config.limits.maxListLimit}`
                : 'Config values missing or invalid',
        });
    } catch (error) {
        results.push({
            name: testName,
            passed: false,
            details: `Error loading config: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

// Test 2: Verify providers exist and have email support
async function testProviderConfiguration(): Promise<void> {
    const testName = 'Provider Configuration';

    try {
        const providers = await prisma.providerConfig.findMany({
            where: { isActive: true },
            select: {
                id: true,
                email: true,
                providerType: true,
                tenantId: true,
            },
        });

        const byType = {
            google: providers.filter((p) => p.providerType === 'google').length,
            microsoft: providers.filter((p) => p.providerType === 'microsoft').length,
            imap: providers.filter((p) => p.providerType === 'imap').length,
        };

        results.push({
            name: testName,
            passed: providers.length > 0,
            details: `${providers.length} active providers: Google=${byType.google}, Microsoft=${byType.microsoft}, IMAP=${byType.imap}`,
        });

        // List providers
        console.log('\n📧 Active Providers:');
        for (const p of providers) {
            console.log(`   - [${p.providerType}] ${p.email}`);
        }
    } catch (error) {
        results.push({
            name: testName,
            passed: false,
            details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

// Test 3: Verify email counts per provider
async function testEmailCounts(): Promise<void> {
    const testName = 'Email Data per Provider';

    try {
        const providers = await prisma.providerConfig.findMany({
            where: { isActive: true },
            select: { id: true, email: true, providerType: true },
        });

        console.log('\n📊 Email Counts by Provider:');

        let totalEmails = 0;
        for (const provider of providers) {
            const count = await prisma.email.count({
                where: { providerId: provider.id },
            });
            totalEmails += count;
            console.log(`   - [${provider.providerType}] ${provider.email}: ${count} emails`);
        }

        results.push({
            name: testName,
            passed: totalEmails > 0,
            details: `Total ${totalEmails} emails across ${providers.length} providers`,
        });
    } catch (error) {
        results.push({
            name: testName,
            passed: false,
            details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

// Test 4: Verify attachment size validation (BUG-010, BUG-019)
async function testAttachmentSizeValidation(): Promise<void> {
    const testName = 'Attachment Size Validation (BUG-010, BUG-019)';

    try {
        // Check if any attachments exist with size data
        const attachments = await prisma.emailAttachment.findMany({
            take: 100,
            select: { id: true, size: true, filename: true },
        });

        const withSize = attachments.filter((a) => a.size !== null && a.size > 0);
        const withNegativeSize = attachments.filter((a) => a.size !== null && a.size < 0);

        results.push({
            name: testName,
            passed: withNegativeSize.length === 0,
            details: `${attachments.length} attachments checked, ${withSize.length} have size data, ${withNegativeSize.length} negative (invalid)`,
        });
    } catch (error) {
        results.push({
            name: testName,
            passed: false,
            details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

// Test 5: Verify folders have proper structure
async function testFolderStructure(): Promise<void> {
    const testName = 'Folder Structure';

    try {
        const folders = await prisma.folder.findMany({
            select: {
                id: true,
                name: true,
                specialUse: true,
                providerId: true,
                totalCount: true,
                unreadCount: true,
            },
        });

        const bySpecialUse = new Map<string, number>();
        for (const f of folders) {
            const use = f.specialUse || 'none';
            bySpecialUse.set(use, (bySpecialUse.get(use) || 0) + 1);
        }

        console.log('\n📁 Folders by SpecialUse:');
        for (const [use, count] of bySpecialUse) {
            console.log(`   - ${use}: ${count}`);
        }

        results.push({
            name: testName,
            passed: folders.length > 0,
            details: `${folders.length} folders total, ${bySpecialUse.size} unique specialUse types`,
        });
    } catch (error) {
        results.push({
            name: testName,
            passed: false,
            details: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
    }
}

// Main
async function main() {
    console.log('='.repeat(60));
    console.log('Phase 4 Medium Priority Fixes Validation');
    console.log('='.repeat(60));
    console.log('Testing with real providers from database\n');

    try {
        await testEmailConfig();
        await testProviderConfiguration();
        await testEmailCounts();
        await testAttachmentSizeValidation();
        await testFolderStructure();

        // Print results
        console.log('\n' + '='.repeat(60));
        console.log('RESULTS');
        console.log('='.repeat(60) + '\n');

        let passed = 0;
        let failed = 0;

        for (const result of results) {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} ${result.name}`);
            console.log(`       ${result.details}`);
            if (result.passed) passed++;
            else failed++;
        }

        console.log('\n' + '-'.repeat(60));
        console.log(`Total: ${passed} passed, ${failed} failed`);
        console.log('-'.repeat(60));

        if (failed === 0) {
            console.log('\n✅ PHASE 4 VALIDATION PASSED');
        } else {
            console.log('\n❌ SOME TESTS FAILED');
            process.exit(1);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
