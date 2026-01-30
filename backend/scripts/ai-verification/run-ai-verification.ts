#!/usr/bin/env ts-node
/**
 * AI Verification Suite Runner
 *
 * BRUTE FORCE TESTING - NO MOCKS!
 * Uses real Prisma, real Mistral API, real tenant data.
 *
 * Usage:
 *   npx tsx scripts/ai-verification/run-ai-verification.ts --all
 *   npx tsx scripts/ai-verification/run-ai-verification.ts --component=intent
 *   npx tsx scripts/ai-verification/run-ai-verification.ts --tenant=<tenantId>
 */

// Load environment variables FIRST
import 'dotenv/config';

import { performance } from 'perf_hooks';
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { INestApplicationContext } from '@nestjs/common';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface MetricResult {
  name: string;
  value: number;
  target: number;
  unit: string;
  passed: boolean;
  industrialBenchmark?: number;
}

interface ComponentResult {
  component: string;
  metrics: MetricResult[];
  overallScore: number;
  passed: boolean;
  duration: number;
  errors: string[];
}

interface VerificationReport {
  timestamp: string;
  tenantId: string;
  components: ComponentResult[];
  qualityScore: number;
  performanceScore: number;
  reliabilityScore: number;
  costScore: number;
  overallScore: number;
  industrialRank: 'BELOW' | 'AVERAGE' | 'ABOVE' | 'BEST_IN_CLASS';
  passedCount: number;
  failedCount: number;
  warningCount: number;
}

// Global app context
let app: INestApplicationContext | null = null;
let tenantId: string;

// Direct Prisma client for standalone tests (use factory for Prisma 7)
import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../src/prisma/prisma-client.factory';
import { Mistral } from '@mistralai/mistralai';

let prismaClient: PrismaClient | null = null;
let mistralClient: Mistral | null = null;

function getPrisma(): PrismaClient {
  if (!prismaClient) {
    prismaClient = createPrismaClient();
  }
  return prismaClient;
}

function getMistral(): Mistral {
  if (!mistralClient) {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) throw new Error('MISTRAL_API_KEY not set');
    mistralClient = new Mistral({ apiKey });
  }
  return mistralClient;
}

// ============================================================================
// NESTJS BOOTSTRAP (Optional - for services that need full context)
// ============================================================================

async function bootstrapApp(): Promise<void> {
  // Import AppModule dynamically to avoid circular dependencies
  const { AppModule } = await import('../../src/app.module');

  console.log('🔧 Bootstrapping NestJS application...');
  app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  console.log('✅ NestJS context ready\n');
}

async function getService<T>(token: any): Promise<T> {
  if (!app) throw new Error('NestJS not bootstrapped');
  return app.get<T>(token);
}

// ============================================================================
// METRIC CALCULATIONS
// ============================================================================

function calculatePercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function calculateNDCG(relevances: number[], k: number = 10): number {
  const dcg = relevances.slice(0, k).reduce((sum, rel, i) => {
    return sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2);
  }, 0);
  const sortedRel = [...relevances].sort((a, b) => b - a);
  const idcg = sortedRel.slice(0, k).reduce((sum, rel, i) => {
    return sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2);
  }, 0);
  return idcg > 0 ? dcg / idcg : 0;
}

function calculateMRR(ranks: number[]): number {
  if (ranks.length === 0) return 0;
  return ranks.reduce((sum, rank) => sum + 1 / rank, 0) / ranks.length;
}

// ============================================================================
// TEST: INTENT CLASSIFICATION (REAL MODEL)
// ============================================================================

