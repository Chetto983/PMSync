/**
 * Email Driver Integrity and Regression Test.
 *
 * Run: npx ts-node scripts/test-email-integrity.ts
 */
import 'dotenv/config';
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import * as jwt from 'jsonwebtoken';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';

type TestStatus = 'PASS' | 'FAIL' | 'SKIP';

interface TestResult {
  name: string;
  status: TestStatus;
  duration: number;
  details?: string;
}

interface TestOutcome {
  skip?: boolean;
  details?: string;
}

interface ProviderInfo {
  id: string;
  providerType: string;
  email: string;
}

interface IntegrityEmail {
  id: string;
  folder: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  attachments: Array<{
    id: string;
    filename: string;
    size: number;
  }>;
}

const prisma = createPrismaClient();
const results: TestResult[] = [];
const cleanupStack: Array<() => Promise<void>> = [];

const API_URL = process.env.MAIL_TEST_API_URL || process.env.API_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;

const ALLOW_FOLDER_MUTATIONS = envFlag('MAIL_TEST_ALLOW_FOLDER_MUTATIONS', true);
const ALLOW_LABEL_MUTATIONS = envFlag('MAIL_TEST_ALLOW_LABEL_MUTATIONS', true);
const ALLOW_CLEANUP = envFlag('MAIL_TEST_ALLOW_CLEANUP');
const ALLOW_SYNC_ALL = envFlag('MAIL_TEST_ALLOW_SYNC_ALL');

function envFlag(name: string, defaultVal = false): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultVal;
  return ['1', 'true', 'yes', 'y'].includes(raw.toLowerCase());
}

function record(name: string, status: TestStatus, duration: number, details?: string) {
  results.push({ name, status, duration, details });
  const detailText = details ? ` - ${details}` : '';
  console.log(`${status} ${name} (${duration}ms)${detailText}`);
}

async function runTest(name: string, fn: () => Promise<TestOutcome | void>) {
  const start = Date.now();
  try {
    const outcome = await fn();
    if (outcome?.skip) {
      record(name, 'SKIP', Date.now() - start, outcome.details);
    } else {
      record(name, 'PASS', Date.now() - start, outcome?.details);
    }
  } catch (err) {
    record(name, 'FAIL', Date.now() - start, formatError(err));
  }
}

function formatError(err: unknown): string {
  if (axios.isAxiosError(err)) return formatAxiosError(err);
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatAxiosError(err: AxiosError): string {
  const method = err.config?.method?.toUpperCase();
  const baseUrl = err.config?.baseURL ?? '';
  const path = err.config?.url ?? '';
  const fullUrl = baseUrl && path ? `${baseUrl}${path}` : path || baseUrl;
  const parts = [
    err.message || 'AxiosError',
    err.code ? `code=${err.code}` : null,
    method ? `method=${method}` : null,
    fullUrl ? `url=${fullUrl}` : null,
    err.response?.status ? `status=${err.response.status}` : null,
    err.response?.data !== undefined ? `data=${safeJson(err.response.data)}` : null,
  ].filter(Boolean);
  return parts.join(' ');
}

function assertStatus(res: AxiosResponse, allowed: number[], label: string) {
  if (!allowed.includes(res.status)) {
    throw new Error(`${label} unexpected status ${res.status}. Data: ${safeJson(res.data)}`);
  }
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json.length > 200 ? `${json.slice(0, 200)}...` : json;
  } catch {
    return String(value);
  }
}

