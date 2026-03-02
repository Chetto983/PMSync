/**
 * 50+ Case Comparison Script for Non-Chat AI Services.
 *
 * Runs each service against a set of fixture inputs, validates output
 * against Zod schemas, and generates a field-by-field match report.
 *
 * Usage: npx ts-node backend/scripts/compare-nonchat-output.ts
 *
 * Requires: MISTRAL_API_KEY (runs real LLM calls)
 *
 * Phase 26 Plan 03 -- TEST-03
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { MistralProviderService } from '../src/modules/mistral/mistral-provider.service';
import { BriefingService, briefingSchema } from '../src/modules/ai/services/briefing.service';
import { FollowUpDetectionService, followUpDetectionSchema } from '../src/modules/ai/services/follow-up-detection.service';
import { DraftGenerationService, draftGenerationSchema } from '../src/modules/ai/services/draft-generation.service';

// ---------- Configuration ----------

const API_KEY = process.env.MISTRAL_API_KEY;
if (!API_KEY) {
  console.error('MISTRAL_API_KEY required. Set it in .env or environment.');
  process.exit(1);
}

const configService = {
  get: (key: string) => (key === 'MISTRAL_API_KEY' ? API_KEY : undefined),
  getOrThrow: (key: string) => {
    if (key === 'MISTRAL_API_KEY') return API_KEY!;
    throw new Error(`Config key ${key} not found`);
  },
} as unknown as ConfigService;

// ---------- Fixture Generators ----------

interface BriefingInput {
  name: string;
  unreadCount: number;
  eventCount: number;
  followUpCount: number;
  staleContactCount: number;
}

interface FollowUpInput {
  name: string;
  emails: Array<{
    id: string;
    subject: string;
    from: string;
    bodyText: string;
    needsFollowUp: boolean;
  }>;
}

interface DraftInput {
  name: string;
  email: {
    id: string;
    subject: string;
    from: string;
    bodyText: string;
  };
  instruction: string;
  tone: string;
}

function generateBriefingCases(): BriefingInput[] {
  const cases: BriefingInput[] = [];
  // 20 cases varying email volume, calendar density, contacts
  const emailCounts = [0, 3, 10, 20, 50];
  const eventCounts = [0, 1, 5, 8];
  let idx = 0;
  for (const ec of emailCounts) {
    for (const ev of eventCounts) {
      if (idx >= 20) break;
      cases.push({
        name: `briefing-${ec}emails-${ev}events`,
        unreadCount: ec,
        eventCount: ev,
        followUpCount: Math.min(ec, 3),
        staleContactCount: Math.min(Math.floor(ec / 5), 2),
      });
      idx++;
    }
  }
  return cases;
}

function generateFollowUpCases(): FollowUpInput[] {
  const patterns = [
    { subject: 'Action Required: Budget Review', body: 'Please review and submit by Friday.', needsFollowUp: true },
    { subject: 'Weekly Newsletter', body: 'Top stories this week in tech.', needsFollowUp: false },
    { subject: 'Meeting Notes', body: 'Here are the notes from today. No action needed.', needsFollowUp: false },
    { subject: 'Invoice Payment', body: 'Your invoice is overdue. Please pay immediately.', needsFollowUp: true },
    { subject: 'Project Update Request', body: 'Can you send me the latest project status?', needsFollowUp: true },
    { subject: 'Conference Invitation', body: 'You are invited to speak at our conference.', needsFollowUp: true },
    { subject: 'Auto-reply: Out of Office', body: 'I am currently out of office.', needsFollowUp: false },
    { subject: 'Contract Renewal', body: 'Your contract expires next month. Please review.', needsFollowUp: true },
    { subject: 'Shipping Notification', body: 'Your package has been shipped.', needsFollowUp: false },
    { subject: 'Feedback Request', body: 'How was your experience? Please share feedback.', needsFollowUp: false },
  ];

  const cases: FollowUpInput[] = [];
  for (let i = 0; i < 20; i++) {
    // Each case has 3-5 emails drawn from patterns
    const emailCount = 3 + (i % 3);
    const emails = [];
    for (let j = 0; j < emailCount; j++) {
      const p = patterns[(i * 3 + j) % patterns.length];
      emails.push({
        id: `e-fu-${i}-${j}`,
        subject: `${p.subject} (case ${i})`,
        from: `sender${j}@company.com`,
        bodyText: p.body,
        needsFollowUp: p.needsFollowUp,
      });
    }
    cases.push({ name: `followup-case-${i}`, emails });
  }
  return cases;
}

function generateDraftCases(): DraftInput[] {
  const scenarios = [
    { subject: 'Project Proposal', body: 'Here is our project proposal for Q2.', instruction: 'reply formally accepting', tone: 'formal' },
    { subject: 'Quick Question', body: 'Hey, do you have the report?', instruction: 'reply casually saying yes', tone: 'casual' },
    { subject: 'API Integration Issue', body: 'We are seeing 500 errors on the /users endpoint.', instruction: 'reply with technical troubleshooting steps', tone: 'technical' },
    { subject: 'Birthday Party', body: 'You are invited to my birthday party!', instruction: 'reply enthusiastically accepting', tone: 'friendly' },
    { subject: 'Contract Terms', body: 'Please review the updated contract terms.', instruction: 'reply formally requesting clarification on section 4', tone: 'formal' },
    { subject: 'Design Review', body: 'Attached are the new mockups for the dashboard.', instruction: 'reply with feedback on the color scheme', tone: 'casual' },
    { subject: 'Security Audit Results', body: 'We found 3 critical vulnerabilities.', instruction: 'reply formally acknowledging and requesting remediation timeline', tone: 'formal' },
    { subject: 'Team Outing', body: 'Shall we go bowling this Friday?', instruction: 'reply saying you will join', tone: 'friendly' },
    { subject: 'Budget Approval', body: 'Your budget request for $50k has been submitted.', instruction: 'reply thanking and confirming', tone: 'formal' },
    { subject: 'Code Review Request', body: 'Please review PR #456 for the auth module.', instruction: 'reply saying you will review by EOD', tone: 'technical' },
  ];
  return scenarios.map((s, i) => ({
    name: `draft-case-${i}`,
    email: {
      id: `e-draft-${i}`,
      subject: s.subject,
      from: `sender${i}@company.com`,
      bodyText: s.body,
    },
    instruction: s.instruction,
    tone: s.tone,
  }));
}

// ---------- Mock Prisma Factories ----------

function createBriefingPrismaMock(input: BriefingInput) {
  const emails = Array.from({ length: input.unreadCount }, (_, i) => ({
    id: `e-b-${i}`, subject: `Email ${i}`, from: `sender${i}@co.com`,
    snippet: `Snippet for email ${i}`, receivedAt: new Date(),
  }));
  const events = Array.from({ length: input.eventCount }, (_, i) => ({
    id: `ev-${i}`, title: `Event ${i}`,
    startTime: new Date(Date.now() + i * 3600000),
    endTime: new Date(Date.now() + (i + 1) * 3600000),
  }));
  const followUps = Array.from({ length: input.followUpCount }, (_, i) => ({
    id: `fu-${i}`, emailId: `e-b-${i}`, reason: `Reason ${i}`, dueDate: new Date(),
  }));
  const staleContacts = Array.from({ length: input.staleContactCount }, (_, i) => ({
    id: `c-${i}`, displayName: `Contact ${i}`,
    lastInteractedAt: new Date(Date.now() - 60 * 86400000),
  }));

  return {
    email: {
      findMany: () => Promise.resolve(emails),
      count: () => Promise.resolve(input.unreadCount),
    },
    calendarEvent: { findMany: () => Promise.resolve(events) },
    emailFollowUp: { findMany: () => Promise.resolve(followUps) },
    contact: { findMany: () => Promise.resolve(staleContacts) },
  } as any;
}

function createFollowUpPrismaMock(input: FollowUpInput) {
  return {
    email: {
      findMany: () => Promise.resolve(input.emails.map(e => ({
        id: e.id, subject: e.subject, from: e.from,
        to: 'me@co.com', bodyText: e.bodyText, receivedAt: new Date(),
      }))),
    },
  } as any;
}

function createDraftPrismaMock(input: DraftInput) {
  return {
    email: {
      findFirst: () => Promise.resolve({
        id: input.email.id, subject: input.email.subject,
        from: input.email.from, to: 'me@co.com', cc: null,
        bodyText: input.email.bodyText, threadId: null, receivedAt: new Date(),
      }),
      findMany: () => Promise.resolve([]),
    },
  } as any;
}

// ---------- Report ----------

interface CaseResult {
  service: string;
  name: string;
  schemaValid: boolean;
  fieldChecks: Record<string, boolean>;
  error?: string;
}

// ---------- Main ----------

async function main() {
  const mistralProvider = new MistralProviderService(configService);

  const briefingCases = generateBriefingCases();
  const followUpCases = generateFollowUpCases();
  const draftCases = generateDraftCases();

  const totalCases = briefingCases.length + followUpCases.length + draftCases.length;
  console.log(`\n=== Non-Chat AI Comparison Script ===`);
  console.log(`Total cases: ${totalCases} (${briefingCases.length} briefing, ${followUpCases.length} follow-up, ${draftCases.length} draft)\n`);

  const results: CaseResult[] = [];
  let completed = 0;

  // --- Briefing cases ---
  for (const input of briefingCases) {
    try {
      const prisma = createBriefingPrismaMock(input);
      const service = new BriefingService(mistralProvider, prisma, undefined);
      const result = await service.generateBriefing('test-tenant');
      const parsed = briefingSchema.safeParse(result.data);

      results.push({
        service: 'briefing',
        name: input.name,
        schemaValid: parsed.success,
        fieldChecks: {
          executiveSummary: !!result.data.executiveSummary && result.data.executiveSummary.length > 5,
          priorityEmails: Array.isArray(result.data.priorityEmails),
          calendarSnapshot: Array.isArray(result.data.calendarSnapshot),
          emailVolumeTrends: !!result.data.emailVolumeTrends,
        },
      });
    } catch (err: any) {
      results.push({
        service: 'briefing',
        name: input.name,
        schemaValid: false,
        fieldChecks: {},
        error: err.message,
      });
    }
    completed++;
    process.stdout.write(`\r  Progress: ${completed}/${totalCases}`);
    // Rate limit: ~2 req/s
    await new Promise(r => setTimeout(r, 600));
  }

  // --- Follow-up cases ---
  for (const input of followUpCases) {
    try {
      const prisma = createFollowUpPrismaMock(input);
      const service = new FollowUpDetectionService(mistralProvider, prisma, undefined);
      const result = await service.detectFollowUps('test-tenant', 24);
      const parsed = followUpDetectionSchema.safeParse(result.data);

      results.push({
        service: 'follow-up',
        name: input.name,
        schemaValid: parsed.success,
        fieldChecks: {
          detectedFollowUps: Array.isArray(result.data.detectedFollowUps),
          batchSummary: !!result.data.batchSummary,
          totalAnalyzedMatch: result.data.batchSummary.totalAnalyzed >= input.emails.length,
          confidenceRange: result.data.detectedFollowUps.every(
            f => f.confidence >= 0 && f.confidence <= 1,
          ),
        },
      });
    } catch (err: any) {
      results.push({
        service: 'follow-up',
        name: input.name,
        schemaValid: false,
        fieldChecks: {},
        error: err.message,
      });
    }
    completed++;
    process.stdout.write(`\r  Progress: ${completed}/${totalCases}`);
    await new Promise(r => setTimeout(r, 600));
  }

  // --- Draft cases ---
  for (const input of draftCases) {
    try {
      const prisma = createDraftPrismaMock(input);
      const service = new DraftGenerationService(mistralProvider, prisma, undefined);
      const result = await service.generateDraft('test-tenant', {
        emailId: input.email.id,
        instruction: input.instruction,
        tone: input.tone,
      });
      const parsed = draftGenerationSchema.safeParse(result.data);

      results.push({
        service: 'draft',
        name: input.name,
        schemaValid: parsed.success,
        fieldChecks: {
          subjectNonEmpty: !!result.data.subject && result.data.subject.length > 0,
          bodyNonEmpty: !!result.data.body && result.data.body.length > 0,
          confidenceRange: result.data.confidence >= 0 && result.data.confidence <= 1,
          tonePresent: !!result.data.tone,
        },
      });
    } catch (err: any) {
      results.push({
        service: 'draft',
        name: input.name,
        schemaValid: false,
        fieldChecks: {},
        error: err.message,
      });
    }
    completed++;
    process.stdout.write(`\r  Progress: ${completed}/${totalCases}`);
    await new Promise(r => setTimeout(r, 600));
  }

  // ---------- Report ----------
  console.log('\n\n=== RESULTS ===\n');

  const byService = new Map<string, CaseResult[]>();
  for (const r of results) {
    const list = byService.get(r.service) || [];
    list.push(r);
    byService.set(r.service, list);
  }

  let totalPass = 0;
  let totalFail = 0;

  for (const [service, cases] of byService) {
    const pass = cases.filter(c => c.schemaValid).length;
    const fail = cases.length - pass;
    totalPass += pass;
    totalFail += fail;

    console.log(`--- ${service.toUpperCase()} (${pass}/${cases.length} schema-valid) ---`);

    // Field-by-field match percentages
    const fieldCounts: Record<string, { pass: number; total: number }> = {};
    for (const c of cases) {
      for (const [field, ok] of Object.entries(c.fieldChecks)) {
        if (!fieldCounts[field]) fieldCounts[field] = { pass: 0, total: 0 };
        fieldCounts[field].total++;
        if (ok) fieldCounts[field].pass++;
      }
    }
    for (const [field, counts] of Object.entries(fieldCounts)) {
      const pct = ((counts.pass / counts.total) * 100).toFixed(0);
      console.log(`  ${field}: ${pct}% (${counts.pass}/${counts.total})`);
    }

    // List failures
    const failures = cases.filter(c => !c.schemaValid);
    if (failures.length > 0) {
      console.log(`  Failures:`);
      for (const f of failures) {
        console.log(`    - ${f.name}: ${f.error || 'schema validation failed'}`);
      }
    }
    console.log('');
  }

  console.log(`=== TOTAL: ${totalPass}/${totalPass + totalFail} passed (${totalCases} cases) ===\n`);

  // Exit with error code if too many failures
  if (totalFail > totalCases * 0.2) {
    console.error('FAIL: More than 20% of cases failed schema validation.');
    process.exit(1);
  }
  console.log('PASS: Schema validation rate is above 80%.');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