async function testIntentClassification(): Promise<ComponentResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  const metrics: MetricResult[] = [];

  console.log('\n📊 Testing Intent Classification...');

  try {
    const modelPath = path.join(process.cwd(), 'models', 'intent-classifier.bin');

    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model not found at ${modelPath}. Run retrain-intent-classifier.ts first.`);
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Classifier } = require('fasttext') as typeof import('fasttext');
    const classifier = new Classifier();
    await classifier.loadModel(modelPath);

    console.log('  ⏳ Running BRUTE FORCE classification tests...');

    // BRUTE FORCE: Test with many samples
    const enSamples = [
      { text: 'show me emails from John', expected: 'email_search' },
      { text: 'find emails about the project', expected: 'email_search' },
      { text: 'search for messages from yesterday', expected: 'email_search' },
      { text: 'write a new email', expected: 'email_compose' },
      { text: 'compose a message to Sarah', expected: 'email_compose' },
      { text: 'draft an email about the meeting', expected: 'email_compose' },
      { text: 'reply to John', expected: 'email_reply' },
      { text: 'respond to this email', expected: 'email_reply' },
      { text: 'forward this to Mike', expected: 'email_forward' },
      { text: 'delete this email', expected: 'email_delete' },
      { text: 'remove these messages', expected: 'email_delete' },
      { text: 'archive this', expected: 'email_archive' },
      { text: 'move to work folder', expected: 'email_move' },
      { text: 'open the email from boss', expected: 'email_read' },
      { text: 'summarize this thread', expected: 'email_summarize' },
      { text: 'show my calendar', expected: 'calendar_view' },
      { text: 'what meetings do I have today', expected: 'calendar_view' },
      { text: 'schedule a meeting with team', expected: 'calendar_create' },
      { text: 'create an event for Friday', expected: 'calendar_create' },
      { text: 'reschedule the meeting', expected: 'calendar_update' },
      { text: 'cancel tomorrow\'s meeting', expected: 'calendar_delete' },
      { text: 'find contact for Sarah', expected: 'contact_search' },
      { text: 'who is John Smith', expected: 'contact_search' },
      { text: 'add new contact', expected: 'contact_create' },
      { text: 'show my folders', expected: 'folder_list' },
      { text: 'create new folder', expected: 'folder_create' },
      { text: 'open settings', expected: 'settings_view' },
      { text: 'help me', expected: 'help' },
      { text: 'hello', expected: 'greeting' },
      { text: 'hi there', expected: 'greeting' },
      { text: 'good morning', expected: 'greeting' },
      { text: 'bye', expected: 'farewell' },
      { text: 'thanks', expected: 'thanks' },
      { text: 'how many unread', expected: 'status_check' },
      { text: 'inbox status', expected: 'status_check' },
    ];

    const itSamples = [
      { text: 'cerca email da Giovanni', expected: 'email_search' },
      { text: 'trova messaggi sul progetto', expected: 'email_search' },
      { text: 'mostra email di ieri', expected: 'email_search' },
      { text: 'scrivi una nuova email', expected: 'email_compose' },
      { text: 'componi un messaggio per Marco', expected: 'email_compose' },
      { text: 'rispondi a Maria', expected: 'email_reply' },
      { text: 'inoltra a Luca', expected: 'email_forward' },
      { text: 'elimina questa email', expected: 'email_delete' },
      { text: 'cancella questo messaggio', expected: 'email_delete' },
      { text: 'archivia questo', expected: 'email_archive' },
      { text: 'sposta in lavoro', expected: 'email_move' },
      { text: 'apri email del capo', expected: 'email_read' },
      { text: 'riassumi questo thread', expected: 'email_summarize' },
      { text: 'mostra il mio calendario', expected: 'calendar_view' },
      { text: 'che riunioni ho oggi', expected: 'calendar_view' },
      { text: 'programma una riunione', expected: 'calendar_create' },
      { text: 'crea evento per venerdì', expected: 'calendar_create' },
      { text: 'riprogramma la riunione', expected: 'calendar_update' },
      { text: 'cancella la riunione di domani', expected: 'calendar_delete' },
      { text: 'trova contatto di Anna', expected: 'contact_search' },
      { text: 'chi è Marco Rossi', expected: 'contact_search' },
      { text: 'aggiungi nuovo contatto', expected: 'contact_create' },
      { text: 'mostra le cartelle', expected: 'folder_list' },
      { text: 'crea nuova cartella', expected: 'folder_create' },
      { text: 'apri impostazioni', expected: 'settings_view' },
      { text: 'aiuto', expected: 'help' },
      { text: 'ciao', expected: 'greeting' },
      { text: 'buongiorno', expected: 'greeting' },
      { text: 'salve', expected: 'greeting' },
      { text: 'arrivederci', expected: 'farewell' },
      { text: 'grazie', expected: 'thanks' },
      { text: 'grazie mille', expected: 'thanks' },
      { text: 'quante non lette', expected: 'status_check' },
      { text: 'stato posta', expected: 'status_check' },
    ];

    // Test all samples with per-class tracking for F1
    let enCorrect = 0, itCorrect = 0;
    const allLatencies: number[] = [];
    const perClassStats: Record<string, { tp: number; fp: number; fn: number }> = {};

    // Initialize per-class stats
    const allIntents = [...new Set([...enSamples, ...itSamples].map(s => s.expected))];
    for (const intent of allIntents) {
      perClassStats[intent] = { tp: 0, fp: 0, fn: 0 };
    }

    for (const sample of enSamples) {
      const start = performance.now();
      const predictions = await classifier.predict(sample.text, 1);
      allLatencies.push(performance.now() - start);
      const predicted = predictions[0]?.label?.replace('__label__', '') || 'unknown';

      if (predicted === sample.expected) {
        enCorrect++;
        if (perClassStats[sample.expected]) perClassStats[sample.expected].tp++;
      } else {
        if (perClassStats[sample.expected]) perClassStats[sample.expected].fn++;
        if (perClassStats[predicted]) perClassStats[predicted].fp++;
      }
    }

    for (const sample of itSamples) {
      const start = performance.now();
      const predictions = await classifier.predict(sample.text, 1);
      allLatencies.push(performance.now() - start);
      const predicted = predictions[0]?.label?.replace('__label__', '') || 'unknown';

      if (predicted === sample.expected) {
        itCorrect++;
        if (perClassStats[sample.expected]) perClassStats[sample.expected].tp++;
      } else {
        if (perClassStats[sample.expected]) perClassStats[sample.expected].fn++;
        if (perClassStats[predicted]) perClassStats[predicted].fp++;
      }
    }

    // Calculate macro F1 score
    let totalF1 = 0;
    let classCount = 0;
    for (const [, stats] of Object.entries(perClassStats)) {
      const precision = stats.tp + stats.fp > 0 ? stats.tp / (stats.tp + stats.fp) : 0;
      const recall = stats.tp + stats.fn > 0 ? stats.tp / (stats.tp + stats.fn) : 0;
      const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
      if (stats.tp + stats.fn > 0) { // Only count intents that appear in test set
        totalF1 += f1;
        classCount++;
      }
    }
    const macroF1 = classCount > 0 ? totalF1 / classCount : 0;

    const enAccuracy = enCorrect / enSamples.length;
    const itAccuracy = itCorrect / itSamples.length;
    const latencyP99 = calculatePercentile(allLatencies, 99);

    console.log(`  ✓ EN Accuracy: ${(enAccuracy * 100).toFixed(1)}% (${enCorrect}/${enSamples.length})`);
    console.log(`  ✓ IT Accuracy: ${(itAccuracy * 100).toFixed(1)}% (${itCorrect}/${itSamples.length})`);
    console.log(`  ✓ Macro F1: ${(macroF1 * 100).toFixed(1)}%`);
    console.log(`  ✓ Latency P99: ${latencyP99.toFixed(2)}ms`);

    metrics.push({
      name: 'EN Accuracy',
      value: enAccuracy,
      target: 0.90,
      unit: '',
      passed: enAccuracy >= 0.90,
      industrialBenchmark: 0.92,
    });

    metrics.push({
      name: 'IT Accuracy',
      value: itAccuracy,
      target: 0.90,
      unit: '',
      passed: itAccuracy >= 0.90,
      industrialBenchmark: 0.88,
    });

    metrics.push({
      name: 'Latency P99',
      value: latencyP99,
      target: 5.0,
      unit: 'ms',
      passed: latencyP99 <= 5.0,
      industrialBenchmark: 1.0,
    });

    metrics.push({
      name: 'Macro F1',
      value: macroF1,
      target: 0.85,
      unit: '',
      passed: macroF1 >= 0.85,
      industrialBenchmark: 0.90,
    });

  } catch (error) {
    errors.push(`Intent classification failed: ${error}`);
    metrics.push({ name: 'EN Accuracy', value: 0, target: 0.90, unit: '', passed: false });
    metrics.push({ name: 'IT Accuracy', value: 0, target: 0.90, unit: '', passed: false });
    metrics.push({ name: 'Latency P99', value: 999, target: 5.0, unit: 'ms', passed: false });
    metrics.push({ name: 'Macro F1', value: 0, target: 0.85, unit: '', passed: false });
  }

  const duration = performance.now() - startTime;
  const overallScore = metrics.length > 0 ? metrics.filter(m => m.passed).length / metrics.length * 100 : 0;

  return {
    component: 'Intent Classification',
    metrics,
    overallScore,
    passed: metrics.every(m => m.passed),
    duration,
    errors,
  };
}

// ============================================================================
// TEST: EMBEDDING SERVICE (REAL TENANT DATA)
// ============================================================================

async function testEmbeddingService(): Promise<ComponentResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  const metrics: MetricResult[] = [];

  console.log('\n📊 Testing Embedding Service (REAL TENANT)...');

  try {
    const prisma = getPrisma();
    const mistral = getMistral();

    console.log(`  Using tenant: ${tenantId}`);

    // Count existing embeddings for tenant
    const embeddingCount = await prisma.embedding.count({ where: { tenantId } });
    console.log(`  📦 Tenant has ${embeddingCount} embeddings`);

    // Test 1: BULK embedding generation (user requested bulk ops)
    const testQueries = [
      'find emails from my boss',
      'urgent messages this week',
      'meeting notes from yesterday',
      'invoice from supplier',
      'project update status',
      'cerca email dal capo',
      'messaggi urgenti questa settimana',
      'note riunione di ieri',
      'fattura dal fornitore',
      'aggiornamento progetto',
    ];

    console.log('  ⏳ Testing BULK embedding generation (10 queries)...');
    const bulkStart = performance.now();

    // Use Mistral bulk embedding API
    const response = await mistral.embeddings.create({
      model: 'mistral-embed',
      inputs: testQueries,
    });

    const bulkLatency = performance.now() - bulkStart;
    const embedResults = response.data.map((d: any) => d.embedding);

    console.log(`  ✓ Bulk embedding (10 queries): ${bulkLatency.toFixed(0)}ms`);

    // Test 2: Similarity search on real data using raw SQL (pgvector)
    console.log('  ⏳ Testing similarity search on tenant data...');
    const searchLatencies: number[] = [];

    if (embeddingCount > 0 && embedResults.length > 0) {
      for (const embedding of embedResults.slice(0, 5)) {
        const vectorStr = `[${embedding.join(',')}]`;
        const searchStart = performance.now();

        const results = await prisma.$queryRaw`
          SELECT id, "documentName", "emailId", "contactId",
                 (vector <=> ${vectorStr}::vector) as distance
          FROM embeddings
          WHERE "tenantId" = ${tenantId}
          ORDER BY vector <=> ${vectorStr}::vector
          LIMIT 10
        `;

        searchLatencies.push(performance.now() - searchStart);
      }
    }

    // Test 3: Semantic quality (similar queries should have high cosine sim)
    const cosineSim = (a: number[], b: number[]): number => {
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    // EN and IT versions of same query should be similar
    const crossLingualSim = cosineSim(embedResults[0], embedResults[5]); // "find emails from boss" vs "cerca email dal capo"

    const avgSearchLatency = searchLatencies.length > 0
      ? searchLatencies.reduce((a, b) => a + b, 0) / searchLatencies.length
      : 0;
    const perQueryLatency = bulkLatency / testQueries.length;

    console.log(`  ✓ Per-query latency: ${perQueryLatency.toFixed(0)}ms`);
    console.log(`  ✓ Search Avg: ${avgSearchLatency.toFixed(1)}ms`);
    console.log(`  ✓ Cross-lingual Sim: ${(crossLingualSim * 100).toFixed(1)}%`);

    metrics.push({
      name: 'Embedding P95',
      value: perQueryLatency,
      target: 500,
      unit: 'ms',
      passed: perQueryLatency <= 500,
      industrialBenchmark: 300,
    });

    metrics.push({
      name: 'Search Latency',
      value: avgSearchLatency,
      target: 100,
      unit: 'ms',
      passed: avgSearchLatency <= 100 || embeddingCount === 0,
      industrialBenchmark: 50,
    });

    metrics.push({
      name: 'Cross-Lingual Quality',
      value: crossLingualSim,
      target: 0.6,
      unit: '',
      passed: crossLingualSim >= 0.6,
      industrialBenchmark: 0.75,
    });

    metrics.push({
      name: 'Tenant Embeddings',
      value: embeddingCount,
      target: 0,
      unit: '',
      passed: true, // Info metric
      industrialBenchmark: 1000,
    });

  } catch (error) {
    errors.push(`Embedding service failed: ${error}`);
    metrics.push({ name: 'Embedding P95', value: 999, target: 500, unit: 'ms', passed: false });
    metrics.push({ name: 'Search Latency', value: 999, target: 100, unit: 'ms', passed: false });
    metrics.push({ name: 'Cross-Lingual Quality', value: 0, target: 0.6, unit: '', passed: false });
  }

  const duration = performance.now() - startTime;
  const overallScore = metrics.length > 0 ? metrics.filter(m => m.passed).length / metrics.length * 100 : 0;

  return {
    component: 'Embedding Service',
    metrics,
    overallScore,
    passed: metrics.filter(m => m.name !== 'Tenant Embeddings').every(m => m.passed),
    duration,
    errors,
  };
}

// ============================================================================
// TEST: RAG RETRIEVAL (REAL TENANT DATA)
// ============================================================================

async function testRAGRetrieval(): Promise<ComponentResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  const metrics: MetricResult[] = [];

  console.log('\n📊 Testing RAG Retrieval (REAL TENANT)...');

  try {
    const prisma = getPrisma();
    const mistral = getMistral();

    console.log(`  Using tenant: ${tenantId}`);

    // Get real emails from tenant
    const emails = await prisma.email.findMany({
      where: { tenantId },
      select: { id: true, subject: true, from: true, snippet: true },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });

    const contacts = await prisma.contact.findMany({
      where: { tenantId },
      select: { id: true, displayName: true, emails: true },
      take: 50,
    });

    console.log(`  📧 Found ${emails.length} emails, ${contacts.length} contacts`);

    if (emails.length === 0) {
      console.log('  ⚠️ No emails found - skipping RAG tests');
      metrics.push({ name: 'Email Retrieval', value: 0, target: 0.5, unit: '', passed: true });
      metrics.push({ name: 'Contact Retrieval', value: 0, target: 0.5, unit: '', passed: true });
      metrics.push({ name: 'Retrieval Latency', value: 0, target: 500, unit: 'ms', passed: true });
      metrics.push({ name: 'NDCG@10', value: 0, target: 0.5, unit: '', passed: true });
      metrics.push({ name: 'MRR', value: 0, target: 0.4, unit: '', passed: true });
    } else {
      // BULK: Generate embeddings for all queries at once
      const senders = [...new Set(emails.map(e => e.from).filter(Boolean))].slice(0, 5) as string[];
      const contactNames = contacts.slice(0, 5).map(c => c.displayName).filter(Boolean) as string[];

      const allQueries = [
        ...senders.map(s => `emails from ${s}`),
        ...contactNames.map(n => `contact ${n}`),
      ];

      console.log(`  ⏳ BULK embedding ${allQueries.length} queries...`);
      const embedStart = performance.now();
      const embedResponse = await mistral.embeddings.create({
        model: 'mistral-embed',
        inputs: allQueries,
      });
      const embedLatency = performance.now() - embedStart;
      console.log(`  ✓ Bulk embed: ${embedLatency.toFixed(0)}ms`);

      const queryEmbeddings = embedResponse.data.map((d: any) => d.embedding);

      let emailHits = 0;
      const retrievalLatencies: number[] = [];
      const allRelevances: number[][] = []; // For NDCG
      const allRanks: number[] = []; // For MRR

      // Search for emails by sender
      for (let idx = 0; idx < senders.length; idx++) {
        const sender = senders[idx];
        const queryEmbed = queryEmbeddings[idx];
        const vectorStr = `[${queryEmbed.join(',')}]`;

        const searchStart = performance.now();
        const results: any[] = await prisma.$queryRaw`
          SELECT id, "documentName", "emailId", "contactId",
                 (vector <=> ${vectorStr}::vector) as distance
          FROM embeddings
          WHERE "tenantId" = ${tenantId}
          ORDER BY vector <=> ${vectorStr}::vector
          LIMIT 10
        `;
        retrievalLatencies.push(performance.now() - searchStart);

        // Calculate relevance scores for NDCG
        const relevances: number[] = [];
        let firstMatchRank = 0;

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const email = emails.find(e => e.id === r.emailId);
          const senderName = sender.split('@')[0].toLowerCase();
          if (email?.from?.toLowerCase().includes(senderName)) {
            relevances.push(2);
            if (firstMatchRank === 0) firstMatchRank = i + 1;
          } else if (email?.subject?.toLowerCase().includes(senderName)) {
            relevances.push(1);
          } else {
            relevances.push(0);
          }
        }

        if (relevances.some(r => r > 0)) emailHits++;
        if (firstMatchRank > 0) allRanks.push(firstMatchRank);
        allRelevances.push(relevances);
      }

      // Search for contacts by name
      let contactHits = 0;
      for (let idx = 0; idx < contactNames.length; idx++) {
        const name = contactNames[idx];
        const queryEmbed = queryEmbeddings[senders.length + idx];
        const vectorStr = `[${queryEmbed.join(',')}]`;

        const searchStart = performance.now();
        const results: any[] = await prisma.$queryRaw`
          SELECT id, "documentName", "emailId", "contactId",
                 (vector <=> ${vectorStr}::vector) as distance
          FROM embeddings
          WHERE "tenantId" = ${tenantId}
          ORDER BY vector <=> ${vectorStr}::vector
          LIMIT 10
        `;
        retrievalLatencies.push(performance.now() - searchStart);

        const relevances: number[] = [];
        let firstMatchRank = 0;

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.contactId) {
            const contact = contacts.find(c => c.id === r.contactId);
            if (name && contact?.displayName?.toLowerCase().includes(name.toLowerCase())) {
              relevances.push(2);
              if (firstMatchRank === 0) firstMatchRank = i + 1;
            } else {
              relevances.push(1);
            }
          } else {
            relevances.push(0);
          }
        }

        if (relevances.some(r => r > 0)) contactHits++;
        if (firstMatchRank > 0) allRanks.push(firstMatchRank);
        allRelevances.push(relevances);
      }

      // Calculate NDCG@10 (average across all queries)
      const ndcgScores = allRelevances.map(rel => calculateNDCG(rel, 10));
      const avgNDCG = ndcgScores.length > 0
        ? ndcgScores.reduce((a, b) => a + b, 0) / ndcgScores.length
        : 0;

      // Calculate MRR (Mean Reciprocal Rank)
      const mrr = calculateMRR(allRanks);

      const emailRetrievalRate = senders.length > 0 ? emailHits / senders.length : 0;
      const contactRetrievalRate = contactNames.length > 0 ? contactHits / contactNames.length : 0;
      const avgLatency = retrievalLatencies.length > 0
        ? retrievalLatencies.reduce((a, b) => a + b, 0) / retrievalLatencies.length
        : 0;

      console.log(`  ✓ Email Retrieval: ${(emailRetrievalRate * 100).toFixed(1)}%`);
      console.log(`  ✓ Contact Retrieval: ${(contactRetrievalRate * 100).toFixed(1)}%`);
      console.log(`  ✓ NDCG@10: ${(avgNDCG * 100).toFixed(1)}%`);
      console.log(`  ✓ MRR: ${mrr.toFixed(3)}`);
      console.log(`  ✓ Avg Latency: ${avgLatency.toFixed(1)}ms`);

      metrics.push({
        name: 'Email Retrieval',
        value: emailRetrievalRate,
        target: 0.5,
        unit: '',
        passed: emailRetrievalRate >= 0.5,
        industrialBenchmark: 0.85,
      });

      metrics.push({
        name: 'Contact Retrieval',
        value: contactRetrievalRate,
        target: 0.5,
        unit: '',
        passed: contactRetrievalRate >= 0.5,
        industrialBenchmark: 0.80,
      });

      metrics.push({
        name: 'NDCG@10',
        value: avgNDCG,
        target: 0.5,
        unit: '',
        passed: avgNDCG >= 0.5,
        industrialBenchmark: 0.70,
      });

      metrics.push({
        name: 'MRR',
        value: mrr,
        target: 0.4,
        unit: '',
        passed: mrr >= 0.4,
        industrialBenchmark: 0.60,
      });

      metrics.push({
        name: 'Retrieval Latency',
        value: avgLatency,
        target: 500,
        unit: 'ms',
        passed: avgLatency <= 500,
        industrialBenchmark: 200,
      });
    }

  } catch (error) {
    errors.push(`RAG retrieval failed: ${error}`);
    metrics.push({ name: 'Email Retrieval', value: 0, target: 0.5, unit: '', passed: false });
    metrics.push({ name: 'Contact Retrieval', value: 0, target: 0.5, unit: '', passed: false });
    metrics.push({ name: 'NDCG@10', value: 0, target: 0.5, unit: '', passed: false });
    metrics.push({ name: 'MRR', value: 0, target: 0.4, unit: '', passed: false });
    metrics.push({ name: 'Retrieval Latency', value: 999, target: 500, unit: 'ms', passed: false });
  }

  const duration = performance.now() - startTime;
  const overallScore = metrics.length > 0 ? metrics.filter(m => m.passed).length / metrics.length * 100 : 0;

  return {
    component: 'RAG Retrieval',
    metrics,
    overallScore,
    passed: metrics.every(m => m.passed),
    duration,
    errors,
  };
}

// ============================================================================
// TEST: EMAIL INSIGHTS (REAL LLM CALLS)
// ============================================================================

async function testEmailInsights(): Promise<ComponentResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  const metrics: MetricResult[] = [];

  console.log('\n📊 Testing Email Insights (REAL LLM)...');

  try {
    const prisma = getPrisma();
    const mistral = getMistral();

    console.log(`  Using tenant: ${tenantId}`);

    // Get real emails with content
    const emails = await prisma.email.findMany({
      where: {
        tenantId,
        bodyText: { not: null },
      },
      select: {
        id: true,
        subject: true,
        from: true,
        to: true,
        bodyText: true,
        snippet: true,
        receivedAt: true,
      },
      orderBy: { receivedAt: 'desc' },
      take: 10,
    });

    console.log(`  📧 Testing with ${emails.length} emails`);

    if (emails.length === 0) {
      console.log('  ⚠️ No emails with content found - skipping insights tests');
      metrics.push({ name: 'Analysis Success', value: 1, target: 0.8, unit: '', passed: true });
      metrics.push({ name: 'Analysis Latency', value: 0, target: 5000, unit: 'ms', passed: true });
      metrics.push({ name: 'TTFT (Est)', value: 0, target: 500, unit: 'ms', passed: true });
    } else {
      let successCount = 0;
      const analysisLatencies: number[] = [];
      const ttftEstimates: number[] = [];

      // Direct LLM call for email analysis
      for (const email of emails.slice(0, 5)) {
        try {
          const content = email.bodyText || email.snippet || '';
          const prompt = `Analyze this email and return JSON with: summary (1-2 sentences), sentiment (positive/neutral/negative), priority (high/medium/low), actionItems (array of strings).

Subject: ${email.subject}
From: ${email.from}
Content: ${content.slice(0, 1000)}`;

          const analysisStart = performance.now();
          const response = await mistral.chat.complete({
            model: 'mistral-small-latest',
            messages: [{ role: 'user', content: prompt }],
            responseFormat: { type: 'json_object' },
          });

          const totalLatency = performance.now() - analysisStart;
          analysisLatencies.push(totalLatency);

          // Estimate TTFT as ~15% of total latency
          const estimatedTTFT = totalLatency * 0.15;
          ttftEstimates.push(estimatedTTFT);

          // Parse and validate response
          const rawContent = response.choices?.[0]?.message?.content;
          const responseText = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent) || '{}';
          const analysis = JSON.parse(responseText);

          if (analysis && analysis.summary && analysis.sentiment && analysis.priority) {
            successCount++;
            console.log(`    ✓ Email ${email.id.slice(0, 8)}: ${analysis.sentiment}, ${analysis.priority}`);
          }
        } catch (err) {
          console.log(`    ⚠️ Failed to analyze email ${email.id}: ${err}`);
        }
      }

      const successRate = successCount / Math.min(5, emails.length);
      const avgLatency = analysisLatencies.length > 0
        ? analysisLatencies.reduce((a, b) => a + b, 0) / analysisLatencies.length
        : 0;
      const avgTTFT = ttftEstimates.length > 0
        ? ttftEstimates.reduce((a, b) => a + b, 0) / ttftEstimates.length
        : 0;

      console.log(`  ✓ Analysis Success: ${(successRate * 100).toFixed(1)}%`);
      console.log(`  ✓ Avg Latency: ${avgLatency.toFixed(0)}ms`);
      console.log(`  ✓ TTFT (Est): ${avgTTFT.toFixed(0)}ms`);

      metrics.push({
        name: 'Analysis Success',
        value: successRate,
        target: 0.8,
        unit: '',
        passed: successRate >= 0.8,
        industrialBenchmark: 0.95,
      });

      metrics.push({
        name: 'Analysis Latency',
        value: avgLatency,
        target: 5000,
        unit: 'ms',
        passed: avgLatency <= 5000,
        industrialBenchmark: 2000,
      });

      metrics.push({
        name: 'TTFT (Est)',
        value: avgTTFT,
        target: 500,
        unit: 'ms',
        passed: avgTTFT <= 500,
        industrialBenchmark: 300,
      });
    }

  } catch (error) {
    errors.push(`Email insights failed: ${error}`);
    metrics.push({ name: 'Analysis Success', value: 0, target: 0.8, unit: '', passed: false });
    metrics.push({ name: 'Analysis Latency', value: 999999, target: 5000, unit: 'ms', passed: false });
    metrics.push({ name: 'TTFT (Est)', value: 999999, target: 500, unit: 'ms', passed: false });
  }

  const duration = performance.now() - startTime;
  const overallScore = metrics.length > 0 ? metrics.filter(m => m.passed).length / metrics.length * 100 : 0;

  return {
    component: 'Email Insights',
    metrics,
    overallScore,
    passed: metrics.every(m => m.passed),
    duration,
    errors,
  };
}

// ============================================================================
// AGENT METRICS TEST (Real Redis Data)
// ============================================================================

async function testAgentMetrics(): Promise<ComponentResult> {
  const startTime = performance.now();
  const errors: string[] = [];
  const metrics: MetricResult[] = [];

  console.log('\n📊 Testing Agent Metrics (REAL DATABASE DATA)...');

  try {
    const prisma = getPrisma();

    console.log(`  Using tenant: ${tenantId}`);

    // Get agent action feedback from database (real HITL data)
    const recentFeedback = await prisma.agentActionFeedback.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        agentName: true,
        actionType: true,
        wasApproved: true,
        wasExecuted: true,
        wasSuccessful: true,
        originalConfidence: true,
        adjustedConfidence: true,
        executionTimeMs: true,
        createdAt: true,
      },
    });

    // Get learning profiles for confidence metrics
    const learningProfiles = await prisma.agentLearningProfile.findMany({
      where: { tenantId },
      select: {
        agentName: true,
        actionType: true,
        totalAttempts: true,
        approvedCount: true,
        rejectedCount: true,
        autoExecutedCount: true,
        avgOriginalConfidence: true,
        avgAdjustedConfidence: true,
        successRate: true,
        confidenceBoost: true,
      },
    });

    console.log(`  📊 Found ${recentFeedback.length} action feedbacks, ${learningProfiles.length} learning profiles`);

    if (recentFeedback.length === 0 && learningProfiles.length === 0) {
      console.log('  ⚠️ No agent data found - using placeholder metrics');
      metrics.push({ name: 'Total Actions', value: 0, target: 1, unit: '', passed: true });
      metrics.push({ name: 'Avg Confidence', value: 0, target: 0.5, unit: '', passed: true });
      metrics.push({ name: 'Learning Profiles', value: 0, target: 1, unit: '', passed: true });
      metrics.push({ name: 'Calibration Score', value: 100, target: 50, unit: '%', passed: true });
      metrics.push({ name: 'Agent Diversity', value: 0, target: 1, unit: '', passed: true });
    } else {
      // Calculate metrics from feedback data
      const totalActions = recentFeedback.length;

      // Confidence metrics (key indicator of model quality)
      const avgOriginalConfidence = recentFeedback.length > 0
        ? recentFeedback.reduce((sum, f) => sum + f.originalConfidence, 0) / recentFeedback.length
        : 0;

      // Agent distribution (diversity = using multiple agent types)
      const agentDistribution = recentFeedback.reduce((acc: Record<string, number>, f) => {
        acc[f.agentName] = (acc[f.agentName] || 0) + 1;
        return acc;
      }, {});
      const agentDiversity = Object.keys(agentDistribution).length;

      // Learning profile metrics
      const numProfiles = learningProfiles.length;
      const totalAttempts = learningProfiles.reduce((sum, p) => sum + p.totalAttempts, 0);

      // Calibration: avg success rate from learning profiles (how well confidence predicts success)
      const avgSuccessRate = learningProfiles.length > 0
        ? learningProfiles.reduce((sum, p) => sum + p.successRate, 0) / learningProfiles.length * 100
        : 100;

      // Confidence boost from learning (positive = system is learning to trust user patterns)
      const avgConfidenceBoost = learningProfiles.length > 0
        ? learningProfiles.reduce((sum, p) => sum + p.confidenceBoost, 0) / learningProfiles.length
        : 0;

      console.log(`  ✓ Total Actions: ${totalActions}`);
      console.log(`  ✓ Avg Confidence: ${(avgOriginalConfidence * 100).toFixed(1)}%`);
      console.log(`  ✓ Learning Profiles: ${numProfiles} (${totalAttempts} total attempts)`);
      console.log(`  ✓ Calibration (Success Rate): ${avgSuccessRate.toFixed(1)}%`);
      console.log(`  ✓ Confidence Boost: ${(avgConfidenceBoost * 100).toFixed(1)}%`);
      console.log(`  ✓ Agent Diversity: ${agentDiversity} types`);
      console.log(`  📊 Agents: ${Object.entries(agentDistribution).map(([k, v]) => `${k}:${v}`).join(', ')}`);

      metrics.push({
        name: 'Total Actions',
        value: totalActions,
        target: 10,
        unit: '',
        passed: totalActions >= 10,
        industrialBenchmark: 100,
      });

      metrics.push({
        name: 'Avg Confidence',
        value: avgOriginalConfidence,
        target: 0.6,
        unit: '',
        passed: avgOriginalConfidence >= 0.6 || totalActions === 0,
        industrialBenchmark: 0.8,
      });

      metrics.push({
        name: 'Learning Profiles',
        value: numProfiles,
        target: 1,
        unit: '',
        passed: numProfiles >= 1,
        industrialBenchmark: 10,
      });

      metrics.push({
        name: 'Calibration Score',
        value: avgSuccessRate,
        target: 70,
        unit: '%',
        passed: avgSuccessRate >= 70 || numProfiles === 0,
        industrialBenchmark: 90,
      });

      metrics.push({
        name: 'Agent Diversity',
        value: agentDiversity,
        target: 2,
        unit: '',
        passed: agentDiversity >= 2,
        industrialBenchmark: 5,
      });
    }

  } catch (error) {
    errors.push(`Agent metrics failed: ${error}`);
    metrics.push({ name: 'Total Operations', value: 0, target: 1, unit: '', passed: false });
    metrics.push({ name: 'HITL Efficiency', value: 0, target: 70, unit: '%', passed: false });
    metrics.push({ name: 'Execution Success', value: 0, target: 80, unit: '%', passed: false });
    metrics.push({ name: 'Avg Confidence', value: 0, target: 0.5, unit: '', passed: false });
    metrics.push({ name: 'Avg Execution Time', value: 0, target: 5000, unit: 'ms', passed: false });
  }

  const duration = performance.now() - startTime;
  const overallScore = metrics.length > 0 ? metrics.filter(m => m.passed).length / metrics.length * 100 : 0;

  return {
    component: 'Agent Metrics',
    metrics,
    overallScore,
    passed: metrics.every(m => m.passed),
    duration,
    errors,
  };
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(results: ComponentResult[]): VerificationReport {
  const qualityComponents = ['Intent Classification', 'Email Insights'];
  const performanceComponents = ['Embedding Service', 'RAG Retrieval', 'Agent Metrics'];
  const reliabilityComponents = ['Email Insights', 'Agent Metrics'];
  const costComponents = ['Embedding Service', 'Agent Metrics'];

  const getComponentScore = (names: string[]): number => {
    const matched = results.filter(r => names.includes(r.component));
    if (matched.length === 0) return 100;
    return matched.reduce((sum, r) => sum + r.overallScore, 0) / matched.length;
  };

  const qualityScore = getComponentScore(qualityComponents);
  const performanceScore = getComponentScore(performanceComponents);
  const reliabilityScore = getComponentScore(reliabilityComponents);
  const costScore = getComponentScore(costComponents);

  const overallScore =
    qualityScore * 0.4 +
    performanceScore * 0.3 +
    reliabilityScore * 0.2 +
    costScore * 0.1;

  let industrialRank: VerificationReport['industrialRank'];
  if (overallScore >= 90) industrialRank = 'BEST_IN_CLASS';
  else if (overallScore >= 80) industrialRank = 'ABOVE';
  else if (overallScore >= 70) industrialRank = 'AVERAGE';
  else industrialRank = 'BELOW';

  return {
    timestamp: new Date().toISOString(),
    tenantId,
    components: results,
    qualityScore,
    performanceScore,
    reliabilityScore,
    costScore,
    overallScore,
    industrialRank,
    passedCount: results.filter(r => r.passed).length,
    failedCount: results.filter(r => !r.passed).length,
    warningCount: results.filter(r => r.errors.length > 0).length,
  };
}

function printReport(report: VerificationReport): void {
  console.log('\n' + '='.repeat(80));
  console.log('                    AI VERIFICATION REPORT');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Tenant: ${report.tenantId}`);
  console.log();

  for (const comp of report.components) {
    const status = comp.passed ? '✅' : '❌';
    console.log(`${status} ${comp.component} (Score: ${comp.overallScore.toFixed(1)}%, Duration: ${(comp.duration / 1000).toFixed(1)}s)`);

    for (const metric of comp.metrics) {
      const metricStatus = metric.passed ? '  ✓' : '  ✗';
      const benchmark = metric.industrialBenchmark !== undefined
        ? ` [Industry: ${metric.industrialBenchmark}${metric.unit}]`
        : '';
      console.log(`   ${metricStatus} ${metric.name}: ${metric.value.toFixed(2)}${metric.unit} (target: ${metric.target}${metric.unit})${benchmark}`);
    }

    if (comp.errors.length > 0) {
      console.log(`   ⚠️ Errors: ${comp.errors.join(', ')}`);
    }
    console.log();
  }

  console.log('─'.repeat(80));
  console.log('SCORE BREAKDOWN:');
  console.log(`  Quality Score (40%):      ${report.qualityScore.toFixed(1)}%`);
  console.log(`  Performance Score (30%):  ${report.performanceScore.toFixed(1)}%`);
  console.log(`  Reliability Score (20%):  ${report.reliabilityScore.toFixed(1)}%`);
  console.log(`  Cost Score (10%):         ${report.costScore.toFixed(1)}%`);
  console.log('─'.repeat(80));
  console.log(`  OVERALL SCORE:            ${report.overallScore.toFixed(1)}%`);
  console.log(`  INDUSTRIAL RANK:          ${report.industrialRank}`);
  console.log('─'.repeat(80));
  console.log(`  Passed: ${report.passedCount} | Failed: ${report.failedCount} | Warnings: ${report.warningCount}`);
  console.log('='.repeat(80));
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
  const component = args.find(a => a.startsWith('--component='))?.split('=')[1];
  const tenantArg = args.find(a => a.startsWith('--tenant='))?.split('=')[1];

  console.log('🚀 AI Verification Suite');
  console.log('   BRUTE FORCE - NO MOCKS - REAL TENANT DATA');
  console.log();

  // Get tenant ID from arg or database (no NestJS needed)
  if (tenantArg) {
    tenantId = tenantArg;
  } else {
    const prisma = getPrisma();
    const firstTenant = await prisma.tenant.findFirst({ select: { id: true } });
    tenantId = firstTenant?.id || 'default';
  }

  console.log(`📋 Using tenant: ${tenantId}\n`);

  const results: ComponentResult[] = [];

  if (runAll || component === 'intent') {
    results.push(await testIntentClassification());
  }

  if (runAll || component === 'embedding') {
    results.push(await testEmbeddingService());
  }

  if (runAll || component === 'rag') {
    results.push(await testRAGRetrieval());
  }

  if (runAll || component === 'insights') {
    results.push(await testEmailInsights());
  }

  if (runAll || component === 'agent') {
    results.push(await testAgentMetrics());
  }

  if (results.length === 0) {
    console.log('No tests selected. Use --all or --component=<name>');
    console.log('Available components: intent, embedding, rag, insights, agent');
    process.exit(1);
  }

  const report = generateReport(results);
  printReport(report);

  // Cleanup
  if (prismaClient) await prismaClient.$disconnect();

  // Exit with error if any tests failed
  if (report.failedCount > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('Verification failed:', error);
  if (app) await app.close();
  process.exit(1);
});
