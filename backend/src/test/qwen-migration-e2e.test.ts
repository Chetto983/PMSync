/**
 * Qwen 3.5 Migration E2E Test — Real API calls to verify all AI functions
 * work correctly after Mistral → Qwen 3.5 migration.
 *
 * Tests:
 * 1. generateText (flash) — simple completion
 * 2. generateText (plus) — complex completion
 * 3. embed — single embedding (Mistral)
 * 4. embedMany — bulk embeddings (Mistral)
 * 5. Output.object — structured JSON output (briefing schema)
 * 6. Output.object — structured JSON output (follow-up detection schema)
 * 7. Output.object — structured JSON output (draft generation schema)
 * 8. Output.object — structured JSON output (reminder parser, Italian)
 * 9. streamText — streaming response
 * 10. Chat title generation — short title from conversation
 *
 * Requires: OPENROUTER_API_KEY, MISTRAL_API_KEY
 */
import { describe, it, expect } from 'vitest';
import { generateText, streamText, embed, embedMany } from 'ai';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { parseJsonOutput } from '../modules/ai/utils/parse-json-output';

// ── Providers ──────────────────────────────────────────────────────────────

const mistral = createMistral({ apiKey: process.env.MISTRAL_API_KEY! });
const openRouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });

const FLASH = 'qwen/qwen3.5-flash-02-23';
const PLUS = 'qwen/qwen3.5-plus-02-15';

const chatModel = (id: string) =>
  openRouter.chat(id, { provider: { data_collection: 'deny', sort: 'latency' } });

// ── Schemas (copied from services) ────────────────────────────────────────

const briefingSchema = z.object({
  priorityEmails: z.array(z.object({
    emailId: z.string(),
    subject: z.string(),
    sender: z.string(),
    urgency: z.enum(['critical', 'high', 'medium', 'low']),
    reason: z.string(),
  })),
  executiveSummary: z.string(),
  emailVolumeTrends: z.object({
    todayReceived: z.number(),
    todaySent: z.number(),
    weeklyAvgReceived: z.number(),
    weeklyAvgSent: z.number(),
    trend: z.enum(['increasing', 'stable', 'decreasing']),
  }),
});

const followUpSchema = z.object({
  detectedFollowUps: z.array(z.object({
    emailId: z.string(),
    reason: z.string(),
    suggestedDueDate: z.string().nullable(),
    urgency: z.enum(['high', 'medium', 'low']),
    confidence: z.number(),
  })),
  batchSummary: z.object({
    totalAnalyzed: z.number(),
    totalDetected: z.number(),
    highUrgencyCount: z.number(),
  }),
});

const draftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  suggestedRecipients: z.array(z.object({
    email: z.string(),
    name: z.string().nullable(),
  })),
  confidence: z.number(),
  tone: z.enum(['formal', 'casual', 'technical', 'friendly']),
});

