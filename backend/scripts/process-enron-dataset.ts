#!/usr/bin/env ts-node
/**
 * Enron Email Dataset Processor
 *
 * Downloads and processes the Enron email dataset for intent classification training.
 * Extracts subject lines and auto-labels them based on email patterns.
 *
 * Dataset: https://www.kaggle.com/datasets/wcukierski/enron-email-dataset
 * Contains ~500,000 real-world emails from Enron Corporation.
 *
 * Prerequisites:
 *   1. Download from Kaggle: kaggle datasets download -d wcukierski/enron-email-dataset
 *   2. Extract to ./data/enron/
 *
 * Usage:
 *   npx ts-node backend/scripts/process-enron-dataset.ts
 *   npx ts-node backend/scripts/process-enron-dataset.ts --input ./data/enron/emails.csv --output ./data/enron-intents.txt
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

interface EnronEmail {
  subject: string;
  body: string;
  from: string;
  to: string;
}

interface IntentExample {
  intent: string;
  text: string;
  source: 'enron';
}

/**
 * Intent detection patterns for auto-labeling Enron emails
 */
const INTENT_PATTERNS: Array<{ pattern: RegExp; intent: string; confidence: 'high' | 'medium' }> = [
  // Email forwarding (FW:, Fwd:)
  { pattern: /^(fw|fwd):/i, intent: 'email_forward', confidence: 'high' },

  // Email replies (RE:, Re:)
  { pattern: /^re:/i, intent: 'email_reply', confidence: 'high' },

  // Meeting/calendar related
  { pattern: /\b(meeting|conference call|call at|schedule|calendar|appointment)\b/i, intent: 'calendar_create', confidence: 'medium' },
  { pattern: /\b(reschedule|postpone|move meeting|change time)\b/i, intent: 'calendar_update', confidence: 'medium' },
  { pattern: /\b(cancel meeting|meeting cancelled)\b/i, intent: 'calendar_delete', confidence: 'medium' },

  // Action requests
  { pattern: /\b(please review|need your review|review attached|for your review)\b/i, intent: 'email_read', confidence: 'medium' },
  { pattern: /\b(please find attached|attached is|see attached|attachment)\b/i, intent: 'email_read', confidence: 'medium' },

  // Search-like subjects
  { pattern: /\b(information on|data for|report on|summary of|status of)\b/i, intent: 'email_search', confidence: 'medium' },

  // Compose-like (draft, write)
  { pattern: /\b(draft|proposal|new|introducing|announcement)\b/i, intent: 'email_compose', confidence: 'medium' },

  // Urgent/priority
  { pattern: /\b(urgent|asap|important|action required|deadline)\b/i, intent: 'status_check', confidence: 'medium' },

  // Thank you emails
  { pattern: /^(thanks|thank you|thx)/i, intent: 'thanks', confidence: 'high' },

  // Greeting emails
  { pattern: /^(hello|hi|hey|good morning|good afternoon)/i, intent: 'greeting', confidence: 'high' },
];

/**
 * Parse CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * Extract subject from raw email text
 */
function extractSubject(emailText: string): string {
  const subjectMatch = emailText.match(/^Subject:\s*(.+?)$/m);
  return subjectMatch ? subjectMatch[1].trim() : '';
}

/**
 * Extract first line of body for context
 */
function extractFirstBodyLine(emailText: string): string {
  // Find body (after headers)
  const parts = emailText.split(/\n\n/);
  if (parts.length < 2) return '';

  const body = parts.slice(1).join(' ').trim();
  // Get first meaningful line
  const lines = body.split(/\n/).filter((l) => l.trim().length > 10);
  return lines[0]?.slice(0, 100) || '';
}

/**
 * Auto-label email based on subject/content patterns
 */
function detectIntent(subject: string, bodyPreview: string): { intent: string; confidence: 'high' | 'medium' | 'low' } | null {
  const text = `${subject} ${bodyPreview}`.toLowerCase();

  for (const { pattern, intent, confidence } of INTENT_PATTERNS) {
    if (pattern.test(subject) || pattern.test(text)) {
      return { intent, confidence };
    }
  }

  return null;
}