function registerCleanup(name: string, fn: () => Promise<void>) {
  cleanupStack.push(async () => {
    try {
      await fn();
    } catch (err) {
      console.warn(`Cleanup failed for ${name}: ${formatError(err)}`);
    }
  });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is required');

  console.log('Starting Email Driver Integrity Test');

  const tenantId = await resolveTenantId();
  const user = await resolveUser(tenantId);
  const providers = await resolveProviders(tenantId);
  const activeProviders = filterProvidersByEnv(providers);

  if (activeProviders.length === 0) throw new Error('No active providers found for tenant');

  const token = jwt.sign(
    { userId: user.id, tenantId: user.tenantId, email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' },
  );

  const api = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });

  const recipientEmail = process.env.MAIL_TEST_RECIPIENT_EMAIL || user.email;
  const testSuffix = Date.now();

  try {
    for (const provider of activeProviders) {
      await runProviderIntegrity(api, tenantId, provider, recipientEmail, testSuffix);
    }

    await runTest('folders.list', async () => {
      const res = await api.get('/folders');
      assertStatus(res, [200], 'folders.list');
      return { details: 'ok' };
    });

    if (ALLOW_LABEL_MUTATIONS) {
      await runTest('labels.lifecycle', async () => {
        const createRes = await api.post('/labels', { name: `Integrity Label ${testSuffix}` });
        if (createRes.status !== 201) {
          return { skip: true, details: 'labels disabled or blocked' };
        }
        const labelId = createRes.data?.label?.id;
        if (labelId) {
          await api.delete(`/labels/${labelId}`);
        }
        return { details: 'create/delete ok' };
      });
    }

    await runTest('email-sync.status', async () => {
      const res = await api.get('/email-sync/status');
      assertStatus(res, [200], 'email-sync.status');
      return { details: 'ok' };
    });

    if (ALLOW_SYNC_ALL) {
      await runTest('email-sync.sync-all', async () => {
        const res = await api.post('/email-sync/sync-all');
        assertStatus(res, [200], 'email-sync.sync-all');
        return { details: res.data?.message || 'ok' };
      });
    }

    if (ALLOW_CLEANUP) {
      await runTest('emails.maintenance.cleanup', async () => {
        const res = await api.post('/emails/maintenance/cleanup');
        assertStatus(res, [200, 403], 'emails.maintenance.cleanup');
        return { details: res.status === 200 ? 'cleanup ok' : 'forbidden' };
      });
    }
  } finally {
    console.log('Cleaning up test artifacts...');
    for (const task of cleanupStack.reverse()) {
      await task();
    }
    await summary();
    await prisma.$disconnect();
  }
}

async function runProviderIntegrity(
  api: AxiosInstance,
  tenantId: string,
  provider: ProviderInfo,
  recipientEmail: string,
  testSuffix: number,
) {
  const providerLabel = `${provider.providerType}:${provider.email}`;
  const attachmentText = `MailAgent Integrity ${provider.providerType} ${testSuffix}`;
  const attachmentBase64 = Buffer.from(attachmentText, 'utf-8').toString('base64');
  const sendSubject = `Driver Integrity ${provider.providerType} ${testSuffix}`;

  let createdEmailId: string | null = null;
  let createdEmailFolder: string | null = null;
  let attachmentId: string | null = null;

  await runTest(`${providerLabel}.send`, async () => {
    const res = await api.post('/emails/send', {
      providerId: provider.id,
      to: [recipientEmail],
      subject: sendSubject,
      bodyText: `Plaintext content ${testSuffix}`,
      bodyHtml: `<p>HTML content <b>${testSuffix}</b></p>`,
      attachments: [
        {
          filename: 'integrity-check.txt',
          contentType: 'text/plain',
          contentBase64: attachmentBase64,
          size: attachmentText.length,
        },
      ],
    });
    assertStatus(res, [200, 201], `${providerLabel}.send`);
    return { details: `sent via ${provider.providerType}` };
  });

  await runTest(`${providerLabel}.sync`, async () => {
    const res = await api.post(`/email-sync/sync/${provider.id}`);
    assertStatus(res, [200, 201], `${providerLabel}.sync`);
    return { details: 'sync queued' };
  });

  await runTest(`${providerLabel}.discovery`, async () => {
    const found = await pollForEmail(api, sendSubject, provider.id, tenantId);
    if (!found) throw new Error('Sent email not found via search or DB');
    createdEmailId = found.id;
    registerCleanup(`email:${createdEmailId}`, async () => {
      await api.delete(`/emails/${createdEmailId}`);
    });
    return { details: `id=${createdEmailId}` };
  });

  await runTest(`${providerLabel}.mime`, async () => {
    if (!createdEmailId) return { skip: true };
    const email = await waitForIntegrityEmail(createdEmailId, tenantId);
    if (!email) throw new Error('Email not found in DB');

    createdEmailFolder = email.folder;

    if (!email.bodyHtml && !email.bodyText) {
      throw new Error('Body missing: MIME construction failed');
    }
    if (email.bodyHtml && !email.bodyHtml.includes(String(testSuffix))) {
      throw new Error(`HTML body missing token ${testSuffix}`);
    }
    if (email.bodyText && !email.bodyText.includes(String(testSuffix))) {
      throw new Error(`Text body missing token ${testSuffix}`);
    }

    if (email.attachments.length < 1) {
      throw new Error('Attachment missing');
    }

    const attachment = email.attachments.find((att) => att.filename === 'integrity-check.txt');
    if (!attachment) {
      throw new Error('Attachment filename mismatch');
    }
    if (attachment.size === 0) {
      throw new Error('Attachment size is zero');
    }

    attachmentId = attachment.id;

    return { details: 'body and attachments verified' };
  });

  await runTest(`${providerLabel}.attachment.redirect`, async () => {
    if (!createdEmailId || !attachmentId) return { skip: true };
    const res = await api.get(`/emails/${createdEmailId}/attachments/${attachmentId}/download`, {
      maxRedirects: 0,
      validateStatus: () => true,
    });
    assertStatus(res, [200, 302], `${providerLabel}.attachment.redirect`);
    return { details: `status=${res.status}` };
  });

  await runTest(`${providerLabel}.attachment.content`, async () => {
    if (!attachmentId) return { skip: true };
    const res = await api.get(`/email/attachments/${attachmentId}/download`, {
      responseType: 'arraybuffer',
    });
    assertStatus(res, [200], `${providerLabel}.attachment.content`);
    const text = Buffer.from(res.data).toString('utf-8');
    if (!text.includes(attachmentText)) {
      throw new Error('Attachment content mismatch');
    }
    return { details: 'content verified' };
  });

  await runFolderResolutionTest(api, tenantId, provider, createdEmailId, createdEmailFolder);

  if (provider.providerType === 'microsoft') {
    await runBatchTargetingTest(api, tenantId, provider.id);
  }
}

