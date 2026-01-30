#!/usr/bin/env ts-node
/**
 * Intent Classification Model Trainer
 *
 * Trains a FastText model on the generated intent dataset.
 * FastText is chosen for:
 * - Sub-word embeddings (handles typos/misspellings well)
 * - Very fast inference (~1ms per classification)
 * - Small model size (~10-50MB)
 * - Works well with limited training data
 *
 * Prerequisites:
 *   npm install fasttext.js
 *
 * Usage:
 *   npx ts-node backend/scripts/train-intent-model.ts
 *   npx ts-node backend/scripts/train-intent-model.ts --epochs 50 --lr 0.5
 */

import * as fs from 'fs';
import * as path from 'path';

interface TrainingOptions {
  trainFile: string;
  testFile: string;
  outputModel: string;
  epochs: number;
  learningRate: number;
  wordNgrams: number;
  minCount: number;
  dim: number;
  bucket: number;
  loss: 'softmax' | 'hs' | 'ova';
}

async function trainModel(options: TrainingOptions): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { Classifier } = require('fasttext') as typeof import('fasttext');

  console.log('\n=== Intent Model Training ===\n');
  console.log('Configuration:');
  console.log(`  Train file: ${options.trainFile}`);
  console.log(`  Test file: ${options.testFile}`);
  console.log(`  Output: ${options.outputModel}`);
  console.log(`  Epochs: ${options.epochs}`);
  console.log(`  Learning rate: ${options.learningRate}`);
  console.log(`  Word n-grams: ${options.wordNgrams}`);
  console.log(`  Dimension: ${options.dim}`);
  console.log(`  Loss: ${options.loss}`);

  // Verify input files exist
  if (!fs.existsSync(options.trainFile)) {
    throw new Error(`Training file not found: ${options.trainFile}. Run generate-intent-dataset.ts first.`);
  }
  if (!fs.existsSync(options.testFile)) {
    throw new Error(`Test file not found: ${options.testFile}. Run generate-intent-dataset.ts first.`);
  }

  // Ensure output directory exists
  const outDir = path.dirname(options.outputModel);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('\nTraining...');
  const startTime = Date.now();

  const classifier = new Classifier();

  // Train the model
  await classifier.train('supervised', {
    input: options.trainFile,
    output: options.outputModel,
    epoch: options.epochs,
    lr: options.learningRate,
    wordNgrams: options.wordNgrams,
    minCount: options.minCount,
    dim: options.dim,
    bucket: options.bucket,
    loss: options.loss,
  });

  const trainTime = Date.now() - startTime;
  console.log(`Training completed in ${(trainTime / 1000).toFixed(1)}s`);

  // Load the trained model for predictions
  console.log('\nLoading model for evaluation...');
  await classifier.loadModel(`${options.outputModel}.bin`);

  // Get model file size
  const modelPath = `${options.outputModel}.bin`;
  if (fs.existsSync(modelPath)) {
    const stats = fs.statSync(modelPath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`\nModel size: ${sizeMB.toFixed(2)} MB`);
  }

  // Test some example predictions
  console.log('\n=== Example Predictions ===\n');
  const examples = [
    // English
    'show me emails from John',
    'write a new email',
    'what meetings do I have tomorrow',
    'delete this message',
    'find contact mario rossi',
    'hi there',
    'thanks for your help',
    // Italian
    'cerca email da Giovanni',
    'scrivi una nuova mail',
    'quali riunioni ho domani',
    'elimina questo messaggio',
    'trova il contatto di Mario Rossi',
    'ciao',
    'grazie mille',
    // Typos
    'shwo me emials from jhon',
    'serach emial about budget',
  ];

  for (const example of examples) {
    const predictions = await classifier.predict(example, 3);
    const top = predictions[0];
    const intent = top?.label?.replace('__label__', '') || 'unknown';
    const confidence = top?.value ? (top.value * 100).toFixed(1) : '0';
    console.log(`  "${example.slice(0, 40).padEnd(40)}" → ${intent} (${confidence}%)`);
  }

  console.log('\n=== Training Complete ===');
  console.log(`Model saved to: ${modelPath}`);
}

// Parse CLI arguments
const args = process.argv.slice(2);
const getArg = (name: string, defaultValue: string): string => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultValue;
};

const options: TrainingOptions = {
  trainFile: getArg('train', './data/intents.train.txt'),
  testFile: getArg('test', './data/intents.test.txt'),
  outputModel: getArg('output', './backend/models/intent-classifier'),
  epochs: parseInt(getArg('epochs', '25'), 10),
  learningRate: parseFloat(getArg('lr', '0.5')),
  wordNgrams: parseInt(getArg('ngrams', '2'), 10),
  minCount: parseInt(getArg('mincount', '1'), 10),
  dim: parseInt(getArg('dim', '100'), 10),
  bucket: parseInt(getArg('bucket', '200000'), 10),
  loss: getArg('loss', 'softmax') as 'softmax' | 'hs' | 'ova',
};

trainModel(options).catch((error) => {
  console.error('Training failed:', error);
  process.exit(1);
});
