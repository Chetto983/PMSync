#!/usr/bin/env ts-node
/**
 * Synthetic Intent Dataset Generator
 *
 * Generates training data for intent classification model.
 * Produces FastText-compatible format: __label__<intent> <text>
 *
 * Features:
 * - Bilingual (EN/IT) generation
 * - Slot filling with variations
 * - Typo injection for robustness
 * - Case variations
 * - Punctuation variations
 *
 * Usage:
 *   npx ts-node backend/scripts/generate-intent-dataset.ts --output ./data/intents.txt --count 10000
 */

import * as fs from 'fs';
import * as path from 'path';
import { INTENT_TAXONOMY, SLOT_FILLERS, type SlotType, type PrimaryIntent } from '../src/modules/ai/nlp/intent-taxonomy';

interface GeneratorOptions {
  outputPath: string;
  totalExamples: number;
  trainSplit: number; // e.g., 0.8 for 80% train
  includeTypos: boolean;
  seed?: number;
}

// Simple seeded random for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * Italian-specific augmentations to handle language complexity
 */
const ITALIAN_AUGMENTATIONS = {
  // Common contractions and variations
  contractions: [
    ['l\'', 'la ', 'lo '],
    ['un\'', 'una '],
    ['dell\'', 'della ', 'dello '],
    ['nell\'', 'nella ', 'nello '],
    ['all\'', 'alla ', 'allo '],
    ['quell\'', 'quella ', 'quello '],
  ],
  // Informal variations
  informal: [
    ['per favore', 'pf', 'pfv', 'x favore'],
    ['perché', 'xké', 'perchè', 'xche'],
    ['che cosa', 'cosa', 'ke cosa'],
    ['qualcosa', 'qlcs', 'qualcosa'],
  ],
  // Regional variations (common across Italy)
  regional: [
    ['email', 'mail', 'posta elettronica', 'e-mail'],
    ['messaggio', 'msg', 'mess'],
    ['calendario', 'agenda'],
  ],
  // Common typos in Italian
  typos: [
    ['perché', 'perche', 'perchè'],
    ['così', 'cosi', 'cosí'],
    ['più', 'piu', 'piú'],
    ['già', 'gia', 'già'],
    ['può', 'puo', 'puó'],
    ['è', 'e\'', 'é'],
  ],
};

/**
 * English-specific augmentations
 */
const ENGLISH_AUGMENTATIONS = {
  contractions: [
    ['I\'m', 'Im', 'i\'m'],
    ['don\'t', 'dont', 'do not'],
    ['can\'t', 'cant', 'cannot'],
    ['won\'t', 'wont', 'will not'],
    ['what\'s', 'whats', 'what is'],
    ['I\'ll', 'Ill', 'I will'],
  ],
  informal: [
    ['please', 'pls', 'plz'],
    ['thanks', 'thx', 'ty'],
    ['because', 'cuz', 'bc'],
    ['you', 'u'],
    ['your', 'ur'],
  ],
  typos: [
    ['email', 'emial', 'e-mail', 'Email'],
    ['calendar', 'calender', 'calander'],
    ['meeting', 'meating', 'meting'],
    ['schedule', 'shedule', 'schedul'],
  ],
};

/**
 * Fill slots in a template with random values
 */
function fillSlots(template: string, lang: 'en' | 'it', rng: SeededRandom): string {
  let result = template;
  const slotRegex = /\{(\w+)\}/g;
  let match;

  while ((match = slotRegex.exec(template)) !== null) {
    const slotName = match[1] as SlotType;
    if (SLOT_FILLERS[slotName]) {
      const fillers = SLOT_FILLERS[slotName][lang];
      const filler = rng.pick(fillers);
      result = result.replace(match[0], filler);
    }
  }

  return result;
}

/**
 * Apply random augmentations to text
 */
function augment(text: string, lang: 'en' | 'it', rng: SeededRandom, includeTypos: boolean): string {
  let result = text;
  const augmentations = lang === 'it' ? ITALIAN_AUGMENTATIONS : ENGLISH_AUGMENTATIONS;

  // Random case variation (20% chance)
  if (rng.next() < 0.2) {
    if (rng.next() < 0.5) {
      result = result.toLowerCase();
    } else {
      result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase();
    }
  }

  // Random punctuation variation (15% chance)
  if (rng.next() < 0.15) {
    if (rng.next() < 0.3) {
      result = result + '?';
    } else if (rng.next() < 0.5) {
      result = result + '!';
    } else {
      result = result + '.';
    }
  }

  // Random contraction variation (10% chance)
  if (rng.next() < 0.1) {
    for (const group of augmentations.contractions) {
      const original = group[0];
      if (result.includes(original)) {
        const replacement = rng.pick(group.slice(1));
        result = result.replace(original, replacement);
        break;
      }
    }
  }

  // Random informal variation (10% chance)
  if (rng.next() < 0.1) {
    for (const group of augmentations.informal) {
      const original = group[0];
      if (result.toLowerCase().includes(original.toLowerCase())) {
        const replacement = rng.pick(group.slice(1));
        result = result.replace(new RegExp(original, 'i'), replacement);
        break;
      }
    }
  }

  // Random typo injection (5% chance, if enabled)
  if (includeTypos && rng.next() < 0.05) {
    for (const group of augmentations.typos) {
      const original = group[0];
      if (result.toLowerCase().includes(original.toLowerCase())) {
        const typo = rng.pick(group.slice(1));
        result = result.replace(new RegExp(original, 'i'), typo);
        break;
      }
    }
  }

  return result;
}

