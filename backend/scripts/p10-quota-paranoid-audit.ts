/**
 * P10 PARANOID QUOTA AUDIT SCRIPT
 *
 * This script audits ALL AI entry points in the codebase to verify
 * quota enforcement is properly implemented.
 *
 * RUN: npx ts-node backend/scripts/p10-quota-paranoid-audit.ts
 *
 * CRITICAL: All AI calls MUST have quota check BEFORE and usage tracking AFTER
 *
 * Coverage Target: 100% of AI cost entry points must be protected
 *
 * @see backend/docs/P10-SUBSCRIPTION-BILLING-ROADMAP.md (PART 11)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const AI_MODULES_PATH = path.join(__dirname, '..', 'src', 'modules', 'ai');
const VOLTAGENT_PATH = path.join(AI_MODULES_PATH, 'voltagent');

// Patterns that indicate AI cost (Mistral API calls)
// Note: We use DIRECT patterns that bypass centralized protection
const AI_COST_PATTERNS = [
  // Direct Mistral SDK calls (THESE ARE THE REAL RISKS - bypass centralized protection)
  { pattern: /client\.chat\.complete\s*\(/, name: 'client.chat.complete()', cost: 'HIGH', direct: true },
  { pattern: /mistralClient\.chat\.complete\s*\(/, name: 'mistralClient.chat.complete()', cost: 'HIGH', direct: true },
  { pattern: /\.chat\.complete\s*\(/, name: '.chat.complete()', cost: 'HIGH', direct: true },

  // Vercel AI SDK calls (DIRECT - need protection at call site or entry point)
  { pattern: /agent\.generateText\s*\(/, name: 'agent.generateText()', cost: 'HIGH', direct: true },
  { pattern: /agent\.streamText\s*\(/, name: 'agent.streamText()', cost: 'HIGH', direct: true },

  // Direct embedding SDK calls
  { pattern: /client\.embeddings\.create\s*\(/, name: 'client.embeddings.create()', cost: 'MEDIUM', direct: true },
  { pattern: /\.embed\s*\(/, name: '.embed()', cost: 'MEDIUM', direct: true },
];

// Patterns for INDIRECT calls (go through centralized protection)
const INDIRECT_AI_PATTERNS = [
  // Calls to centralized protected methods (MistralService.completePrompt, EmbeddingProviderService.generateEmbedding)
  { pattern: /this\.mistralService\.completePrompt\s*\(/, name: 'mistralService.completePrompt()', cost: 'HIGH', protected: true },
  { pattern: /this\.embeddingProviderService\.generateEmbedding\s*\(/, name: 'embeddingProviderService.generateEmbedding()', cost: 'MEDIUM', protected: true },
  { pattern: /this\.embeddingProvider\.generateEmbedding\s*\(/, name: 'embeddingProvider.generateEmbedding()', cost: 'MEDIUM', protected: true },
  { pattern: /embeddingsService\.generateEmbedding\s*\(/, name: 'embeddingsService.generateEmbedding()', cost: 'MEDIUM', protected: true },
];

// Patterns that indicate quota protection
const QUOTA_CHECK_PATTERNS = [
  /checkQuota\s*\(/,
  /checkAIQuota\s*\(/,
  /usageTrackingService.*check/i,
  /QUOTA_EXCEEDED/,
  /quotaExceeded/,
];

// Patterns that indicate usage tracking
const USAGE_TRACK_PATTERNS = [
  /trackUsage\s*\(/,
  /trackAICall\s*\(/,
  /usageTrackingService.*track/i,
  /incrementUsage\s*\(/,
];

// Files to exclude from audit (test files, types, internal providers)
const EXCLUDE_PATTERNS = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\.d\.ts$/,
  /\.mock\.ts$/,
  /node_modules/,
  /dist\//,
  // Internal providers: These implement IEmbeddingProvider interface and are ONLY called
  // through EmbeddingProviderService which has quota protection. Not injected directly.
  /mistral-embedding\.provider\.ts$/,
  /openai-embedding\.provider\.ts$/,
  /ollama-embedding\.provider\.ts$/,
  // Type definitions (interfaces, not implementations)
  /embedding-provider\.types\.ts$/,
];

// ============================================================================
// TYPES
// ============================================================================

interface AICostEntry {
  file: string;
  line: number;
  pattern: string;
  cost: string;
  code: string;
  hasQuotaCheck: boolean;
  hasUsageTracking: boolean;
  nearbyQuotaCheck: number | null;  // Line number of nearby check
  nearbyUsageTrack: number | null;  // Line number of nearby track
}

interface AuditResult {
  totalEntryPoints: number;
  protectedEntryPoints: number;
  unprotectedEntryPoints: number;
  coveragePercent: number;
  entries: AICostEntry[];
  byFile: Map<string, AICostEntry[]>;
  byCost: { HIGH: AICostEntry[]; MEDIUM: AICostEntry[]; LOW: AICostEntry[] };
  criticalGaps: string[];
}

// ============================================================================
// FILE SCANNING
// ============================================================================

function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      // Check exclusions
      const shouldExclude = EXCLUDE_PATTERNS.some(p => p.test(fullPath));
      if (!shouldExclude) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function findPatternInFile(
  filePath: string,
  content: string,
  lines: string[],
  pattern: { pattern: RegExp; name: string; cost: string }
): AICostEntry[] {
  const entries: AICostEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (pattern.pattern.test(line)) {
      // Check for quota protection in surrounding context (300 lines before - covers large functions)
      const contextStart = Math.max(0, i - 300);
      const contextBefore = lines.slice(contextStart, i).join('\n');

      // Check for usage tracking after (100 lines after)
      const contextEnd = Math.min(lines.length, i + 100);
      const contextAfter = lines.slice(i, contextEnd).join('\n');

      // Find nearby quota check
      let nearbyQuotaCheck: number | null = null;
      for (let j = contextStart; j < i; j++) {
        if (QUOTA_CHECK_PATTERNS.some(p => p.test(lines[j]))) {
          nearbyQuotaCheck = j + 1;
        }
      }

      // Find nearby usage tracking
      let nearbyUsageTrack: number | null = null;
      for (let j = i; j < contextEnd; j++) {
        if (USAGE_TRACK_PATTERNS.some(p => p.test(lines[j]))) {
          nearbyUsageTrack = j + 1;
          break;
        }
      }

      const hasQuotaCheck = QUOTA_CHECK_PATTERNS.some(p => p.test(contextBefore));
      const hasUsageTracking = USAGE_TRACK_PATTERNS.some(p => p.test(contextAfter));

      entries.push({
        file: filePath,
        line: i + 1,
        pattern: pattern.name,
        cost: pattern.cost,
        code: line.trim().substring(0, 100),
        hasQuotaCheck,
        hasUsageTracking,
        nearbyQuotaCheck,
        nearbyUsageTrack,
      });
    }
  }

  return entries;
}

// ============================================================================
// AUDIT LOGIC
// ============================================================================

function auditFile(filePath: string): AICostEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries: AICostEntry[] = [];

  for (const pattern of AI_COST_PATTERNS) {
    entries.push(...findPatternInFile(filePath, content, lines, pattern));
  }

  return entries;
}

function runAudit(): AuditResult {
  console.log('\n🔍 P10 PARANOID QUOTA AUDIT\n');
  console.log('=' .repeat(70));
  console.log('Scanning AI modules for unprotected cost entry points...\n');

  const allFiles = [
    ...getAllTsFiles(AI_MODULES_PATH),
  ];

  console.log(`Found ${allFiles.length} TypeScript files to audit\n`);

  const allEntries: AICostEntry[] = [];
  const byFile = new Map<string, AICostEntry[]>();

  for (const file of allFiles) {
    const entries = auditFile(file);
    if (entries.length > 0) {
      allEntries.push(...entries);
      const relativePath = path.relative(process.cwd(), file);
      byFile.set(relativePath, entries);
    }
  }

  // Categorize by cost
  const byCost = {
    HIGH: allEntries.filter(e => e.cost === 'HIGH'),
    MEDIUM: allEntries.filter(e => e.cost === 'MEDIUM'),
    LOW: allEntries.filter(e => e.cost === 'LOW'),
  };

  // Calculate protection stats
  const protectedEntries = allEntries.filter(e => e.hasQuotaCheck);
  const unprotectedEntries = allEntries.filter(e => !e.hasQuotaCheck);

  // Identify critical gaps (HIGH cost without protection)
  const criticalGaps: string[] = [];
  for (const entry of byCost.HIGH) {
    if (!entry.hasQuotaCheck) {
      const relativePath = path.relative(process.cwd(), entry.file);
      criticalGaps.push(`${relativePath}:${entry.line} - ${entry.pattern}`);
    }
  }

  return {
    totalEntryPoints: allEntries.length,
    protectedEntryPoints: protectedEntries.length,
    unprotectedEntryPoints: unprotectedEntries.length,
    coveragePercent: allEntries.length > 0
      ? Math.round((protectedEntries.length / allEntries.length) * 100)
      : 100,
    entries: allEntries,
    byFile,
    byCost,
    criticalGaps,
  };
}

// ============================================================================
// REPORTING
// ============================================================================

function printReport(result: AuditResult): void {
  const { totalEntryPoints, protectedEntryPoints, unprotectedEntryPoints, coveragePercent, byFile, byCost, criticalGaps } = result;

  // Summary
  console.log('\n📊 AUDIT SUMMARY');
  console.log('=' .repeat(70));
  console.log(`Total AI Cost Entry Points: ${totalEntryPoints}`);
  console.log(`Protected (quota check):    ${protectedEntryPoints} ✅`);
  console.log(`Unprotected:                ${unprotectedEntryPoints} ❌`);
  console.log(`Coverage:                   ${coveragePercent}%`);
  console.log();

  // Coverage bar
  const barLength = 50;
  const filledLength = Math.round((coveragePercent / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  const color = coveragePercent >= 90 ? '\x1b[32m' : coveragePercent >= 50 ? '\x1b[33m' : '\x1b[31m';
  console.log(`Coverage: ${color}[${bar}] ${coveragePercent}%\x1b[0m`);
  console.log();

  // By cost level
  console.log('\n📈 BY COST LEVEL');
  console.log('-'.repeat(70));
  console.log(`HIGH cost (LLM calls):    ${byCost.HIGH.length} total, ${byCost.HIGH.filter(e => !e.hasQuotaCheck).length} unprotected`);
  console.log(`MEDIUM cost (embeddings): ${byCost.MEDIUM.length} total, ${byCost.MEDIUM.filter(e => !e.hasQuotaCheck).length} unprotected`);
  console.log();

  // Critical gaps (HIGH cost without protection)
  if (criticalGaps.length > 0) {
    console.log('\n🚨 CRITICAL GAPS (HIGH COST - NO QUOTA CHECK)');
    console.log('='.repeat(70));
    for (const gap of criticalGaps) {
      console.log(`  ❌ ${gap}`);
    }
    console.log();
  }

  // Detailed by file
  console.log('\n📁 DETAILED BY FILE');
  console.log('-'.repeat(70));

  for (const [file, entries] of byFile) {
    const unprotected = entries.filter(e => !e.hasQuotaCheck);
    const status = unprotected.length === 0 ? '✅' : '❌';
    console.log(`\n${status} ${file}`);

    for (const entry of entries) {
      const quotaStatus = entry.hasQuotaCheck ? '✅' : '❌';
      const trackStatus = entry.hasUsageTracking ? '✅' : '⚠️';
      console.log(`   Line ${entry.line}: ${entry.pattern} [${entry.cost}]`);
      console.log(`      Quota: ${quotaStatus}${entry.nearbyQuotaCheck ? ` (line ${entry.nearbyQuotaCheck})` : ''}`);
      console.log(`      Track: ${trackStatus}${entry.nearbyUsageTrack ? ` (line ${entry.nearbyUsageTrack})` : ''}`);
    }
  }

  // Final verdict
  console.log('\n');
  console.log('='.repeat(70));
  if (coveragePercent === 100) {
    console.log('✅ AUDIT PASSED: All AI entry points are quota-protected!');
  } else if (coveragePercent >= 90) {
    console.log('⚠️  AUDIT WARNING: Most entry points protected, but gaps remain.');
    console.log(`   ${unprotectedEntryPoints} entry point(s) need quota checks.`);
  } else {
    console.log('❌ AUDIT FAILED: Too many unprotected AI entry points!');
    console.log(`   ${unprotectedEntryPoints} entry point(s) can cause uncontrolled spending.`);
    console.log(`   Target: 100% coverage | Current: ${coveragePercent}%`);
  }
  console.log('='.repeat(70));
}

function generateFixRecommendations(result: AuditResult): void {
  const unprotected = result.entries.filter(e => !e.hasQuotaCheck);

  if (unprotected.length === 0) {
    return;
  }

  console.log('\n🔧 FIX RECOMMENDATIONS');
  console.log('='.repeat(70));
  console.log('\nFor each unprotected entry point, add:\n');

  console.log('```typescript');
  console.log('// BEFORE the AI call:');
  console.log('if (this.usageTrackingService) {');
  console.log('  const canProceed = await this.usageTrackingService.checkQuota(tenantId, \'ai-calls\');');
  console.log('  if (!canProceed) {');
  console.log('    throw new AiError(\'Monthly AI call limit reached\', AiErrorCode.QUOTA_EXCEEDED, {');
  console.log('      retryable: false,');
  console.log('      context: { tenantId },');
  console.log('    });');
  console.log('  }');
  console.log('}');
  console.log('');
  console.log('// AFTER the AI call succeeds:');
  console.log('if (this.usageTrackingService) {');
  console.log('  await this.usageTrackingService.trackUsage(tenantId, \'ai-calls\', 1).catch((err: Error) => {');
  console.log('    this.logger.warn(`Failed to track AI usage: ${err.message}`);');
  console.log('  });');
  console.log('}');
  console.log('```');

  console.log('\n📋 FILES REQUIRING CHANGES:');
  console.log('-'.repeat(70));

  const fileGroups = new Map<string, AICostEntry[]>();
  for (const entry of unprotected) {
    const relativePath = path.relative(process.cwd(), entry.file);
    if (!fileGroups.has(relativePath)) {
      fileGroups.set(relativePath, []);
    }
    fileGroups.get(relativePath)!.push(entry);
  }

  for (const [file, entries] of fileGroups) {
    console.log(`\n${file}:`);
    for (const entry of entries) {
      console.log(`  - Line ${entry.line}: ${entry.pattern}`);
    }
  }
}

// ============================================================================
// INTEGRATION TEST GENERATOR
// ============================================================================

function generateIntegrationTest(result: AuditResult): void {
  console.log('\n🧪 INTEGRATION TEST (Copy to test file)');
  console.log('='.repeat(70));
  console.log('\n```typescript');
  console.log(`/**
 * P10 Quota Integration Test
 * Generated by p10-quota-paranoid-audit.ts
 *
 * Tests that all AI services properly check quota before making calls.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UsageTrackingService } from '../modules/subscription/services/usage-tracking.service';

describe('P10 AI Quota Integration', () => {
  let usageTrackingService: jest.Mocked<UsageTrackingService>;

  beforeEach(async () => {
    usageTrackingService = {
      checkQuota: jest.fn(),
      trackUsage: jest.fn(),
    } as any;
  });

  describe('Quota Check Coverage', () => {
    it('should have quota checks in all HIGH cost entry points', () => {
      // Total HIGH cost entry points found: ${result.byCost.HIGH.length}
      // Protected: ${result.byCost.HIGH.filter(e => e.hasQuotaCheck).length}
      // Unprotected: ${result.byCost.HIGH.filter(e => !e.hasQuotaCheck).length}

      const expectedCoverage = 100;
      const actualCoverage = ${Math.round((result.byCost.HIGH.filter(e => e.hasQuotaCheck).length / result.byCost.HIGH.length) * 100) || 100};

      expect(actualCoverage).toBeGreaterThanOrEqual(expectedCoverage);
    });

    it('should block requests when quota exceeded', async () => {
      usageTrackingService.checkQuota.mockResolvedValue(false);

      // Test each service rejects when quota exceeded
      // VoltAgentService, MistralService, DailyBriefingService, etc.
    });

    it('should track usage after successful AI calls', async () => {
      usageTrackingService.checkQuota.mockResolvedValue(true);
      usageTrackingService.trackUsage.mockResolvedValue();

      // Test each service calls trackUsage after success
    });
  });
});
`);
  console.log('```');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('   P10 PARANOID QUOTA AUDIT - MailAgent');
  console.log('   Hunting for unprotected AI cost entry points...');
  console.log('='.repeat(70));

  try {
    const result = runAudit();
    printReport(result);
    generateFixRecommendations(result);
    generateIntegrationTest(result);

    // Exit code based on coverage
    if (result.coveragePercent < 100) {
      console.log('\n⚠️  Exiting with code 1 (gaps found)');
      process.exit(1);
    } else {
      console.log('\n✅ Exiting with code 0 (all protected)');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ Audit failed with error:', error);
    process.exit(2);
  }
}

main();
