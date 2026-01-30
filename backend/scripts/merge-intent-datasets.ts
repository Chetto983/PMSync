#!/usr/bin/env ts-node
/**
 * Merge Intent Datasets
 *
 * Combines our synthetic dataset with external datasets (Kaggle) and
 * adds augmented greeting/farewell examples to fix classification issues.
 *
 * Usage:
 *   npx ts-node backend/scripts/merge-intent-datasets.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Additional Italian greetings to fix the "ciao" misclassification
const ITALIAN_GREETINGS = [
  // Basic greetings
  'ciao', 'ciao!', 'ciao ciao', 'ciaoooo',
  'salve', 'salve!',
  'buongiorno', 'buongiorno!', 'buon giorno',
  'buonasera', 'buonasera!', 'buona sera',
  'buonanotte', 'buonanotte!', 'buona notte',
  'hey', 'hey!', 'ehi', 'ehi!',
  'ehilà', 'ue', 'uè',
  // With punctuation variations
  'ciao?', 'ciao.', 'ciao...',
  'salve?', 'buongiorno?',
  // Informal
  'bella', 'bella!', 'bella lì',
  'we', 'we!', 'wè',
  // Regional
  'oi', 'ohi', 'ahò',
  // Questions after greeting
  'ciao come stai', 'ciao come va', 'ciao tutto bene',
  'salve come sta', 'buongiorno come va',
  'ciao che si dice', 'ciao come butta',
  // With names
  'ciao marco', 'ciao maria', 'ciao a tutti',
  'buongiorno dottore', 'buonasera signora',
];

const ENGLISH_GREETINGS = [
  // Basic
  'hi', 'hi!', 'hello', 'hello!', 'hey', 'hey!',
  'hiya', 'heya', 'yo', 'yo!',
  'hallo', 'hullo',
  // Time-based
  'good morning', 'good morning!', 'morning', 'morning!',
  'good afternoon', 'good afternoon!', 'afternoon',
  'good evening', 'good evening!', 'evening',
  'good day', 'g\'day',
  // With questions
  'hello how are you', 'hi how are you', 'hey how\'s it going',
  'hi there', 'hello there', 'hey there',
  'what\'s up', 'whats up', 'sup', 'wassup',
  'how are you', 'how are you doing', 'how\'s it going',
  // Informal
  'howdy', 'greetings', 'salutations',
  // With names
  'hi john', 'hello mary', 'hey boss',
];

const ITALIAN_FAREWELLS = [
  'arrivederci', 'arrivederci!',
  'ciao ciao', 'ciao!',
  'addio', 'addio!',
  'a presto', 'a presto!',
  'a dopo', 'a dopo!',
  'ci vediamo', 'ci vediamo!', 'ci vediamo dopo',
  'alla prossima', 'alla prossima!',
  'buona giornata', 'buona giornata!',
  'buona serata', 'buona serata!',
  'stammi bene', 'stai bene',
  'a domani', 'a lunedì',
];

const ENGLISH_FAREWELLS = [
  'bye', 'bye!', 'bye bye', 'byebye',
  'goodbye', 'goodbye!', 'good bye',
  'see you', 'see you!', 'see ya', 'see ya!',
  'see you later', 'see you soon', 'see you tomorrow',
  'later', 'later!', 'laters',
  'take care', 'take care!',
  'have a good day', 'have a nice day',
  'have a good one', 'have a great day',
  'talk to you later', 'ttyl',
  'catch you later', 'peace', 'peace out',
];

const ITALIAN_THANKS = [
  'grazie', 'grazie!', 'grazie mille',
  'grazie tante', 'grazie infinite',
  'ti ringrazio', 'la ringrazio',
  'molto gentile', 'sei gentilissimo',
  'grazie di tutto', 'grazie per l\'aiuto',
  'grazie per la risposta',
];

const ENGLISH_THANKS = [
  'thanks', 'thanks!', 'thank you', 'thank you!',
  'thanks a lot', 'thanks so much', 'thanks a bunch',
  'thank you very much', 'thank you so much',
  'much appreciated', 'appreciate it',
  'cheers', 'cheers!', 'ta', 'ta!',
  'thanks for your help', 'thanks for the help',
  'you\'re the best', 'awesome thanks',
];

function formatFastText(intent: string, text: string): string {
  return `__label__${intent} ${text.toLowerCase().trim()}`;
}

async function mergeDatasets(): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data');
  const trainPath = path.join(dataDir, 'intents.train.txt');
  const testPath = path.join(dataDir, 'intents.test.txt');

  // Read existing datasets
  let trainData = fs.readFileSync(trainPath, 'utf8').split('\n').filter(Boolean);
  let testData = fs.readFileSync(testPath, 'utf8').split('\n').filter(Boolean);

  console.log(`Original train size: ${trainData.length}`);
  console.log(`Original test size: ${testData.length}`);

  // Add greeting examples
  const greetingExamples: string[] = [];
  for (const g of ITALIAN_GREETINGS) {
    greetingExamples.push(formatFastText('greeting', g));
  }
  for (const g of ENGLISH_GREETINGS) {
    greetingExamples.push(formatFastText('greeting', g));
  }

  // Add farewell examples
  const farewellExamples: string[] = [];
  for (const f of ITALIAN_FAREWELLS) {
    farewellExamples.push(formatFastText('farewell', f));
  }
  for (const f of ENGLISH_FAREWELLS) {
    farewellExamples.push(formatFastText('farewell', f));
  }

  // Add thanks examples
  const thanksExamples: string[] = [];
  for (const t of ITALIAN_THANKS) {
    thanksExamples.push(formatFastText('thanks', t));
  }
  for (const t of ENGLISH_THANKS) {
    thanksExamples.push(formatFastText('thanks', t));
  }

  console.log(`\nAdding ${greetingExamples.length} greeting examples`);
  console.log(`Adding ${farewellExamples.length} farewell examples`);
  console.log(`Adding ${thanksExamples.length} thanks examples`);

  // Split 80/20 into train/test
  const splitAndAdd = (examples: string[], trainSet: string[], testSet: string[]) => {
    const shuffled = examples.sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(shuffled.length * 0.8);
    trainSet.push(...shuffled.slice(0, splitIdx));
    testSet.push(...shuffled.slice(splitIdx));
  };

  splitAndAdd(greetingExamples, trainData, testData);
  splitAndAdd(farewellExamples, trainData, testData);
  splitAndAdd(thanksExamples, trainData, testData);

  // Shuffle final datasets
  trainData = trainData.sort(() => Math.random() - 0.5);
  testData = testData.sort(() => Math.random() - 0.5);

  // Write merged datasets
  const mergedTrainPath = path.join(dataDir, 'intents-merged.train.txt');
  const mergedTestPath = path.join(dataDir, 'intents-merged.test.txt');

  fs.writeFileSync(mergedTrainPath, trainData.join('\n'), 'utf8');
  fs.writeFileSync(mergedTestPath, testData.join('\n'), 'utf8');

  console.log(`\nMerged train size: ${trainData.length}`);
  console.log(`Merged test size: ${testData.length}`);
  console.log(`\nSaved to:`);
  console.log(`  - ${mergedTrainPath}`);
  console.log(`  - ${mergedTestPath}`);

  // Show intent distribution
  const intentCounts: Record<string, number> = {};
  for (const line of trainData) {
    const match = line.match(/__label__(\w+)/);
    if (match) {
      intentCounts[match[1]] = (intentCounts[match[1]] || 0) + 1;
    }
  }

  console.log('\n=== Intent Distribution (Train) ===');
  const sorted = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]);
  for (const [intent, count] of sorted) {
    const pct = ((count / trainData.length) * 100).toFixed(1);
    console.log(`  ${intent.padEnd(20)} ${count.toString().padStart(5)} (${pct}%)`);
  }
}

mergeDatasets().catch(console.error);