async function runFolderResolutionTest(
  api: AxiosInstance,
  tenantId: string,
  provider: ProviderInfo,
  emailId: string | null,
  originalFolder: string | null,
) {
  if (!ALLOW_FOLDER_MUTATIONS || !emailId) {
    await runTest(`${provider.providerType}.folder.resolution`, async () => ({
      skip: true,
      details: 'folder mutations disabled or no email',
    }));
    return;
  }

  const complexName = `Project-${Date.now()}-Special-${provider.providerType}`;
  let folderId: string | null = null;
  let folderName: string | null = null;
  let folderPath: string | null = null;

  await runTest(`${provider.providerType}.folder.create`, async () => {
    const res = await api.post('/folders', { providerId: provider.id, name: complexName });
    assertStatus(res, [200, 201], 'folders.create');
    folderId = res.data?.id || null;
    folderName = res.data?.name || complexName;
    folderPath = res.data?.path || null;
    if (folderId) {
      registerCleanup(`folder:${folderId}`, async () => {
        await api.delete(`/folders/${folderId}`);
      });
    }
    return { details: `folderId=${folderId || 'n/a'}` };
  });

  if (!folderName) return;

  const targetFolder = provider.providerType === 'microsoft' ? folderName : (folderPath || folderName);
  const targetList = [emailId];

  await runTest(`${provider.providerType}.folder.move`, async () => {
    const res = await api.patch('/emails/bulk/move', { emailIds: targetList, folder: targetFolder });
    assertStatus(res, [200], 'emails.bulk.move');

    const moved = await prisma.email.findFirst({
      where: { id: emailId, tenantId },
      select: { folder: true },
    });
    if (moved?.folder !== targetFolder) {
      throw new Error('Folder move not reflected in DB');
    }

    return { details: `folder=${targetFolder}` };
  });

  if (originalFolder) {
    await runTest(`${provider.providerType}.folder.revert`, async () => {
      const res = await api.patch('/emails/bulk/move', { emailIds: targetList, folder: originalFolder });
      assertStatus(res, [200], 'emails.bulk.move.revert');
      return { details: `folder=${originalFolder}` };
    });
  }
}