/**
 * Generate additional paraphrases using simple transformations
 */
function generateParaphrases(text: string, lang: 'en' | 'it', rng: SeededRandom): string[] {
  const paraphrases: string[] = [text];

  // Add polite versions
  if (lang === 'en') {
    if (rng.next() < 0.3) paraphrases.push('please ' + text);
    if (rng.next() < 0.3) paraphrases.push('can you ' + text);
    if (rng.next() < 0.3) paraphrases.push('could you ' + text);
    if (rng.next() < 0.3) paraphrases.push('I want to ' + text);
    if (rng.next() < 0.3) paraphrases.push('I need to ' + text);
  } else {
    if (rng.next() < 0.3) paraphrases.push('per favore ' + text);
    if (rng.next() < 0.3) paraphrases.push('puoi ' + text);
    if (rng.next() < 0.3) paraphrases.push('potresti ' + text);
    if (rng.next() < 0.3) paraphrases.push('vorrei ' + text);
    if (rng.next() < 0.3) paraphrases.push('devo ' + text);
  }

  return paraphrases;
}

/**
 * Generate the dataset
 */
function generateDataset(options: GeneratorOptions): void {
  const rng = new SeededRandom(options.seed || 42);
  const examples: Array<{ intent: PrimaryIntent; text: string }> = [];

  // Calculate examples per intent (weighted by priority)
  const priorityWeights = { high: 3, medium: 2, low: 1 };
  const totalWeight = INTENT_TAXONOMY.reduce((sum, def) => sum + priorityWeights[def.priority], 0);

  for (const intentDef of INTENT_TAXONOMY) {
    const weight = priorityWeights[intentDef.priority];
    const targetCount = Math.floor((weight / totalWeight) * options.totalExamples);

    // Generate from templates
    for (let i = 0; i < targetCount; i++) {
      // Alternate between languages (50/50 split)
      const lang: 'en' | 'it' = rng.next() < 0.5 ? 'en' : 'it';
      const templates = intentDef.examples[lang];

      if (templates.length === 0) continue;

      // Pick a template and fill slots
      const template = rng.pick(templates);
      let text = fillSlots(template, lang, rng);

      // Generate paraphrases
      const paraphrases = generateParaphrases(text, lang, rng);
      text = rng.pick(paraphrases);

      // Apply augmentations
      text = augment(text, lang, rng, options.includeTypos);

      examples.push({ intent: intentDef.intent, text });
    }
  }

  // Shuffle examples
  const shuffled = rng.shuffle(examples);

  // Split into train/test
  const splitIdx = Math.floor(shuffled.length * options.trainSplit);
  const trainExamples = shuffled.slice(0, splitIdx);
  const testExamples = shuffled.slice(splitIdx);

  // Format for FastText: __label__<intent> <text>
  const formatExample = (ex: { intent: string; text: string }) =>
    `__label__${ex.intent} ${ex.text.replace(/\n/g, ' ').trim()}`;

  const trainData = trainExamples.map(formatExample).join('\n');
  const testData = testExamples.map(formatExample).join('\n');

  // Write files
  const basePath = options.outputPath.replace(/\.\w+$/, '');
  fs.writeFileSync(`${basePath}.train.txt`, trainData, 'utf8');
  fs.writeFileSync(`${basePath}.test.txt`, testData, 'utf8');

  // Also write JSON for other uses
  fs.writeFileSync(`${basePath}.train.json`, JSON.stringify(trainExamples, null, 2), 'utf8');
  fs.writeFileSync(`${basePath}.test.json`, JSON.stringify(testExamples, null, 2), 'utf8');

  // Print stats
  console.log('\n=== Dataset Generation Complete ===\n');
  console.log(`Total examples: ${shuffled.length}`);
  console.log(`Train examples: ${trainExamples.length}`);
  console.log(`Test examples: ${testExamples.length}`);
  console.log(`\nFiles created:`);
  console.log(`  - ${basePath}.train.txt (FastText format)`);
  console.log(`  - ${basePath}.test.txt (FastText format)`);
  console.log(`  - ${basePath}.train.json`);
  console.log(`  - ${basePath}.test.json`);

  // Print intent distribution
  console.log('\n=== Intent Distribution (Train) ===\n');
  const intentCounts: Record<string, number> = {};
  for (const ex of trainExamples) {
    intentCounts[ex.intent] = (intentCounts[ex.intent] || 0) + 1;
  }
  const sorted = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]);
  for (const [intent, count] of sorted) {
    const pct = ((count / trainExamples.length) * 100).toFixed(1);
    console.log(`  ${intent.padEnd(20)} ${count.toString().padStart(5)} (${pct}%)`);
  }
}

// CLI
const args = process.argv.slice(2);
const outputIdx = args.indexOf('--output');
const countIdx = args.indexOf('--count');
const seedIdx = args.indexOf('--seed');

const options: GeneratorOptions = {
  outputPath: outputIdx >= 0 ? args[outputIdx + 1] : './data/intents',
  totalExamples: countIdx >= 0 ? parseInt(args[countIdx + 1], 10) : 10000,
  trainSplit: 0.8,
  includeTypos: true,
  seed: seedIdx >= 0 ? parseInt(args[seedIdx + 1], 10) : 42,
};

// Ensure output directory exists
const outDir = path.dirname(options.outputPath);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating intent classification dataset...');
console.log(`  Output: ${options.outputPath}`);
console.log(`  Count: ${options.totalExamples}`);
console.log(`  Train/Test split: ${options.trainSplit * 100}%/${(1 - options.trainSplit) * 100}%`);

generateDataset(options);
