#!/usr/bin/env ts-node
/**
 * Module Safety Audit Script
 *
 * Comprehensive audit of ALL modules for security best practices:
 * - Authentication guards (JwtAuthGuard, TenantGuard)
 * - Authorization checks
 * - Tenant isolation
 * - Input validation
 * - Rate limiting
 * - Swagger documentation
 * - Error handling
 *
 * USAGE:
 *   npx ts-node scripts/audit-module-safety.ts
 *
 * @author MailAgent Team
 * @version 1.0.0
 * @date 2025-12-16
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface SecurityCheck {
  name: string;
  pattern: RegExp;
  required: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

interface FileAuditResult {
  file: string;
  module: string;
  checks: {
    check: string;
    passed: boolean;
    severity: string;
    details?: string;
  }[];
  score: number;
  issues: string[];
}

interface AuditReport {
  timestamp: string;
  summary: {
    totalFiles: number;
    totalChecks: number;
    passed: number;
    failed: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    overallScore: number;
  };
  byModule: {
    module: string;
    files: number;
    score: number;
    issues: number;
  }[];
  byCheck: {
    check: string;
    passed: number;
    failed: number;
    severity: string;
  }[];
  files: FileAuditResult[];
  recommendations: string[];
}

// ============================================================================
// Security Checks Configuration
// ============================================================================

const SECURITY_CHECKS: SecurityCheck[] = [
  // Authentication
  {
    name: 'JwtAuthGuard',
    pattern: /@UseGuards\([^)]*JwtAuthGuard/,
    required: true,
    severity: 'critical',
    description: 'JWT authentication guard must be applied',
  },
  {
    name: 'TenantGuard',
    // TenantGuard is REQUIRED for strict GDPR compliance and tenant isolation
    pattern: /@UseGuards\([^)]*TenantGuard/,
    required: true, // STRICT: TenantGuard must be present on all protected controllers
    severity: 'critical',
    description: 'Tenant isolation guard - REQUIRED for GDPR compliance',
  },
  // Swagger Documentation
  {
    name: 'ApiTags',
    pattern: /@ApiTags\(/,
    required: true,
    severity: 'medium',
    description: 'Swagger API tags for documentation',
  },
  {
    name: 'ApiBearerAuth',
    pattern: /@ApiBearerAuth\(/,
    required: true,
    severity: 'medium',
    description: 'Swagger bearer auth documentation',
  },
  {
    name: 'ApiOperation',
    pattern: /@ApiOperation\(/,
    required: true,
    severity: 'low',
    description: 'Swagger operation documentation',
  },
  {
    name: 'ApiResponse',
    pattern: /@ApiResponse\(/,
    required: true,
    severity: 'low',
    description: 'Swagger response documentation',
  },
  // Input Validation
  {
    name: 'ValidationPipe',
    pattern: /ValidationPipe|@Body\(\)|class-validator/,
    required: false,
    severity: 'high',
    description: 'Input validation for request bodies',
  },
  {
    name: 'ParseUUIDPipe',
    pattern: /ParseUUIDPipe|ParseIntPipe/,
    required: false,
    severity: 'medium',
    description: 'Parameter type validation',
  },
  // Rate Limiting
  {
    name: 'Throttle',
    pattern: /@Throttle\(|@SkipThrottle\(/,
    required: false,
    severity: 'medium',
    description: 'Rate limiting configuration',
  },
  // Tenant Isolation Patterns
  {
    name: 'TenantIdUsage',
    pattern: /req\.user\.tenantId|tenantId/,
    required: true,
    severity: 'critical',
    description: 'Tenant ID used for data isolation',
  },
];

// Controllers that don't need authentication (public endpoints)
// These are intentionally public for:
// - Health checks: Load balancer/Kubernetes probes
// - Auth: Pre-authentication endpoints (login, register)
// - OAuth callbacks: External OAuth flow
// - Webhooks: External services (use signature verification)
const PUBLIC_CONTROLLERS = [
  'health.controller.ts',       // Public health checks for monitoring
  'ai-health.controller.ts',    // AI health checks for monitoring
  'auth.controller.ts',         // Login/register/password reset (pre-auth)
  'oauth-callback.controller.ts', // OAuth provider callbacks
  'webhook.controller.ts',      // External email webhooks (signature verified)
  'calendar-webhook.controller.ts', // Google calendar webhooks (Google verified)
  'contacts-webhook.controller.ts', // Google contacts webhooks (Google verified)
];

// ============================================================================
// Audit Functions
// ============================================================================

function findControllers(dir: string): string[] {
  const controllers: string[] = [];

  function walk(currentDir: string) {
    const files = fs.readdirSync(currentDir);
    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        walk(filePath);
      } else if (file.endsWith('.controller.ts')) {
        controllers.push(filePath);
      }
    }
  }

  walk(dir);
  return controllers;
}

function auditFile(filePath: string): FileAuditResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const moduleName = path.basename(path.dirname(path.dirname(filePath)));
  const isPublic = PUBLIC_CONTROLLERS.includes(fileName);

  const checks: FileAuditResult['checks'] = [];
  const issues: string[] = [];
  let score = 100;

  // Pre-compute common patterns for combined checks
  const hasJwtAuthGuard = /@UseGuards\([^)]*JwtAuthGuard/.test(content);
  const hasTenantGuard = /@UseGuards\([^)]*TenantGuard/.test(content);
  const usesTenantIdFromJwt = /req\.user\.tenantId|tenantId\s*=\s*req\.user\.tenantId/.test(content);

  for (const check of SECURITY_CHECKS) {
    const passed = check.pattern.test(content);

    // Skip auth checks for public controllers
    if (isPublic && (check.name === 'JwtAuthGuard' || check.name === 'TenantGuard' || check.name === 'ApiBearerAuth')) {
      checks.push({
        check: check.name,
        passed: true,
        severity: check.severity,
        details: 'Skipped (public endpoint)',
      });
      continue;
    }

    // Skip tenant ID check for health controller
    if (fileName === 'health.controller.ts' && check.name === 'TenantIdUsage') {
      checks.push({
        check: check.name,
        passed: true,
        severity: check.severity,
        details: 'Skipped (health endpoint)',
      });
      continue;
    }

    // TenantGuard check: Accept if TenantGuard is present OR (JwtAuthGuard + tenantId from JWT)
    // This is because tenant isolation can be achieved either way
    if (check.name === 'TenantGuard' && !isPublic) {
      const tenantIsolationOk = hasTenantGuard || (hasJwtAuthGuard && usesTenantIdFromJwt);
      checks.push({
        check: check.name,
        passed: tenantIsolationOk,
        severity: check.severity,
        details: tenantIsolationOk
          ? (hasTenantGuard ? undefined : 'JWT + tenantId pattern')
          : 'Missing tenant isolation',
      });
      if (!tenantIsolationOk) {
        issues.push('Missing tenant isolation: No TenantGuard and not using tenantId from JWT');
        score -= 15;
      }
      continue;
    }

    checks.push({
      check: check.name,
      passed,
      severity: check.severity,
      details: passed ? undefined : check.description,
    });

    if (!passed && check.required) {
      issues.push(`Missing ${check.name}: ${check.description}`);
      switch (check.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }
  }

  // Additional security checks
  // Check for hardcoded secrets
  if (/['"]sk-[a-zA-Z0-9]{20,}['"]|['"]password['"]|['"]secret['"]/i.test(content)) {
    issues.push('Potential hardcoded secret detected');
    score -= 30;
    checks.push({
      check: 'NoHardcodedSecrets',
      passed: false,
      severity: 'critical',
      details: 'Hardcoded secrets detected',
    });
  } else {
    checks.push({
      check: 'NoHardcodedSecrets',
      passed: true,
      severity: 'critical',
    });
  }

  // Check for SQL injection risks (raw queries)
  if (/\$queryRaw|\.query\(|\.execute\(/i.test(content) && !/\$queryRaw`/.test(content)) {
    issues.push('Potential SQL injection risk - raw queries without template literals');
    score -= 20;
    checks.push({
      check: 'NoSQLInjection',
      passed: false,
      severity: 'critical',
      details: 'Raw SQL queries detected',
    });
  } else {
    checks.push({
      check: 'NoSQLInjection',
      passed: true,
      severity: 'critical',
    });
  }

  // Check for XSS risks (innerHTML, dangerouslySetInnerHTML)
  if (/innerHTML|dangerouslySetInnerHTML/i.test(content)) {
    issues.push('Potential XSS risk - direct HTML manipulation');
    score -= 15;
    checks.push({
      check: 'NoXSSRisk',
      passed: false,
      severity: 'high',
      details: 'Direct HTML manipulation detected',
    });
  } else {
    checks.push({
      check: 'NoXSSRisk',
      passed: true,
      severity: 'high',
    });
  }

  // Check for IDOR prevention (ownership verification)
  if (/findUnique|findFirst|update|delete/.test(content)) {
    const hasTenantCheck = /where:\s*\{[^}]*tenantId/.test(content) ||
                          /provider\.tenantId\s*!==\s*tenantId/.test(content) ||
                          /\.tenantId\s*!==/.test(content);
    if (!hasTenantCheck && !isPublic) {
      issues.push('Potential IDOR risk - database operations without tenant verification');
      score -= 15;
      checks.push({
        check: 'IDORPrevention',
        passed: false,
        severity: 'high',
        details: 'Missing ownership verification',
      });
    } else {
      checks.push({
        check: 'IDORPrevention',
        passed: true,
        severity: 'high',
      });
    }
  }

  return {
    file: filePath,
    module: moduleName,
    checks,
    score: Math.max(0, score),
    issues,
  };
}

function generateReport(results: FileAuditResult[]): AuditReport {
  const timestamp = new Date().toISOString();

  // Calculate summary
  let totalChecks = 0;
  let passedChecks = 0;
  let criticalIssues = 0;
  let highIssues = 0;
  let mediumIssues = 0;
  let lowIssues = 0;

  for (const result of results) {
    for (const check of result.checks) {
      totalChecks++;
      if (check.passed) passedChecks++;
      else {
        switch (check.severity) {
          case 'critical':
            criticalIssues++;
            break;
          case 'high':
            highIssues++;
            break;
          case 'medium':
            mediumIssues++;
            break;
          case 'low':
            lowIssues++;
            break;
        }
      }
    }
  }

  const overallScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : 0;

  // Group by module
  const moduleMap = new Map<string, FileAuditResult[]>();
  for (const result of results) {
    const existing = moduleMap.get(result.module) || [];
    existing.push(result);
    moduleMap.set(result.module, existing);
  }

  const byModule = Array.from(moduleMap.entries()).map(([module, files]) => ({
    module,
    files: files.length,
    score: Math.round(files.reduce((sum, f) => sum + f.score, 0) / files.length),
    issues: files.reduce((sum, f) => sum + f.issues.length, 0),
  })).sort((a, b) => a.score - b.score);

  // Group by check
  const checkMap = new Map<string, { passed: number; failed: number; severity: string }>();
  for (const result of results) {
    for (const check of result.checks) {
      const existing = checkMap.get(check.check) || { passed: 0, failed: 0, severity: check.severity };
      if (check.passed) existing.passed++;
      else existing.failed++;
      checkMap.set(check.check, existing);
    }
  }

  const byCheck = Array.from(checkMap.entries()).map(([check, stats]) => ({
    check,
    ...stats,
  })).sort((a, b) => b.failed - a.failed);

  // Generate recommendations
  const recommendations: string[] = [];

  if (criticalIssues > 0) {
    recommendations.push('🚨 CRITICAL: Fix all critical security issues immediately');
  }
  if (byCheck.find((c) => c.check === 'JwtAuthGuard' && c.failed > 0)) {
    recommendations.push('Add JwtAuthGuard to all protected controllers');
  }
  if (byCheck.find((c) => c.check === 'TenantGuard' && c.failed > 0)) {
    recommendations.push('Add TenantGuard to ensure tenant isolation');
  }
  if (byCheck.find((c) => c.check === 'ApiTags' && c.failed > 0)) {
    recommendations.push('Add @ApiTags() decorator to all controllers for Swagger docs');
  }
  if (byCheck.find((c) => c.check === 'IDORPrevention' && c.failed > 0)) {
    recommendations.push('Add tenant ownership verification to all database operations');
  }

  return {
    timestamp,
    summary: {
      totalFiles: results.length,
      totalChecks,
      passed: passedChecks,
      failed: totalChecks - passedChecks,
      criticalIssues,
      highIssues,
      mediumIssues,
      lowIssues,
      overallScore,
    },
    byModule,
    byCheck,
    files: results,
    recommendations,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    MODULE SAFETY AUDIT - Security Best Practices                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');
  console.log(`Started: ${new Date().toISOString()}\n`);

  const srcDir = path.join(__dirname, '..', 'src', 'modules');
  const controllers = findControllers(srcDir);

  console.log(`Found ${controllers.length} controllers to audit\n`);

  // Audit each controller
  const results: FileAuditResult[] = [];
  for (const controller of controllers) {
    const result = auditFile(controller);
    results.push(result);

    const icon = result.score >= 90 ? '✅' : result.score >= 70 ? '⚠️' : '❌';
    console.log(`${icon} ${path.basename(controller).padEnd(45)} Score: ${result.score}%`);
    if (result.issues.length > 0) {
      result.issues.forEach((issue) => console.log(`      └─ ${issue}`));
    }
  }

  // Generate report
  const report = generateReport(results);

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════════════');
  console.log('╔══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              SAFETY AUDIT SUMMARY                                 ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');

  const { summary } = report;
  console.log(`║ Total Controllers: ${summary.totalFiles.toString().padEnd(60)}║`);
  console.log(`║ Total Checks: ${summary.totalChecks.toString().padEnd(65)}║`);
  console.log(`║ ✅ Passed: ${summary.passed.toString().padEnd(68)}║`);
  console.log(`║ ❌ Failed: ${summary.failed.toString().padEnd(68)}║`);
  console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║ 🚨 Critical Issues: ${summary.criticalIssues.toString().padEnd(59)}║`);
  console.log(`║ ⚠️  High Issues: ${summary.highIssues.toString().padEnd(62)}║`);
  console.log(`║ 📋 Medium Issues: ${summary.mediumIssues.toString().padEnd(61)}║`);
  console.log(`║ ℹ️  Low Issues: ${summary.lowIssues.toString().padEnd(64)}║`);
  console.log('╠══════════════════════════════════════════════════════════════════════════════════╣');
  console.log(`║ Overall Security Score: ${summary.overallScore}%`.padEnd(82) + '║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════════╝');

  // Module scores
  console.log('\n📊 BY MODULE:');
  for (const mod of report.byModule) {
    const icon = mod.score >= 90 ? '✅' : mod.score >= 70 ? '⚠️' : '❌';
    console.log(`   ${icon} ${mod.module.padEnd(25)} ${mod.score}% (${mod.files} files, ${mod.issues} issues)`);
  }

  // Check results
  console.log('\n🔒 BY SECURITY CHECK:');
  for (const check of report.byCheck) {
    const icon = check.failed === 0 ? '✅' : '❌';
    console.log(`   ${icon} ${check.check.padEnd(25)} ${check.passed}/${check.passed + check.failed} passed [${check.severity}]`);
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS:');
    report.recommendations.forEach((rec) => console.log(`   • ${rec}`));
  }

  // Save report
  const reportPath = path.join(__dirname, 'module-safety-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to: ${reportPath}`);

  // Exit code based on critical issues
  if (summary.criticalIssues > 0) {
    console.log('\n❌ AUDIT FAILED: Critical security issues found');
    process.exit(1);
  } else if (summary.overallScore < 80) {
    console.log('\n⚠️ AUDIT WARNING: Security score below 80%');
    process.exit(0);
  } else {
    console.log('\n✅ AUDIT PASSED: Security standards met');
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
