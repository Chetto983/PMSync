/**
 * VoltAgent Bruteforce Validation (real LLM + real tenant data)
 *
 * Runs broad chat-based validation across agents/tools plus PII and memory checks.
 * Uses a real tenant and real data, but relies on HITL to prevent destructive actions.
 *
 * Usage:
 *   npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-voltagent-bruteforce.ts --tenant-id <id> [--user-id <id>]
 */
import * as dotenv from 'dotenv';
import path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoltAgentService } from '../src/modules/ai/voltagent/voltagent.service';
import { HitlService } from '../src/modules/ai/voltagent/services/hitl.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PiiResolutionService } from '../src/modules/ai/guards';
import { AIMemoryService } from '../src/modules/ai/voltagent/services/ai-memory.service';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_TENANT_ID = 'cmjgylxkg000054yhnjpkmzd9';

type TestStatus = 'passed' | 'failed' | 'skipped';

interface ChatTestCase {
  name: string;
  message: string;
  locale?: 'en' | 'it';
  expectsHitl?: boolean;
  requires?: string;
  validate?: (resultText: string) => string | null;
  allowFailure?: boolean;
}

interface TestResult {
  name: string;
  status: TestStatus;
  durationMs: number;
  details?: string;
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function hasInternalMarkers(text: string): boolean {
  return /\[(Conversation History|Current Message|Key Context|Recent Messages|User Memory)\]/i.test(text)
    || /\[Conversation Summary/i.test(text)
    || /##\s*Learned Constraints/i.test(text);
}

function hasPiiPlaceholders(text: string): boolean {
  return /\[[A-Z_]+_REDACTED(?::[a-f0-9]{6,})?\]/i.test(text);
}

async function collectStream(stream: AsyncGenerator<string>): Promise<string> {
  let output = '';
  for await (const chunk of stream) {
    output += chunk;
  }
  return output;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const tenantId = argValue('--tenant-id') || process.env.TENANT_ID || DEFAULT_TENANT_ID;
  const userIdArg = argValue('--user-id');

  if (!process.env.MISTRAL_API_KEY) {
    console.error('Missing MISTRAL_API_KEY in environment.');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const voltAgent = app.get(VoltAgentService);
  let hitlService: HitlService | undefined;
  try {
    hitlService = app.get(HitlService);
  } catch {
    hitlService = undefined;
  }
  let piiResolution: PiiResolutionService | undefined;
  let memoryService: AIMemoryService | undefined;
  try {
    piiResolution = app.get(PiiResolutionService);
  } catch {
    piiResolution = undefined;
  }
  try {
    memoryService = app.get(AIMemoryService);
  } catch {
    memoryService = undefined;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    console.error(`Tenant not found: ${tenantId}`);
    await app.close();
    await prisma.$disconnect();
    process.exit(1);
  }

  const user = userIdArg
    ? await prisma.user.findFirst({ where: { id: userIdArg, tenantId } })
    : await prisma.user.findFirst({
        where: { tenantId, isActive: true },
        orderBy: [{ lastLogin: 'desc' }, { createdAt: 'desc' }],
      });

  if (!user) {
    console.error(`No active user found for tenant ${tenantId}`);
    await app.close();
    await prisma.$disconnect();
    process.exit(1);
  }

  const provider = await prisma.providerConfig.findFirst({
    where: { tenantId, isActive: true, supportsEmail: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  const emailSample = await prisma.email.findFirst({
    where: { tenantId },
    orderBy: { receivedAt: 'desc' },
    select: { id: true, subject: true, from: true, snippet: true },
  });

  const folderSample = await prisma.folder.findFirst({
    where: { tenantId, isSystem: false },
    orderBy: [{ totalCount: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, name: true },
  });

  const contactSample = await prisma.contact.findFirst({
    where: { tenantId, isDeleted: false },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, displayName: true, firstName: true, lastName: true },
  });

  const eventSample = await prisma.calendarEvent.findFirst({
    where: { tenantId, isDeleted: false, isCancelled: false },
    orderBy: [{ startTime: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, title: true },
  });

  const safeRecipient = process.env.TEST_EMAIL_RECIPIENT || user.email;
  const timestampTag = `ai-test-${Date.now()}`;
  const conversationId = `bruteforce-${Date.now()}`;

  console.log('Bruteforce validation starting');
  console.log(`Tenant: ${tenantId}`);
  console.log(`User: ${user.id} (${user.email})`);
  console.log(`Provider: ${provider?.email || 'none'}`);
  console.log(`Sample email: ${emailSample?.subject || 'none'}`);
  console.log(`Sample folder: ${folderSample?.name || 'none'}`);
  console.log(`Sample contact: ${contactSample?.displayName || contactSample?.firstName || 'none'}`);
  console.log(`Sample event: ${eventSample?.title || 'none'}`);

  const tests: ChatTestCase[] = [
    {
      name: 'Supervisor multi-intent',
      message: 'Summarize my unread emails and schedule a 30 minute meeting tomorrow at 10:00.',
      expectsHitl: true,
    },
    {
      name: 'List email accounts',
      message: 'List my connected email accounts.',
    },
    {
      name: 'Unread emails',
      message: 'Show my unread emails.',
    },
    {
      name: 'Search emails',
      message: 'Search my emails for invoices from last week.',
    },
    {
      name: 'Count emails',
      message: 'How many emails did I receive this week?',
    },
    {
      name: 'Semantic search emails',
      message: 'Find emails about payment issues.',
    },
    {
      name: 'Summarize latest email',
      message: emailSample
        ? `Summarize the latest email from ${emailSample.from}.`
        : 'Summarize my latest email.',
      requires: 'email',
    },
    {
      name: 'Analyze sentiment',
      message: emailSample
        ? `Analyze the sentiment of the latest email from ${emailSample.from}.`
        : 'Analyze the sentiment of my latest email.',
      requires: 'email',
    },
    {
      name: 'Compose reply draft',
      message: emailSample
        ? `Draft a reply to the latest email from ${emailSample.from} saying "Thanks, received."`
        : 'Draft a reply to my latest email saying "Thanks, received."',
      requires: 'email',
    },
    {
      name: 'Extract action items',
      message: emailSample
        ? `Extract action items from the latest email from ${emailSample.from}.`
        : 'Extract action items from my latest email.',
      requires: 'email',
    },
    {
      name: 'Categorize email',
      message: emailSample
        ? `Suggest a label for the latest email from ${emailSample.from}.`
        : 'Suggest a label for my latest email.',
      requires: 'email',
    },
    {
      name: 'Generate smart replies',
      message: emailSample
        ? `Generate smart replies for the latest email from ${emailSample.from}.`
        : 'Generate smart replies for my latest email.',
      requires: 'email',
    },
    {
      name: 'Analyze email',
      message: emailSample
        ? `Analyze the latest email from ${emailSample.from} for key points.`
        : 'Analyze my latest email for key points.',
      requires: 'email',
    },
    {
      name: 'Detect intent',
      message: emailSample?.snippet
        ? `Detect intent for this email: "${emailSample.snippet}".`
        : 'Detect intent for this email: "Please review the attached invoice and confirm payment."',
    },
    {
      name: 'Calculate priority',
      message: emailSample?.snippet
        ? `Calculate priority for this email: "${emailSample.snippet}".`
        : 'Calculate priority for this email: "Urgent: payment overdue, please respond today."',
    },
    {
      name: 'Bulk email actions',
      message: 'Mark the last 3 unread emails as read.',
      expectsHitl: true,
    },
    {
      name: 'Send email (HITL)',
      message: `Send an email to ${safeRecipient} with subject "AI test" and body "Bruteforce validation ${timestampTag}".`,
      expectsHitl: true,
    },
    {
      name: 'Reply email (HITL)',
      message: emailSample
        ? `Reply to the email with subject "${emailSample.subject || 'no subject'}" from ${emailSample.from} and say "Thanks."`
        : 'Reply to my most recent email and say "Thanks."',
      expectsHitl: true,
      requires: 'email',
    },
    {
      name: 'Forward email (HITL)',
      message: emailSample
        ? `Forward the email with subject "${emailSample.subject || 'no subject'}" from ${emailSample.from} to ${safeRecipient}.`
        : `Forward my latest email to ${safeRecipient}.`,
      expectsHitl: true,
      requires: 'email',
    },
    {
      name: 'Archive email (HITL)',
      message: emailSample
        ? `Archive the email with subject "${emailSample.subject || 'no subject'}" from ${emailSample.from}.`
        : 'Archive my latest email.',
      expectsHitl: true,
      requires: 'email',
    },
    {
      name: 'Mark email read (HITL)',
      message: emailSample
        ? `Mark as read the email with subject "${emailSample.subject || 'no subject'}" from ${emailSample.from}.`
        : 'Mark my latest email as read.',
      expectsHitl: true,
      requires: 'email',
    },
    {
      name: 'Star email (HITL)',
      message: emailSample
        ? `Star the email with subject "${emailSample.subject || 'no subject'}" from ${emailSample.from}.`
        : 'Star my latest email.',
      expectsHitl: true,
      requires: 'email',
    },
    {
      name: 'List folders',
      message: 'List my email folders.',
    },
    {
      name: 'Create folder (HITL)',
      message: provider
        ? `Create a new folder named "${timestampTag}" in account ${provider.email}.`
        : `Create a new folder named "${timestampTag}".`,
      expectsHitl: true,
      requires: 'provider',
    },
    {
      name: 'Rename folder (HITL)',
      message: folderSample
        ? `Rename the folder "${folderSample.name}" to "${folderSample.name}-${timestampTag}".`
        : `Rename a folder named "Inbox" to "Inbox-${timestampTag}".`,
      expectsHitl: true,
      requires: 'folder',
    },
    {
      name: 'Delete folder (HITL)',
      message: folderSample
        ? `Delete the folder "${folderSample.name}".`
        : `Delete the folder "Old-${timestampTag}".`,
      expectsHitl: true,
      requires: 'folder',
    },
    {
      name: 'Move email to folder (HITL)',
      message: emailSample && folderSample
        ? `Move the email with subject "${emailSample.subject || 'no subject'}" to folder "${folderSample.name}".`
        : 'Move my latest email to the Archive folder.',
      expectsHitl: true,
      requires: 'email+folder',
    },
    {
      name: 'Search contacts',
      message: contactSample
        ? `Search for the contact ${contactSample.displayName || contactSample.firstName || 'unknown'}.`
        : 'Search my contacts for "Mario".',
      requires: 'contact',
    },
    {
      name: 'Get contact',
      message: contactSample
        ? `Show me the contact details for ${contactSample.displayName || contactSample.firstName || 'unknown'}.`
        : 'Show me details for contact "Mario".',
      requires: 'contact',
    },
    {
      name: 'Create contact (HITL)',
      message: `Create a contact named "AI Test Contact" with email ai-test-${Date.now()}@example.com.`,
      expectsHitl: true,
    },
    {
      name: 'Update contact (HITL)',
      message: contactSample
        ? `Update contact ${contactSample.displayName || contactSample.firstName || 'unknown'} with job title "QA".`
        : 'Update contact "Mario" with job title "QA".',
      expectsHitl: true,
      requires: 'contact',
    },
    {
      name: 'Delete contact (HITL)',
      message: contactSample
        ? `Delete contact ${contactSample.displayName || contactSample.firstName || 'unknown'}.`
        : 'Delete contact "Mario".',
      expectsHitl: true,
      requires: 'contact',
    },
    {
      name: 'Get events today',
      message: 'What is on my calendar today?',
    },
    {
      name: 'Check availability',
      message: 'Am I free tomorrow at 15:00?',
    },
    {
      name: 'Create event (HITL)',
      message: `Create an event "AI Validation ${timestampTag}" tomorrow at 10:00 for 30 minutes.`,
      expectsHitl: true,
    },
    {
      name: 'Update event (HITL)',
      message: eventSample
        ? `Update event "${eventSample.title}" and set location to "Office".`
        : 'Update my next event and set location to "Office".',
      expectsHitl: true,
      requires: 'event',
    },
    {
      name: 'Delete event (HITL)',
      message: eventSample
        ? `Delete event "${eventSample.title}".`
        : 'Delete my next event.',
      expectsHitl: true,
      requires: 'event',
    },
    {
      name: 'Document library list',
      message: 'List my document libraries.',
      allowFailure: true,
    },
    {
      name: 'Document library query',
      message: 'Search my documents for "invoice".',
      allowFailure: true,
    },
    {
      name: 'Document library create',
      message: `Create a document library named "AI Library ${timestampTag}".`,
      allowFailure: true,
    },
    {
      name: 'Analytics tool',
      message: 'Analyze my email activity trends for the last 7 days.',
      allowFailure: true,
    },
    {
      name: 'Web search tool',
      message: 'Search the web for the latest Mistral AI pricing.',
      allowFailure: true,
    },
  ];

  const results: TestResult[] = [];
  const pendingActionIds: string[] = [];

  for (const test of tests) {
    const missing =
      (test.requires === 'email' && !emailSample)
      || (test.requires === 'folder' && !folderSample)
      || (test.requires === 'contact' && !contactSample)
      || (test.requires === 'event' && !eventSample)
      || (test.requires === 'provider' && !provider)
      || (test.requires === 'email+folder' && (!emailSample || !folderSample));

    if (missing) {
      results.push({
        name: test.name,
        status: 'skipped',
        durationMs: 0,
        details: `Missing required data: ${test.requires}`,
      });
      continue;
    }

    const start = Date.now();
    try {
      const result = await voltAgent.chat(test.message, {
        tenantId,
        userId: user.id,
        conversationId,
        locale: test.locale || 'en',
        skipCache: true,
      });
      const durationMs = Date.now() - start;

      if (!result.text && (!result.pendingActions || result.pendingActions.length === 0)) {
        results.push({
          name: test.name,
          status: 'failed',
          durationMs,
          details: 'Empty response',
        });
        continue;
      }

      if (result.pendingActions?.length) {
        for (const action of result.pendingActions) {
          pendingActionIds.push(action.id);
        }
      }

      const responseText = result.text || '';
      if (hasInternalMarkers(responseText)) {
        results.push({
          name: test.name,
          status: 'failed',
          durationMs,
          details: 'Internal markers leaked in response',
        });
        continue;
      }

      if (hasPiiPlaceholders(responseText)) {
        results.push({
          name: test.name,
          status: 'failed',
          durationMs,
          details: 'PII placeholders leaked in response',
        });
        continue;
      }

      const validationError = test.validate ? test.validate(responseText) : null;
      if (validationError) {
        results.push({
          name: test.name,
          status: 'failed',
          durationMs,
          details: validationError,
        });
        continue;
      }

      if (test.expectsHitl && (!result.pendingActions || result.pendingActions.length === 0)) {
        results.push({
          name: test.name,
          status: 'failed',
          durationMs,
          details: 'Expected HITL pending action but none returned',
        });
        continue;
      }

      results.push({
        name: test.name,
        status: 'passed',
        durationMs,
        details: result.pendingActions?.length ? `HITL actions: ${result.pendingActions.length}` : undefined,
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      results.push({
        name: test.name,
        status: test.allowFailure ? 'passed' : 'failed',
        durationMs: Date.now() - start,
        details: test.allowFailure ? `Non-blocking failure: ${errMsg}` : errMsg,
      });
    }

    // Rate limit protection: Mistral has 600K tokens/5min limit
    // With conversation history growing, we need longer delays
    // 5 seconds between tests to avoid exhausting token budget
    await sleep(5000);
  }

  // Rate limit cooldown before special tests
  await sleep(10000);

  // PII roundtrip test (explicit validation)
  const piiMessage = 'My phone is +1 415-555-0199 and my email is alice+test@example.com. Repeat them back.';
  const piiStart = Date.now();
  try {
    const piiResult = await voltAgent.chat(piiMessage, {
      tenantId,
      userId: user.id,
      conversationId,
      locale: 'en',
      skipCache: true,
    });
    const piiText = piiResult.text || '';
    const missingPhone = !piiText.includes('+1 415-555-0199');
    const missingEmail = !piiText.includes('alice+test@example.com');
    const placeholders = hasPiiPlaceholders(piiText);
    const markers = hasInternalMarkers(piiText);

    if (missingPhone || missingEmail || placeholders || markers) {
      results.push({
        name: 'PII roundtrip',
        status: 'failed',
        durationMs: Date.now() - piiStart,
        details: `PII roundtrip failed (missingPhone=${missingPhone}, missingEmail=${missingEmail}, placeholders=${placeholders}, markers=${markers})`,
      });
    } else {
      results.push({
        name: 'PII roundtrip',
        status: 'passed',
        durationMs: Date.now() - piiStart,
      });
    }

    if (piiResolution) {
      const mappings = await piiResolution.getMappings(tenantId, conversationId);
      if (!mappings || mappings.length === 0) {
        results.push({
          name: 'PII mapping stored',
          status: 'failed',
          durationMs: 0,
          details: 'No PII mappings stored in Redis',
        });
      } else {
        results.push({
          name: 'PII mapping stored',
          status: 'passed',
          durationMs: 0,
          details: `Mappings stored: ${mappings.length}`,
        });
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    results.push({
      name: 'PII roundtrip',
      status: 'failed',
      durationMs: Date.now() - piiStart,
      details: errMsg,
    });
  }

  // Rate limit cooldown
  await sleep(5000);

  // Name test (requires profile name)
  if (user.firstName || user.lastName) {
    const nameStart = Date.now();
    const expectedName = [user.firstName, user.lastName].filter(Boolean).join(' ').toLowerCase();
    try {
      const nameResult = await voltAgent.chat('What is my name?', {
        tenantId,
        userId: user.id,
        conversationId,
        locale: 'en',
        skipCache: true,
      });
      const text = (nameResult.text || '').toLowerCase();
      if (expectedName && !text.includes(expectedName)) {
        results.push({
          name: 'User name resolution',
          status: 'failed',
          durationMs: Date.now() - nameStart,
          details: `Expected name "${expectedName}" not found in response`,
        });
      } else {
        results.push({
          name: 'User name resolution',
          status: 'passed',
          durationMs: Date.now() - nameStart,
        });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      results.push({
        name: 'User name resolution',
        status: 'failed',
        durationMs: Date.now() - nameStart,
        details: errMsg,
      });
    }
  } else {
    results.push({
      name: 'User name resolution',
      status: 'skipped',
      durationMs: 0,
      details: 'User has no first/last name in profile',
    });
  }

  // Rate limit cooldown
  await sleep(5000);

  // Memory test (store then recall)
  const memoryStore = 'Remember: my favorite color is ultramarine.';
  const memoryRecall = 'What is my favorite color?';
  const memoryStart = Date.now();
  try {
    await voltAgent.chat(memoryStore, {
      tenantId,
      userId: user.id,
      conversationId,
      locale: 'en',
      skipCache: true,
    });

    await sleep(2500);

    const recallResult = await voltAgent.chat(memoryRecall, {
      tenantId,
      userId: user.id,
      conversationId,
      locale: 'en',
      skipCache: true,
    });

    const recallText = (recallResult.text || '').toLowerCase();
    const memoryOk = recallText.includes('ultramarine');
    results.push({
      name: 'Memory recall',
      status: memoryOk ? 'passed' : 'failed',
      durationMs: Date.now() - memoryStart,
      details: memoryOk ? undefined : 'Memory value not recalled in response',
    });

    if (memoryService) {
      const memories = await memoryService.searchMemoriesSemantic(tenantId, user.id, 'favorite color', 5);
      const hasMemory = memories.some((m) => (m.content || '').toLowerCase().includes('ultramarine'));
      results.push({
        name: 'Memory stored',
        status: hasMemory ? 'passed' : 'failed',
        durationMs: 0,
        details: hasMemory ? undefined : 'No memory entry found for favorite color',
      });
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    results.push({
      name: 'Memory recall',
      status: 'failed',
      durationMs: Date.now() - memoryStart,
      details: errMsg,
    });
  }

  // Rate limit cooldown
  await sleep(5000);

  // Streaming sanitization test
  const streamStart = Date.now();
  try {
    const stream = voltAgent.streamChat('Briefly describe your capabilities.', {
      tenantId,
      userId: user.id,
      conversationId,
      locale: 'en',
      skipCache: true,
    });
    const streamText = await collectStream(stream);
    const markers = hasInternalMarkers(streamText);
    const placeholders = hasPiiPlaceholders(streamText);
    results.push({
      name: 'Streaming sanitization',
      status: markers || placeholders ? 'failed' : 'passed',
      durationMs: Date.now() - streamStart,
      details: markers || placeholders ? `markers=${markers}, placeholders=${placeholders}` : undefined,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    results.push({
      name: 'Streaming sanitization',
      status: 'failed',
      durationMs: Date.now() - streamStart,
      details: errMsg,
    });
  }

  // Cleanup pending actions created during test run
  if (hitlService && pendingActionIds.length > 0) {
    for (const actionId of pendingActionIds) {
      try {
        await hitlService.rejectAction(tenantId, actionId, user.id, undefined, 'Bruteforce test cleanup');
      } catch {
        // Ignore cleanup failures
      }
    }
  }

  const passed = results.filter((r) => r.status === 'passed').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  console.log('\nBruteforce validation results');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Skipped: ${skipped}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results
      .filter((r) => r.status === 'failed')
      .forEach((r) => console.log(`- ${r.name}: ${r.details || 'no details'}`));
  }

  await app.close();
  await prisma.$disconnect();

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
