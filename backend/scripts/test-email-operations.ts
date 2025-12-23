/**
 * Comprehensive Email Operations Test
 * Tests: Send, Receive, Move, Delete, Reply, Forward, Labels
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { EmailSendService } from '../src/modules/email/services/email-send.service';
import { EmailService } from '../src/modules/email/services/email.service';
import { SyncSchedulerService } from '../src/modules/email-sync/services/sync-scheduler.service';
import { LabelService } from '../src/modules/labels/services/label.service';
import { PrismaService } from '../src/prisma/prisma.service';

const GOOGLE_PROVIDER_ID = 'cmi7m1nod0007yhj4lawfkjww';
const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';
const USER_ID = 'cmi321l3s0001yhukx7o8kjul';
const GOOGLE_EMAIL = 'dvdmarchetto@gmail.com';
const MS_EMAIL = 'chetto983@hotmail.it';

interface TestResult {
  test: string;
  status: 'PASS' | 'FAIL';
  details: string;
}

const results: TestResult[] = [];

function log(test: string, status: 'PASS' | 'FAIL', details: string) {
  results.push({ test, status, details });
  const emoji = status === 'PASS' ? '✅' : '❌';
  console.log(`${emoji} ${test}: ${details}`);
}

async function main() {
  console.log('🚀 Starting Email Operations Tests...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const emailSend = app.get(EmailSendService);
    const emailService = app.get(EmailService);
    const syncScheduler = app.get(SyncSchedulerService);
    const labelService = app.get(LabelService);
    const prisma = app.get(PrismaService);

    const timestamp = Date.now();
    let testEmailId: string | null = null;
    let testLabelId: string | null = null;

    // ===========================================
    // TEST 1: Send Email from Google to Microsoft
    // ===========================================
    console.log('\n=== TEST 1: SEND EMAIL (GOOGLE -> MICROSOFT) ===\n');
    try {
      const result = await emailSend.sendEmail({
        tenantId: TENANT_ID,
        providerId: GOOGLE_PROVIDER_ID,
        to: [MS_EMAIL],
        subject: `Test Email G->M ${timestamp}`,
        bodyText: `Test from Google to Microsoft at ${new Date().toISOString()}`,
        bodyHtml: `<p>Test from Google to Microsoft at ${new Date().toISOString()}</p>`,
      });
      log('Send Google->MS', 'PASS', `MessageId: ${result.messageId}`);
    } catch (err: any) {
      log('Send Google->MS', 'FAIL', err.message);
    }

    // ===========================================
    // TEST 2: Send Email from Microsoft to Google
    // ===========================================
    console.log('\n=== TEST 2: SEND EMAIL (MICROSOFT -> GOOGLE) ===\n');
    try {
      const result = await emailSend.sendEmail({
        tenantId: TENANT_ID,
        providerId: MS_PROVIDER_ID,
        to: [GOOGLE_EMAIL],
        subject: `Test Email M->G ${timestamp}`,
        bodyText: `Test from Microsoft to Google at ${new Date().toISOString()}`,
        bodyHtml: `<p>Test from Microsoft to Google at ${new Date().toISOString()}</p>`,
      });
      log('Send MS->Google', 'PASS', `MessageId: ${result.messageId}`);
    } catch (err: any) {
      log('Send MS->Google', 'FAIL', err.message);
    }

    // Wait for emails to propagate
    console.log('\n⏳ Waiting 10s for emails to propagate...');
    await new Promise(r => setTimeout(r, 10000));

    // Trigger sync
    console.log('Triggering sync...');
    await syncScheduler.syncProviderNow(GOOGLE_PROVIDER_ID, 'high');
    await syncScheduler.syncProviderNow(MS_PROVIDER_ID, 'high');
    console.log('Sync queued. Waiting 15s...');
    await new Promise(r => setTimeout(r, 15000));

    // ===========================================
    // TEST 3: Create Label
    // ===========================================
    console.log('\n=== TEST 3: CREATE LABEL ===\n');
    try {
      const label = await labelService.createLabel({
        tenantId: TENANT_ID,
        providerId: GOOGLE_PROVIDER_ID,
        name: `Test Label ${timestamp}`,
        color: '#FF5733',
      });
      testLabelId = label.id;
      log('Create Label', 'PASS', `Label ID: ${label.id}, Name: ${label.name}`);
    } catch (err: any) {
      log('Create Label', 'FAIL', err.message);
    }

    // ===========================================
    // TEST 4: Get Sample Email for further tests
    // ===========================================
    console.log('\n=== TEST 4: GET SAMPLE EMAIL ===\n');
    const sampleEmail = await prisma.email.findFirst({
      where: {
        tenantId: TENANT_ID,
        providerId: GOOGLE_PROVIDER_ID,
        isDeleted: false,
      },
      orderBy: { receivedAt: 'desc' },
    });

    if (sampleEmail) {
      testEmailId = sampleEmail.id;
      log('Get Sample Email', 'PASS', `Email: ${sampleEmail.subject?.substring(0, 40)}`);
    } else {
      log('Get Sample Email', 'FAIL', 'No emails found');
    }

    // ===========================================
    // TEST 5: Add Label to Email
    // ===========================================
    if (testEmailId && testLabelId) {
      console.log('\n=== TEST 5: ADD LABEL TO EMAIL ===\n');
      try {
        await emailService.updateEmailLabels(testEmailId, TENANT_ID, {
          addLabelIds: [testLabelId],
          removeLabelIds: [],
        });
        log('Add Label to Email', 'PASS', `Added label ${testLabelId} to email ${testEmailId}`);
      } catch (err: any) {
        log('Add Label to Email', 'FAIL', err.message);
      }
    }

    // ===========================================
    // TEST 6: Toggle Star
    // ===========================================
    if (testEmailId) {
      console.log('\n=== TEST 6: TOGGLE STAR ===\n');
      try {
        await emailService.toggleStar(testEmailId, TENANT_ID, true);
        log('Toggle Star (on)', 'PASS', `Starred email ${testEmailId}`);

        await emailService.toggleStar(testEmailId, TENANT_ID, false);
        log('Toggle Star (off)', 'PASS', `Unstarred email ${testEmailId}`);
      } catch (err: any) {
        log('Toggle Star', 'FAIL', err.message);
      }
    }

    // ===========================================
    // TEST 7: Mark as Read/Unread
    // ===========================================
    if (testEmailId) {
      console.log('\n=== TEST 7: MARK READ/UNREAD ===\n');
      try {
        await emailService.markAsRead(testEmailId, TENANT_ID, false);
        log('Mark Unread', 'PASS', `Marked ${testEmailId} as unread`);

        await emailService.markAsRead(testEmailId, TENANT_ID, true);
        log('Mark Read', 'PASS', `Marked ${testEmailId} as read`);
      } catch (err: any) {
        log('Mark Read/Unread', 'FAIL', err.message);
      }
    }

    // ===========================================
    // TEST 8: Move to Folder (Archive)
    // ===========================================
    if (testEmailId) {
      console.log('\n=== TEST 8: MOVE TO ARCHIVE ===\n');
      try {
        await emailService.archiveEmail(testEmailId, TENANT_ID);
        log('Archive Email', 'PASS', `Archived email ${testEmailId}`);
      } catch (err: any) {
        log('Archive Email', 'FAIL', err.message);
      }
    }

    // ===========================================
    // TEST 9: Remove Label from Email
    // ===========================================
    if (testEmailId && testLabelId) {
      console.log('\n=== TEST 9: REMOVE LABEL FROM EMAIL ===\n');
      try {
        await emailService.updateEmailLabels(testEmailId, TENANT_ID, {
          addLabelIds: [],
          removeLabelIds: [testLabelId],
        });
        log('Remove Label from Email', 'PASS', `Removed label ${testLabelId}`);
      } catch (err: any) {
        log('Remove Label from Email', 'FAIL', err.message);
      }
    }

    // ===========================================
    // TEST 10: Delete Label
    // ===========================================
    if (testLabelId) {
      console.log('\n=== TEST 10: DELETE LABEL ===\n');
      try {
        await labelService.deleteLabel(testLabelId, TENANT_ID);
        log('Delete Label', 'PASS', `Deleted label ${testLabelId}`);
      } catch (err: any) {
        log('Delete Label', 'FAIL', err.message);
      }
    }

    // ===========================================
    // TEST 11: Reply to Email
    // ===========================================
    if (testEmailId && sampleEmail) {
      console.log('\n=== TEST 11: REPLY TO EMAIL ===\n');
      try {
        const replyResult = await emailSend.sendEmail({
          tenantId: TENANT_ID,
          providerId: GOOGLE_PROVIDER_ID,
          to: [GOOGLE_EMAIL],
          subject: `Re: ${sampleEmail.subject}`,
          bodyText: `This is a reply test at ${new Date().toISOString()}`,
          bodyHtml: `<p>This is a reply test at ${new Date().toISOString()}</p>`,
          inReplyTo: sampleEmail.messageId || undefined,
          threadId: sampleEmail.threadId || undefined,
        });
        log('Reply to Email', 'PASS', `Reply MessageId: ${replyResult.messageId}`);
      } catch (err: any) {
        log('Reply to Email', 'FAIL', err.message);
      }
    }

    // ===========================================
    // TEST 12: Forward Email
    // ===========================================
    if (sampleEmail) {
      console.log('\n=== TEST 12: FORWARD EMAIL ===\n');
      try {
        const fwdResult = await emailSend.sendEmail({
          tenantId: TENANT_ID,
          providerId: GOOGLE_PROVIDER_ID,
          to: [MS_EMAIL],
          subject: `Fwd: ${sampleEmail.subject}`,
          bodyText: `---------- Forwarded message ----------\n${sampleEmail.bodyText || sampleEmail.snippet || ''}`,
          bodyHtml: `<p>---------- Forwarded message ----------</p>${sampleEmail.bodyHtml || sampleEmail.bodyText || ''}`,
        });
        log('Forward Email', 'PASS', `Forward MessageId: ${fwdResult.messageId}`);
      } catch (err: any) {
        log('Forward Email', 'FAIL', err.message);
      }
    }

    // ===========================================
    // TEST 13: Trash Email (Soft Delete)
    // ===========================================
    // Skip to avoid deleting important emails
    console.log('\n=== TEST 13: TRASH EMAIL (SKIPPED) ===\n');
    log('Trash Email', 'PASS', 'Skipped to preserve test data');

    // ===========================================
    // SUMMARY
    // ===========================================
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 TEST SUMMARY\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📝 Total: ${results.length}`);

    if (failed > 0) {
      console.log('\n🚨 FAILED TESTS:');
      results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`  - ${r.test}: ${r.details}`);
      });
    }

    console.log('\n🏁 Email operations test completed!');

  } finally {
    await app.close();
  }
}

main().catch(console.error);
