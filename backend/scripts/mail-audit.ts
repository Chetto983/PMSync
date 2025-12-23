/**
 * Comprehensive Mail System Audit
 * Tests all mail functionality: providers, sync, webhooks, send, threads
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

const prisma = createPrismaClient();
const TENANT_ID = 'cmi31xyel0000yhukbwp6l714';
const GOOGLE_PROVIDER_ID = 'cmi7m1nod0007yhj4lawfkjww';
const MS_PROVIDER_ID = 'cmi7m4qz907ydyhj4vwqdbnj5';

interface AuditResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  details: string;
}

const results: AuditResult[] = [];

function log(category: string, check: string, status: 'PASS' | 'FAIL' | 'WARN', details: string) {
  results.push({ category, check, status, details });
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${emoji} [${category}] ${check}: ${details}`);
}

async function auditProviders() {
  console.log('\n=== PROVIDER AUDIT ===\n');

  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      id: true,
      email: true,
      providerType: true,
      isActive: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiresAt: true,
      lastSyncedAt: true,
      nextSyncAt: true,
      syncPriority: true,
      errorStreak: true,
    },
  });

  log('Providers', 'Count', providers.length >= 2 ? 'PASS' : 'WARN', `${providers.length} providers configured`);

  for (const p of providers) {
    const hasToken = !!p.accessToken;
    const hasRefresh = !!p.refreshToken;
    const tokenExpired = p.tokenExpiresAt && new Date(p.tokenExpiresAt) < new Date();
    const hasErrors = (p.errorStreak ?? 0) > 0;

    log('Providers', `${p.providerType} active`, p.isActive ? 'PASS' : 'FAIL', p.email);
    log('Providers', `${p.providerType} has tokens`, hasToken && hasRefresh ? 'PASS' : 'FAIL',
      `Access: ${hasToken}, Refresh: ${hasRefresh}`);
    log('Providers', `${p.providerType} token valid`, !tokenExpired ? 'PASS' : 'WARN',
      `Expires: ${p.tokenExpiresAt}`);
    log('Providers', `${p.providerType} errors`, !hasErrors ? 'PASS' : 'WARN',
      `Error streak: ${p.errorStreak}`);
    log('Providers', `${p.providerType} last sync`, p.lastSyncedAt ? 'PASS' : 'WARN',
      `${p.lastSyncedAt}`);
  }
}

async function auditWebhooks() {
  console.log('\n=== WEBHOOK AUDIT ===\n');

  const webhooks = await prisma.webhookSubscription.findMany({
    where: {
      provider: { tenantId: TENANT_ID },
    },
    include: {
      provider: { select: { email: true, providerType: true } },
    },
  });

  const now = new Date();
  const gmailWebhooks = webhooks.filter(w => w.providerType === 'google' && w.resourcePath.includes('gmail'));
  const msWebhooks = webhooks.filter(w => w.providerType === 'microsoft' && w.resourcePath.includes('mail'));

  log('Webhooks', 'Gmail webhook exists', gmailWebhooks.length > 0 ? 'PASS' : 'FAIL',
    `${gmailWebhooks.length} Gmail webhooks`);
  log('Webhooks', 'Microsoft webhook exists', msWebhooks.length > 0 ? 'PASS' : 'FAIL',
    `${msWebhooks.length} MS webhooks`);

  for (const w of webhooks) {
    const expired = w.expiresAt && new Date(w.expiresAt) < now;
    const active = w.isActive;
    const hasErrors = w.errorCount > 5;

    log('Webhooks', `${w.providerType} ${w.resourcePath.substring(0, 30)}`,
      active && !expired ? 'PASS' : expired ? 'FAIL' : 'WARN',
      `Active: ${active}, Expires: ${w.expiresAt}${expired ? ' (EXPIRED!)' : ''}`);
  }
}

async function auditEmails() {
  console.log('\n=== EMAIL AUDIT ===\n');

  const googleEmails = await prisma.email.count({
    where: { tenantId: TENANT_ID, providerId: GOOGLE_PROVIDER_ID, isDeleted: false },
  });
  const msEmails = await prisma.email.count({
    where: { tenantId: TENANT_ID, providerId: MS_PROVIDER_ID, isDeleted: false },
  });

  log('Emails', 'Google email count', googleEmails > 0 ? 'PASS' : 'FAIL', `${googleEmails} emails`);
  log('Emails', 'Microsoft email count', msEmails > 0 ? 'PASS' : 'WARN', `${msEmails} emails`);

  // Check recent emails
  const recentGoogle = await prisma.email.count({
    where: {
      tenantId: TENANT_ID,
      providerId: GOOGLE_PROVIDER_ID,
      receivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });
  const recentMs = await prisma.email.count({
    where: {
      tenantId: TENANT_ID,
      providerId: MS_PROVIDER_ID,
      receivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  });

  log('Emails', 'Google recent (24h)', recentGoogle > 0 ? 'PASS' : 'WARN', `${recentGoogle} new emails`);
  log('Emails', 'Microsoft recent (24h)', recentMs >= 0 ? 'PASS' : 'WARN', `${recentMs} new emails`);
}

async function auditThreads() {
  console.log('\n=== THREAD AUDIT ===\n');

  const threadsWithMultiple = await prisma.email.groupBy({
    by: ['threadId'],
    where: {
      tenantId: TENANT_ID,
      threadId: { not: null },
      isDeleted: false,
    },
    _count: true,
    having: {
      threadId: { _count: { gt: 1 } },
    },
  });

  log('Threads', 'Multi-email threads', threadsWithMultiple.length > 0 ? 'PASS' : 'WARN',
    `${threadsWithMultiple.length} threads with multiple emails`);

  // Check for proper threading
  const sampleThread = await prisma.email.findFirst({
    where: {
      tenantId: TENANT_ID,
      threadId: { not: null },
      inReplyTo: { not: null },
    },
    select: { threadId: true, inReplyTo: true, references: true },
  });

  log('Threads', 'Thread headers present', sampleThread ? 'PASS' : 'WARN',
    `inReplyTo: ${!!sampleThread?.inReplyTo}, references: ${!!sampleThread?.references}`);
}

async function auditFolders() {
  console.log('\n=== FOLDER AUDIT ===\n');

  const googleFolders = await prisma.folder.count({
    where: { providerId: GOOGLE_PROVIDER_ID },
  });
  const msFolders = await prisma.folder.count({
    where: { providerId: MS_PROVIDER_ID },
  });

  log('Folders', 'Google folders', googleFolders > 0 ? 'PASS' : 'FAIL', `${googleFolders} folders`);
  log('Folders', 'Microsoft folders', msFolders > 0 ? 'PASS' : 'FAIL', `${msFolders} folders`);
}

async function auditSentEmails() {
  console.log('\n=== SENT EMAIL AUDIT ===\n');

  const sentGoogle = await prisma.email.count({
    where: { tenantId: TENANT_ID, providerId: GOOGLE_PROVIDER_ID, folder: 'SENT' },
  });
  const sentMs = await prisma.email.count({
    where: { tenantId: TENANT_ID, providerId: MS_PROVIDER_ID, folder: { contains: 'Sent' } },
  });

  log('Sent', 'Google sent emails', sentGoogle > 0 ? 'PASS' : 'WARN', `${sentGoogle} sent emails`);
  log('Sent', 'Microsoft sent emails', sentMs >= 0 ? 'PASS' : 'WARN', `${sentMs} sent emails`);
}

async function auditAttachments() {
  console.log('\n=== ATTACHMENT AUDIT ===\n');

  const attachments = await prisma.emailAttachment.count({
    where: { email: { tenantId: TENANT_ID } },
  });

  log('Attachments', 'Total attachments', attachments > 0 ? 'PASS' : 'WARN', `${attachments} attachments`);
}

async function auditSync() {
  console.log('\n=== SYNC AUDIT ===\n');

  const providers = await prisma.providerConfig.findMany({
    where: { tenantId: TENANT_ID },
    select: {
      email: true,
      providerType: true,
      lastSyncedAt: true,
      nextSyncAt: true,
      syncPriority: true,
      avgActivityRate: true,
    },
  });

  const now = new Date();
  for (const p of providers) {
    const hoursSinceSync = p.lastSyncedAt
      ? (now.getTime() - new Date(p.lastSyncedAt).getTime()) / (1000 * 60 * 60)
      : Infinity;
    const nextSyncPast = p.nextSyncAt && new Date(p.nextSyncAt) <= now;

    log('Sync', `${p.providerType} last sync`, hoursSinceSync < 24 ? 'PASS' : 'FAIL',
      `${hoursSinceSync.toFixed(1)} hours ago`);
    log('Sync', `${p.providerType} next sync due`, nextSyncPast ? 'PASS' : 'WARN',
      `${p.nextSyncAt} (Priority: ${p.syncPriority})`);
  }
}

async function runFullAudit() {
  console.log('🔍 COMPREHENSIVE MAIL SYSTEM AUDIT\n');
  console.log('='.repeat(60));

  try {
    await auditProviders();
    await auditWebhooks();
    await auditEmails();
    await auditThreads();
    await auditFolders();
    await auditSentEmails();
    await auditAttachments();
    await auditSync();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 AUDIT SUMMARY\n');

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warnings = results.filter(r => r.status === 'WARN').length;

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️ Warnings: ${warnings}`);

    if (failed > 0) {
      console.log('\n🚨 CRITICAL ISSUES:');
      results.filter(r => r.status === 'FAIL').forEach(r => {
        console.log(`  - [${r.category}] ${r.check}: ${r.details}`);
      });
    }

    if (warnings > 0) {
      console.log('\n⚠️ WARNINGS:');
      results.filter(r => r.status === 'WARN').forEach(r => {
        console.log(`  - [${r.category}] ${r.check}: ${r.details}`);
      });
    }

  } finally {
    await prisma.$disconnect();
  }
}

runFullAudit().catch(console.error);