/**
 * Clean and normalize text for training
 */
function cleanText(text: string): string {
  return text
    .replace(/^(re|fw|fwd):\s*/gi, '') // Remove RE:, FW: prefixes
    .replace(/\[.*?\]/g, '') // Remove [brackets]
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s\u00C0-\u017F.,!?-]/g, '') // Keep basic chars
    .trim()
    .slice(0, 150); // Limit length
}

/**
 * Process Enron CSV file and extract intent examples
 */
async function processEnronCSV(inputPath: string, maxExamples: number = 10000): Promise<IntentExample[]> {
  const examples: IntentExample[] = [];
  const intentCounts: Record<string, number> = {};
  const maxPerIntent = Math.floor(maxExamples / 10); // Balance across intents

  console.log(`\nProcessing Enron dataset: ${inputPath}`);

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    console.log('\nTo download the Enron dataset:');
    console.log('  1. Install Kaggle CLI: pip install kaggle');
    console.log('  2. Set up API credentials: https://www.kaggle.com/docs/api');
    console.log('  3. Download: kaggle datasets download -d wcukierski/enron-email-dataset');
    console.log('  4. Extract to ./data/enron/emails.csv');
    process.exit(1);
  }

  const fileStream = fs.createReadStream(inputPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  let processedCount = 0;
  let skippedCount = 0;
  let isHeader = true;

  for await (const line of rl) {
    lineCount++;

    // Skip header
    if (isHeader) {
      isHeader = false;
      continue;
    }

    // Parse CSV line
    const fields = parseCSVLine(line);
    if (fields.length < 2) continue;

    // Enron CSV format: file,message
    const emailText = fields[1];
    const subject = extractSubject(emailText);
    const bodyPreview = extractFirstBodyLine(emailText);

    if (!subject || subject.length < 5) {
      skippedCount++;
      continue;
    }

    // Detect intent
    const intentResult = detectIntent(subject, bodyPreview);
    if (!intentResult || intentResult.confidence === 'low') {
      skippedCount++;
      continue;
    }

    // Balance intents
    const currentCount = intentCounts[intentResult.intent] || 0;
    if (currentCount >= maxPerIntent) {
      continue;
    }

    // Clean and add example
    const cleanedText = cleanText(subject);
    if (cleanedText.length < 5) continue;

    examples.push({
      intent: intentResult.intent,
      text: cleanedText,
      source: 'enron',
    });

    intentCounts[intentResult.intent] = currentCount + 1;
    processedCount++;

    // Progress logging
    if (processedCount % 1000 === 0) {
      console.log(`  Processed ${processedCount} examples from ${lineCount} emails...`);
    }

    // Stop if we have enough
    if (processedCount >= maxExamples) {
      break;
    }
  }

  console.log(`\n=== Enron Processing Complete ===`);
  console.log(`  Total emails scanned: ${lineCount}`);
  console.log(`  Examples extracted: ${processedCount}`);
  console.log(`  Skipped (no intent): ${skippedCount}`);
  console.log(`\nIntent distribution:`);
  for (const [intent, count] of Object.entries(intentCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${intent.padEnd(20)} ${count}`);
  }

  return examples;
}

/**
 * Export to FastText format
 */
function exportFastText(examples: IntentExample[], outputPath: string): void {
  const lines = examples.map((ex) => `__label__${ex.intent} ${ex.text.toLowerCase()}`);

  // Shuffle
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`\nExported ${lines.length} examples to: ${outputPath}`);
}

// CLI
const args = process.argv.slice(2);
const inputIdx = args.indexOf('--input');
const outputIdx = args.indexOf('--output');
const maxIdx = args.indexOf('--max');

const inputPath = inputIdx >= 0 ? args[inputIdx + 1] : './data/enron/emails.csv';
const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : './data/enron-intents.txt';
const maxExamples = maxIdx >= 0 ? parseInt(args[maxIdx + 1], 10) : 10000;

// Ensure output directory exists
const outDir = path.dirname(outputPath);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

processEnronCSV(inputPath, maxExamples)
  .then((examples) => {
    if (examples.length > 0) {
      exportFastText(examples, outputPath);
    }
  })
  .catch(console.error);
