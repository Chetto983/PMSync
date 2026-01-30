#!/usr/bin/env ts-node
/**
 * Intent Classifier Retraining Pipeline
 *
 * Complete pipeline to retrain the intent classification model:
 * 1. Generate augmented Italian training data
 * 2. Generate synthetic EN/IT examples
 * 3. Optionally include Enron real-world examples
 * 4. Merge all datasets
 * 5. Train FastText model
 * 6. Evaluate and report metrics
 *
 * Usage:
 *   npx ts-node backend/scripts/retrain-intent-classifier.ts
 *   npx ts-node backend/scripts/retrain-intent-classifier.ts --include-enron
 *   npx ts-node backend/scripts/retrain-intent-classifier.ts --examples 20000 --epochs 40
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface RetrainOptions {
  totalExamples: number;
  epochs: number;
  learningRate: number;
  includeEnron: boolean;
  enronPath: string;
  outputDir: string;
  modelPath: string;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function runCommand(cmd: string, description: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`▶ ${description}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`$ ${cmd}\n`);

  try {
    execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
  } catch (error) {
    console.error(`❌ Command failed: ${description}`);
    throw error;
  }
}

async function retrain(options: RetrainOptions): Promise<void> {
  const startTime = Date.now();

  console.log('\n' + '═'.repeat(60));
  console.log('   🧠 INTENT CLASSIFIER RETRAINING PIPELINE');
  console.log('═'.repeat(60));
  console.log(`\nConfiguration:`);
  console.log(`  Total examples: ${options.totalExamples}`);
  console.log(`  Epochs: ${options.epochs}`);
  console.log(`  Learning rate: ${options.learningRate}`);
  console.log(`  Include Enron: ${options.includeEnron}`);
  console.log(`  Output dir: ${options.outputDir}`);
  console.log(`  Model path: ${options.modelPath}`);

  // Ensure directories exist
  ensureDir(options.outputDir);
  ensureDir(path.dirname(options.modelPath));

  // Step 1: Generate augmented synthetic dataset
  runCommand(
    `npx ts-node backend/scripts/generate-intent-dataset.ts --output ${options.outputDir}/intents --count ${options.totalExamples}`,
    'Step 1/5: Generating augmented synthetic dataset (EN + IT with paraphrases)',
  );

  // Step 2: Merge with greeting/farewell augmentations
  runCommand(
    `npx ts-node backend/scripts/merge-intent-datasets.ts`,
    'Step 2/5: Merging with additional greeting/farewell examples',
  );

  // Step 3: Optionally process Enron dataset
  if (options.includeEnron && fs.existsSync(options.enronPath)) {
    runCommand(
      `npx ts-node backend/scripts/process-enron-dataset.ts --input ${options.enronPath} --output ${options.outputDir}/enron-intents.txt --max 5000`,
      'Step 3/5: Processing Enron real-world email subjects',
    );

    // Merge Enron with existing
    console.log('\n  Merging Enron data with training set...');
    const trainPath = `${options.outputDir}/intents-merged.train.txt`;
    const enronPath = `${options.outputDir}/enron-intents.txt`;

    if (fs.existsSync(enronPath)) {
      const trainData = fs.readFileSync(trainPath, 'utf8');
      const enronData = fs.readFileSync(enronPath, 'utf8');
      const merged = trainData + '\n' + enronData;

      // Shuffle
      const lines = merged.split('\n').filter(Boolean);
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lines[i], lines[j]] = [lines[j], lines[i]];
      }

      fs.writeFileSync(trainPath, lines.join('\n'), 'utf8');
      console.log(`  ✓ Added ${enronData.split('\n').length} Enron examples to training set`);
    }
  } else {
    console.log('\n  ℹ️  Skipping Enron (not found or not requested)');
    console.log(`     To include: download from Kaggle and place at ${options.enronPath}`);
  }

  // Step 4: Train FastText model
  const trainFile = `${options.outputDir}/intents-merged.train.txt`;
  const testFile = `${options.outputDir}/intents-merged.test.txt`;

  // Use base training files if merged don't exist
  const actualTrainFile = fs.existsSync(trainFile) ? trainFile : `${options.outputDir}/intents.train.txt`;
  const actualTestFile = fs.existsSync(testFile) ? testFile : `${options.outputDir}/intents.test.txt`;

  runCommand(
    `npx ts-node backend/scripts/train-intent-model.ts --train ${actualTrainFile} --test ${actualTestFile} --output ${options.modelPath} --epochs ${options.epochs} --lr ${options.learningRate}`,
    'Step 4/5: Training FastText model',
  );

  // Step 5: Verify model exists and show stats
  console.log('\n' + '='.repeat(60));
  console.log('▶ Step 5/5: Verification');
  console.log('='.repeat(60));

  const modelBinPath = `${options.modelPath}.bin`;
  if (fs.existsSync(modelBinPath)) {
    const stats = fs.statSync(modelBinPath);
    console.log(`\n✅ Model trained successfully!`);
    console.log(`   Path: ${modelBinPath}`);
    console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`\n❌ Model file not found at ${modelBinPath}`);
  }

  // Training summary
  const elapsed = (Date.now() - startTime) / 1000;
  console.log('\n' + '═'.repeat(60));
  console.log('   📊 RETRAINING COMPLETE');
  console.log('═'.repeat(60));
  console.log(`\n  Total time: ${elapsed.toFixed(1)}s`);
  console.log(`  Model: ${modelBinPath}`);
  console.log(`\nTo verify the model, run:`);
  console.log(`  npx ts-node backend/scripts/ai-verification/run-ai-verification.ts --component intent`);
}

// CLI parsing
const args = process.argv.slice(2);
const getArg = (name: string, defaultValue: string): string => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultValue;
};

const options: RetrainOptions = {
  totalExamples: parseInt(getArg('examples', '15000'), 10),
  epochs: parseInt(getArg('epochs', '35'), 10),
  learningRate: parseFloat(getArg('lr', '0.5')),
  includeEnron: args.includes('--include-enron'),
  enronPath: getArg('enron-path', './data/enron/emails.csv'),
  outputDir: getArg('output', './data'),
  modelPath: getArg('model', './backend/models/intent-classifier'),
};

retrain(options).catch((error) => {
  console.error('\n❌ Retraining failed:', error.message);
  process.exit(1);
});
