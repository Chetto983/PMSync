/**
 * Validate Follow-up Trigger Logic with Real Data
 *
 * This script validates that the FollowUpService, which is now injected into
 * EmailSyncServices, correctly creates follow-ups when triggered.
 *
 * Run: npx ts-node scripts/validate-follow-up-real.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FollowUpService } from '../src/modules/ai/voltagent/services/follow-up.service';
import { Logger } from '@nestjs/common';

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║        Follow-up Service & Trigger Logic Validation            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    const prisma = app.get(PrismaService);
    // We need to resolve FollowUpService from the module where it's exported.
    // Since it's provided in VoltAgentModule and exported, it should be available.
    const followUpService = app.get(FollowUpService);

    try {
        // 1. Get a valid tenant and user
        const tenant = await prisma.tenant.findFirst({ where: { isActive: true } });
        if (!tenant) throw new Error('No active tenant found');

        const user = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
        const provider = await prisma.providerConfig.findFirst({ where: { tenantId: tenant.id } });

        // Fallback if no user linked to provider directly (though schema usually links them via tenant)
        // We need a valid userId that exists in the DB for the foreign key if strict.
        // The schema says EmailFollowUp needs tenantId, userId, emailId.
        const userId = user?.id || provider?.userId;

        if (!userId) throw new Error('No valid userId found for testing');

        console.log(`📋 Testing with Tenant: ${tenant.id}`);
        console.log(`👤 Testing with User: ${userId}`);

        // 2. Create a simulated "NEW" email in the DB that NEEDS a follow-up
        // This mimics what upsertMessageFromDriver does before calling the service
        const setupStart = Date.now();
        const testEmailId = `test-msg-${Date.now()}`;
        const testSubject = 'Urgent: Please submit the Q4 report by Friday';
        const testBody = 'Hi, catching up on things. Can you ensure the Q4 report is submitted by Friday? Thanks.';

        // Clean up any existing collision
        await prisma.emailFollowUp.deleteMany({
            where: { emailId: testEmailId }
        });

        // We don't strictly need the Email record to exist for the FollowUpService 
        // UNLESS there's a foreign key constraint on emailId in EmailFollowUp.
        // Schema check: "emailId String @unique // Reference to email.id"
        // It says "Reference to email.id" but doesn't explicitly show "@relation".
        // Let's create the email just in case to be safe and "real".

        // Ensure provider exists for FK
        const validProvider = provider || await prisma.providerConfig.findFirst();
        if (!validProvider) throw new Error('No provider config found');

        await prisma.email.upsert({
            where: {
                providerId_externalId_folder: {
                    providerId: validProvider.id,
                    externalId: testEmailId,
                    folder: 'INBOX'
                }
            },
            update: {},
            create: {
                id: testEmailId, // Force ID to match
                tenantId: tenant.id,
                providerId: validProvider.id,
                externalId: testEmailId,
                subject: testSubject,
                from: 'boss@example.com',
                to: ['me@example.com'],
                receivedAt: new Date(),
                sentAt: new Date(),
                folder: 'INBOX',
                bodyText: testBody
            }
        });

        console.log(`📧 Created test email: ${testEmailId}`);

        // 3. Simulate the trigger call that happens in BaseEmailSyncService
        console.log('\n>>> Triggering analyzeAndCreateFollowUp...');
        const start = Date.now();

        const result = await followUpService.analyzeAndCreateFollowUp(
            tenant.id,
            userId,
            testEmailId, // Pass the ID of the email we just created
            testBody,
            testSubject
        );

        const duration = Date.now() - start;
        console.log(`⏱️  Analysis took ${duration}ms`);

        // 4. Verify the follow-up was created in the DB
        if (result) {
            console.log(`✅ Method returned created follow-up object.`);

            const dbRecord = await prisma.emailFollowUp.findUnique({
                where: { emailId: testEmailId }
            });

            if (dbRecord) {
                console.log(`✅ VERIFIED: Follow-up record found in database!`);
                console.log(`   ID: ${dbRecord.id}`);
                console.log(`   Status: ${dbRecord.status}`);
                console.log(`   Reason: ${dbRecord.reason}`);
                console.log(`   Due Date: ${dbRecord.dueDate}`);
            } else {
                console.error(`❌ FAILED: Method returned result but record NOT found in DB.`);
            }

        } else {
            console.error(`❌ FAILED: analyzeAndCreateFollowUp returned null (no follow-up detected).`);
            console.log(`   Input Body: "${testBody}"`);
            // This text SHOULD trigger it based on regexes seen in the other script.
        }

        // 5. Clean up
        console.log('\n🧹 Cleaning up test data...');
        await prisma.emailFollowUp.deleteMany({ where: { emailId: testEmailId } });
        await prisma.email.delete({ where: { id: testEmailId } });
        console.log('✅ Cleanup complete.');

    } catch (error) {
        console.error('❌ Test Execution Failed:', error);
    } finally {
        await app.close();
    }
}

main().catch(console.error);
