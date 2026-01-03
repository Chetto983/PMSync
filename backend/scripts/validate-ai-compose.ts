/**
 * AI Compose Validation Script
 *
 * Tests the AI email composition endpoint with real data.
 * Run with: npx ts-node scripts/validate-ai-compose.ts
 */

import 'dotenv/config';
import { Mistral } from '@mistralai/mistralai';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-latest';

interface ComposeTestCase {
  name: string;
  prompt: string;
  tone: 'formal' | 'casual' | 'professional';
  locale: 'en' | 'it';
  expectedFields: string[];
}

const testCases: ComposeTestCase[] = [
  {
    name: 'Italian thank you email',
    prompt: 'Scrivi una breve email di ringraziamento per la collaborazione sul progetto',
    tone: 'professional',
    locale: 'it',
    expectedFields: ['body', 'subject'],
  },
  {
    name: 'English meeting request',
    prompt: 'Write an email to schedule a meeting next week to discuss the project status',
    tone: 'formal',
    locale: 'en',
    expectedFields: ['body', 'subject'],
  },
  {
    name: 'Casual follow-up',
    prompt: 'Send a friendly reminder about the pending invoice',
    tone: 'casual',
    locale: 'en',
    expectedFields: ['body', 'subject'],
  },
];

const toneInstructions = {
  formal: {
    en: 'Use a formal, professional tone with proper business etiquette.',
    it: 'Usa un tono formale e professionale con etichetta aziendale appropriata.',
  },
  casual: {
    en: 'Use a friendly, conversational tone while remaining professional.',
    it: 'Usa un tono amichevole e colloquiale mantenendo la professionalità.',
  },
  professional: {
    en: 'Use a clear and professional tone.',
    it: 'Usa un tono chiaro e professionale.',
  },
};

const systemPrompts = {
  en: (tone: string) =>
    `You are an assistant that drafts clear, professional email replies. ${tone} Reply ONLY in JSON: {"body":"...", "subject":"..."}. Avoid markdown.`,
  it: (tone: string) =>
    `Sei un assistente che redige risposte email chiare e professionali. ${tone} Rispondi solo in JSON: {"body":"...", "subject":"..."}. Evita markdown.`,
};

const composePromptParts = {
  en: {
    draftInstruction: 'Draft a ready-to-send email.',
    requestedTone: 'Requested tone',
    userPrompt: 'User prompt',
    jsonInstruction: 'Return JSON with body and subject fields. No markdown.',
  },
  it: {
    draftInstruction: 'Scrivi una email pronta da inviare.',
    requestedTone: 'Tono richiesto',
    userPrompt: 'Istruzioni utente',
    jsonInstruction: 'Restituisci JSON con campi body e subject. Nessun markdown.',
  },
};

function buildComposePrompt(
  prompt: string,
  tone: 'formal' | 'casual' | 'professional',
  locale: 'en' | 'it',
): string {
  const parts = composePromptParts[locale];
  const toneValue = toneInstructions[tone][locale];

  return [
    parts.draftInstruction,
    `${parts.requestedTone}: ${toneValue}`,
    `${parts.userPrompt}: ${prompt}`,
    parts.jsonInstruction,
  ].join('\n');
}

function parseComposeResult(
  raw: string,
): { body: string; subject?: string; parseError?: string } {
  console.log('\n  [parseComposeResult] Raw input (first 500 chars):');
  console.log('  ', raw.substring(0, 500));

  try {
    let cleaned = raw.trim();

    // Remove markdown code blocks
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    }
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }

    cleaned = cleaned.trim();
    console.log('\n  [parseComposeResult] Cleaned JSON:');
    console.log('  ', cleaned.substring(0, 300));

    const parsed = JSON.parse(cleaned);
    console.log('\n  [parseComposeResult] Parsed object:');
    console.log('  ', JSON.stringify(parsed, null, 2).substring(0, 300));

    return {
      body: parsed.body || '',
      subject: parsed.subject,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log('\n  [parseComposeResult] JSON parse FAILED:', errorMsg);
    return {
      body: raw.trim() || 'Draft unavailable',
      parseError: errorMsg,
    };
  }
}

async function runTest(testCase: ComposeTestCase, client: Mistral): Promise<boolean> {
  console.log('\n' + '='.repeat(60));
  console.log(`TEST: ${testCase.name}`);
  console.log('='.repeat(60));
  console.log(`  Prompt: "${testCase.prompt}"`);
  console.log(`  Tone: ${testCase.tone}`);
  console.log(`  Locale: ${testCase.locale}`);

  const toneInstruction = toneInstructions[testCase.tone][testCase.locale];
  const systemPrompt = systemPrompts[testCase.locale](toneInstruction);
  const userPrompt = buildComposePrompt(testCase.prompt, testCase.tone, testCase.locale);

  console.log('\n  [System Prompt]:');
  console.log('  ', systemPrompt);
  console.log('\n  [User Prompt]:');
  console.log('  ', userPrompt);

  try {
    console.log('\n  [Calling Mistral API with JSON mode...]');
    const startTime = Date.now();

    const completion = await client.chat.complete({
      model: MISTRAL_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.35,
      maxTokens: 900,
      // Enable JSON mode for guaranteed valid JSON output
      responseFormat: { type: 'json_object' },
    });

    const elapsed = Date.now() - startTime;
    console.log(`  [Response received in ${elapsed}ms]`);

    const rawResponse =
      typeof completion.choices?.[0]?.message?.content === 'string'
        ? completion.choices[0].message.content
        : '';

    console.log('\n  [Raw Mistral Response]:');
    console.log('  ', rawResponse.substring(0, 500));

    if (!rawResponse) {
      console.log('\n  ❌ FAILED: Empty response from Mistral');
      return false;
    }

    const parsed = parseComposeResult(rawResponse);

    console.log('\n  [Final Result]:');
    console.log(`    Body: "${parsed.body.substring(0, 150)}..."`);
    console.log(`    Subject: "${parsed.subject || '(none)'}"`);

    // Validate
    const hasBody = parsed.body && parsed.body.length > 10;
    const hasSubject = parsed.subject && parsed.subject.length > 0;

    if (!hasBody) {
      console.log('\n  ❌ FAILED: Body is empty or too short');
      return false;
    }

    if (!hasSubject) {
      console.log('\n  ⚠️  WARNING: Subject is missing');
    }

    console.log('\n  ✅ PASSED');
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\n  ❌ FAILED: ${errorMsg}`);
    return false;
  }
}

async function main() {
  console.log('\n🧪 AI Compose Validation Script');
  console.log('================================\n');

  // Check API key
  if (!MISTRAL_API_KEY) {
    console.error('❌ ERROR: MISTRAL_API_KEY is not set in environment');
    console.error('   Please set it in your .env file or environment variables');
    process.exit(1);
  }

  console.log(`✅ MISTRAL_API_KEY: ${MISTRAL_API_KEY.substring(0, 8)}...`);
  console.log(`✅ MISTRAL_MODEL: ${MISTRAL_MODEL}`);

  // Create client
  const client = new Mistral({ apiKey: MISTRAL_API_KEY });

  // Run tests
  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const success = await runTest(testCase, client);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total: ${testCases.length}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check the logs above for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