const reminderSchema = z.object({
  is_reminder: z.boolean(),
  titolo: z.string(),
  descrizione: z.string().nullable(),
  contatto: z.string().nullable(),
  scadenza_datetime: z.string().nullable(),
  periodo: z.enum(['mattina', 'pomeriggio', 'sera', 'tutto_il_giorno']).nullable(),
  azione: z.enum(['chiama', 'scrivi_mail', 'verifica', 'conferma', 'controlla', 'altro']),
  priorita: z.enum(['alta', 'media', 'bassa']),
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Qwen 3.5 Migration E2E (real API)', () => {
  // 1. Flash — simple completion
  it('generateText: Qwen 3.5 Flash (simple/fast tier)', async () => {
    const { text, usage } = await generateText({
      model: chatModel(FLASH),
      prompt: 'Classify this email subject as SPAM or HAM: "Meeting tomorrow at 3pm". Reply with one word.',
      maxOutputTokens: 10,
      abortSignal: AbortSignal.timeout(15_000),
    });
    expect(text.toLowerCase()).toMatch(/ham/);
    expect(usage.totalTokens).toBeGreaterThan(0);
  }, 30_000);

  // 2. Plus — complex completion
  it('generateText: Qwen 3.5 Plus (chat/complex tier)', async () => {
    const { text, usage } = await generateText({
      model: chatModel(PLUS),
      system: 'You are an email assistant. Be concise.',
      prompt: 'Summarize this email in one sentence: "Hi team, the quarterly review is moved to Friday 3pm. Please prepare your slides by Thursday EOD. The CEO will attend."',
      maxOutputTokens: 100,
      abortSignal: AbortSignal.timeout(30_000),
    });
    expect(text.length).toBeGreaterThan(10);
    expect(text.toLowerCase()).toMatch(/friday|review|slides/);
    expect(usage.totalTokens).toBeGreaterThan(0);
  }, 45_000);

  // 3. Single embedding (Mistral)
  it('embed: Mistral mistral-embed (1024-dim)', async () => {
    const { embedding, usage } = await embed({
      model: mistral.embedding('mistral-embed'),
      value: 'Quarterly review meeting preparation',
      abortSignal: AbortSignal.timeout(15_000),
    });
    expect(embedding).toHaveLength(1024);
    expect(embedding.every(v => typeof v === 'number' && Number.isFinite(v))).toBe(true);
    expect(usage.tokens).toBeGreaterThan(0);
  }, 30_000);

  // 4. Bulk embeddings (Mistral)
  it('embedMany: Mistral bulk embeddings preserve order', async () => {
    const inputs = [
      'Follow up with client about proposal',
      'Team standup notes from Monday',
      'Invoice #1234 payment received',
    ];
    const { embeddings } = await embedMany({
      model: mistral.embedding('mistral-embed'),
      values: inputs,
      maxParallelCalls: 2,
      abortSignal: AbortSignal.timeout(30_000),
    });
    expect(embeddings).toHaveLength(3);
    expect(embeddings.every(e => e.length === 1024)).toBe(true);
    // Ensure vectors are distinct
    const dot01 = embeddings[0].reduce((s, v, i) => s + v * embeddings[1][i], 0);
    const dot02 = embeddings[0].reduce((s, v, i) => s + v * embeddings[2][i], 0);
    expect(dot01).not.toBeCloseTo(dot02, 3);
  }, 45_000);

  // 5. Structured JSON — Briefing schema via parseJsonOutput
  it('parseJsonOutput: briefing schema (Qwen 3.5 Flash)', async () => {
    const { text } = await generateText({
      model: chatModel(FLASH),
      system: 'Generate a daily email briefing. Return a JSON object with EXACTLY these fields: {"priorityEmails": [{"emailId": string, "subject": string, "sender": string, "urgency": "critical"|"high"|"medium"|"low", "reason": string}], "executiveSummary": string, "emailVolumeTrends": {"todayReceived": number, "todaySent": number, "weeklyAvgReceived": number, "weeklyAvgSent": number, "trend": "increasing"|"stable"|"decreasing"}}',
      prompt: `Emails received today: 3 (from john@acme.com about "Contract renewal", from hr@company.com about "Benefits enrollment", from support@vendor.com about "Ticket #789 resolved"). Sent: 1. Weekly avg: received 20, sent 8. Return valid JSON.`,
      maxOutputTokens: 1000,
      abortSignal: AbortSignal.timeout(90_000),
    });
    const result = parseJsonOutput(text, briefingSchema);
    expect(result.priorityEmails.length).toBeGreaterThanOrEqual(1);
    expect(result.executiveSummary.length).toBeGreaterThan(10);
    expect(result.emailVolumeTrends.todayReceived).toBeGreaterThanOrEqual(1);
    expect(['increasing', 'stable', 'decreasing']).toContain(result.emailVolumeTrends.trend);
  }, 120_000);

  // 6. Structured JSON — Follow-up detection schema
  it('parseJsonOutput: follow-up detection schema (Qwen 3.5 Flash)', async () => {
    const { text } = await generateText({
      model: chatModel(FLASH),
      system: `Analyze emails and detect which need follow-up. Be conservative. Return a JSON object with EXACTLY these fields: {"detectedFollowUps": [{"emailId": string, "reason": string, "suggestedDueDate": string|null, "urgency": "high"|"medium"|"low", "confidence": number}], "batchSummary": {"totalAnalyzed": number, "totalDetected": number, "highUrgencyCount": number}}`,
      prompt: `Emails to analyze:\n1. ID: "email-001", From: john@acme.com, Subject: "Can you send the proposal by Friday?", Date: 2026-03-20\n2. ID: "email-002", From: newsletter@news.com, Subject: "Weekly digest", Date: 2026-03-20\n3. ID: "email-003", From: boss@company.com, Subject: "Please confirm attendance for Monday meeting", Date: 2026-03-19\n\nReturn JSON.`,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(90_000),
    });
    const result = parseJsonOutput(text, followUpSchema);
    expect(result.batchSummary.totalAnalyzed).toBe(3);
    expect(result.detectedFollowUps.length).toBeGreaterThanOrEqual(1);
    const newsletterFlagged = result.detectedFollowUps.some(f => f.emailId === 'email-002');
    expect(newsletterFlagged).toBe(false);
  }, 120_000);

  // 7. Structured JSON — Draft generation schema
  it('parseJsonOutput: draft generation schema (Qwen 3.5 Flash)', async () => {
    const { text } = await generateText({
      model: chatModel(FLASH),
      system: 'Generate a reply draft. Match the requested tone. Return a JSON object with EXACTLY these fields: {"subject": string, "body": string, "suggestedRecipients": [{"email": string, "name": string|null}], "confidence": number, "tone": "formal"|"casual"|"technical"|"friendly"}',
      prompt: `Original email from john@acme.com: Subject "Contract renewal" Body "Hi, the contract expires next month. Can we schedule a call to discuss renewal terms?"\nUser instruction: "Accept and propose next Tuesday"\nTone: formal\n\nReturn JSON.`,
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(90_000),
    });
    const result = parseJsonOutput(text, draftSchema);
    expect(result.subject.toLowerCase()).toContain('re:');
    expect(result.body.length).toBeGreaterThan(20);
    expect(result.tone).toBe('formal');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.suggestedRecipients.length).toBeGreaterThanOrEqual(1);
  }, 120_000);

  // 8. Structured JSON — Reminder parser (Italian)
  it('parseJsonOutput: reminder parser Italian (Qwen 3.5 Flash)', async () => {
    const { text } = await generateText({
      model: chatModel(FLASH),
      system: `Sei un assistente aziendale. Analizza la richiesta e restituisci un oggetto JSON strutturato con i campi esatti dello schema. I campi richiesti sono: is_reminder (boolean), titolo (string), descrizione (string|null), contatto (string|null), scadenza_datetime (string|null ISO8601), periodo (mattina|pomeriggio|sera|tutto_il_giorno|null), azione (chiama|scrivi_mail|verifica|conferma|controlla|altro), priorita (alta|media|bassa). Data corrente: 2026-03-21T10:00:00+01:00`,
      prompt: 'Ricordami di chiamare Mario Rossi lunedì mattina per confermare l\'ordine. Rispondi in JSON.',
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(90_000),
    });
    const result = parseJsonOutput(text, reminderSchema);
    expect(result.is_reminder).toBe(true);
    expect(result.contatto?.toLowerCase()).toContain('mario');
    expect(result.azione).toBe('chiama');
    expect(result.periodo).toBe('mattina');
  }, 120_000);

  // 9. streamText — streaming response
  it('streamText: Qwen 3.5 Flash streaming', async () => {
    const result = streamText({
      model: chatModel(FLASH),
      prompt: 'List 3 email productivity tips, one per line. Be brief.',
      maxOutputTokens: 200,
      abortSignal: AbortSignal.timeout(15_000),
    });
    const chunks: string[] = [];
    for await (const chunk of result.textStream) {
      chunks.push(chunk);
    }
    const fullText = chunks.join('');
    expect(chunks.length).toBeGreaterThan(1); // Actually streamed
    expect(fullText.length).toBeGreaterThan(20);
  }, 30_000);

  // 10. Chat title generation pattern
  it('generateText: chat title generation (Qwen 3.5 Flash)', async () => {
    const { text } = await generateText({
      model: chatModel(FLASH),
      system: 'Generate a short title (max 60 chars) for this conversation. Reply with ONLY the title, no quotes.',
      prompt: `Conversation:\nUser: Can you summarize my unread emails?\nAssistant: You have 5 unread emails. The most important is from John about the contract renewal.\n\nTitle:`,
      temperature: 0.2,
      maxOutputTokens: 32,
      abortSignal: AbortSignal.timeout(15_000),
    });
    expect(text.length).toBeGreaterThan(3);
    expect(text.length).toBeLessThanOrEqual(80); // Some tolerance
  }, 30_000);

  // 11. Embedding similarity — semantic search validation
  it('embedding similarity: related texts score higher than unrelated', async () => {
    const texts = [
      'Schedule a meeting with the marketing team',    // query
      'Book a call with marketing department tomorrow', // similar
      'Invoice payment received from accounting',       // different
    ];
    const { embeddings } = await embedMany({
      model: mistral.embedding('mistral-embed'),
      values: texts,
      abortSignal: AbortSignal.timeout(15_000),
    });
    const cosine = (a: number[], b: number[]) => {
      const dot = a.reduce((s, v, i) => s + v * b[i], 0);
      const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
      const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
      return dot / (magA * magB);
    };
    const simSimilar = cosine(embeddings[0], embeddings[1]);
    const simDifferent = cosine(embeddings[0], embeddings[2]);
    expect(simSimilar).toBeGreaterThan(simDifferent);
  }, 30_000);

  // 12. Code generation pattern (sandbox tool replacement)
  it('generateText: code generation via chat model (replaces Devstral)', async () => {
    const { text } = await generateText({
      model: chatModel(FLASH),
      messages: [{ role: 'user', content: 'Write a Python function that returns the fibonacci sequence up to n. Return ONLY the code, no explanation.' }],
      maxOutputTokens: 500,
      abortSignal: AbortSignal.timeout(60_000),
    });
    const cleaned = text.replace(/^```(?:python)?\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    expect(cleaned).toContain('def');
    expect(cleaned.toLowerCase()).toContain('fib');
  }, 90_000);
});