async function runBatchTargetingTest(
  api: AxiosInstance,
  tenantId: string,
  providerId: string,
) {
  const emails = await prisma.email.findMany({
    where: { tenantId, providerId, isDeleted: false, isDraft: false },
    orderBy: { receivedAt: 'desc' },
    take: 2,
    select: { id: true, isRead: true },
  });

  if (emails.length < 1) {
    await runTest('microsoft.batch.targeting', async () => ({
      skip: true,
      details: 'no emails for batch test',
    }));
    return;
  }

  const target = emails[0];
  const newStatus = !target.isRead;

  await runTest('microsoft.batch.targeting', async () => {
    const res = await api.patch('/emails/bulk/read', { emailIds: [target.id], isRead: newStatus });
    assertStatus(res, [200], 'bulk.read');

    const updated = await prisma.email.findFirst({
      where: { id: target.id, tenantId },
      select: { isRead: true },
    });

    if (updated?.isRead !== newStatus) {
      throw new Error('Bulk read update did not apply to target email');
    }

    await api.patch('/emails/bulk/read', { emailIds: [target.id], isRead: target.isRead });
    return { details: `emailId=${target.id}` };
  });
}

async function waitForIntegrityEmail(emailId: string, tenantId: string): Promise<IntegrityEmail | null> {
  const maxWaitMs = 60000;
  const start = Date.now();
  let lastEmail: IntegrityEmail | null = null;

  while (Date.now() - start < maxWaitMs) {
    const email = await prisma.email.findFirst({
      where: { id: emailId, tenantId },
      include: { attachments: true },
    });

    if (email) {
      lastEmail = {
        id: email.id,
        folder: email.folder,
        subject: email.subject,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        attachments: email.attachments.map((att) => ({
          id: att.id,
          filename: att.filename,
          size: att.size,
        })),
      };

      if ((email.bodyHtml || email.bodyText) && email.attachments.length > 0) {
        return lastEmail;
      }
    }

    await sleep(2000);
  }

  return lastEmail;
}

async function pollForEmail(
  api: AxiosInstance,
  subject: string,
  providerId: string,
  tenantId: string,
) {
  const maxTime = 90000;
  const start = Date.now();
  let attempt = 0;

  while (Date.now() - start < maxTime) {
    attempt += 1;
    try {
      const res = await api.get('/emails/search', {
        params: { q: subject, providerId, limit: 1 },
        validateStatus: () => true,
      });
      if (res.status === 200 && res.data?.emails?.length > 0) {
        return res.data.emails[0];
      }
    } catch {
      // ignore
    }

    const fallback = await prisma.email.findFirst({
      where: { tenantId, providerId, subject },
      select: { id: true },
    });
    if (fallback) return fallback;

    const wait = Math.min(2000 + attempt * 1000, 10000);
    await sleep(wait);
  }

  return null;
}

async function resolveTenantId(): Promise<string> {
  const envTenant = process.env.MAIL_TEST_TENANT_ID;
  if (envTenant) return envTenant;
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true, supportsEmail: true },
    select: { tenantId: true },
  });
  if (!provider) throw new Error('No tenant found');
  return provider.tenantId;
}

async function resolveUser(tenantId: string) {
  const envEmail = process.env.MAIL_TEST_USER_EMAIL;
  const user = await prisma.user.findFirst({
    where: {
      tenantId,
      isActive: true,
      ...(envEmail ? { email: envEmail } : {}),
    },
  });
  if (!user) throw new Error('No user found');
  return user;
}

async function resolveProviders(tenantId: string): Promise<ProviderInfo[]> {
  return prisma.providerConfig.findMany({
    where: { tenantId, isActive: true, supportsEmail: true },
    select: { id: true, providerType: true, email: true },
  });
}

function filterProvidersByEnv(providers: ProviderInfo[]): ProviderInfo[] {
  const raw = process.env.MAIL_TEST_PROVIDER_IDS;
  if (!raw) return providers;
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  return providers.filter((p) => ids.includes(p.id));
}

async function summary() {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log(`Summary: ${passed} PASS, ${failed} FAIL, ${skipped} SKIP`);
  if (failed > 0) {
    console.log('Failures:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`- ${r.name}: ${r.details || ''}`));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
