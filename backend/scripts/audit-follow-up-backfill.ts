/**
 * Audit Existing Emails for Missed Follow-ups
 *
 * This script scans existing emails in the database (SENT folder and INBOX)
 * and runs the follow-up analysis on them.
 *
 * Helps answer: "Why is the dashboard empty?" by finding what SHOULD be there.
 *
 * Run: npx ts-node scripts/audit-follow-up-backfill.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { FollowUpService } from '../src/modules/ai/voltagent/services/follow-up.service';
import { Logger } from '@nestjs/common';

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║        Audit Existing Emails for Missed Follow-ups             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    const app = await NestFactory.createApplicationContext(AppModule, {
        logger: ['error', 'warn'],
    });

    const prisma = app.get(PrismaService);
    const followUpService = app.get(FollowUpService);

    try {
        // 1. Get active tenant
        const tenant = await prisma.tenant.findFirst({ where: { isActive: true } });
        if (!tenant) throw new Error('No active tenant found');

        // Get valid users
        const users = await prisma.user.findMany({ where: { tenantId: tenant.id } });
        if (users.length === 0) throw new Error('No users found');

        const userId = users[0].id; // Use first user for context if needed, though usually mapped from provider

        console.log(`📋 Scanning Tenant: ${tenant.name} (${tenant.id})`);

        // 2. Fetch recent emails (SENT and INBOX)
        // We prioritize SENT for "I am waiting for your reply" type follow-ups
        // and INBOX for "Please reply by Friday" questions.
        const emails = await prisma.email.findMany({
            where: {
                tenantId: tenant.id,
                folder: { in: ['SENT', 'INBOX', 'Sent', 'Inbox', 'sent', 'inbox'] },
                bodyText: { not: '' }, // We need body content
                isDeleted: false,
                // Optimization: Skip emails that already have a follow-up
                crossProviderLink: { is: null } // Just an example optimization, better to check EmailFollowUp table
            },
            orderBy: { receivedAt: 'desc' },
            take: 100, // Audit last 100 emails
            select: {
                id: true,
                subject: true,
                bodyText: true,
                folder: true,
                providerId: true,
                receivedAt: true,
                from: true,
                to: true
            }
        });

        console.log(`📧 Scanned ${emails.length} recent emails for analysis...`);
        console.log(`   (Limit: 100, Folders: SENT/INBOX)\n`);

        let detectedCount = 0;
        let createdCount = 0;

        for (const email of emails) {
            // Check if follow-up already exists
            const existing = await prisma.emailFollowUp.findUnique({
                where: { emailId: email.id }
            });

            if (existing) {
                // console.log(`   ⏭️  Skipping ${email.id} (Follow-up already exists)`);
                continue;
            }

            // We need a userId. In the sync service, it comes from the provider.
            // Here we try to resolve it from the provider config + tenant user.
            const provider = await prisma.providerConfig.findUnique({
                where: { id: email.providerId },
                select: { userId: true }
            });

            const effectiveUserId = provider?.userId || userId;

            // Dry-run analysis logic (we can't easily "peek" without running the service, 
            // but `analyzeAndCreateFollowUp` creates records. 
            // Let's modify the approach: we will run it and see if it returns a result.
            // The current service architecture combines analysis + creation.
            // We will treat this as a "Backfill" operation.

            try {
                const result = await followUpService.analyzeAndCreateFollowUp(
                    tenant.id,
                    effectiveUserId,
                    email.id,
                    email.bodyText || '',
                    email.subject
                );

                if (result) {
                    detectedCount++;
                    createdCount++;
                    console.log(`✅ DETECTED & BACKFILLED: [${email.folder}] ${email.subject.substring(0, 50)}...`);
                    console.log(`   Reason: ${result.reason}`);
                    console.log(`   Due: ${result.dueDate}`);
                }
            } catch (err) {
                // console.warn(`   ⚠️ Error analyzing ${email.id}: ${(err as Error).message}`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`🎉 Audit Complete`);
        console.log(`   Emails Scanned: ${emails.length}`);
        console.log(`   Follow-ups Detected & Created: ${detectedCount}`);

        if (detectedCount === 0) {
            console.log(`\nℹ️  No follow-ups found in the scanned batch.`);
            console.log(`   This explains why the dashboard is empty!`);
            console.log(`   Try sending a test email with "Please reply by Friday" to verify.`);
        } else {
            console.log(`\nℹ️  Dashboard should now show ${detectedCount} items.`);
        }

    } catch (error) {
        console.error('❌ Audit Failed:', error);
    } finally {
        await app.close();
    }
}

main().catch(console.error);
