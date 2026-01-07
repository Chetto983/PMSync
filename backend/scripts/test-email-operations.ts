
/**
 * Email API validation against real providers.
 * Run: npx ts-node scripts/test-email-operations.ts
 */
import 'dotenv/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
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

const prisma = createPrismaClient();
const results: TestResult[] = [];

const API_URL = process.env.MAIL_TEST_API_URL || process.env.API_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET;

const ALLOW_FOLDER_MUTATIONS = envFlag('MAIL_TEST_ALLOW_FOLDER_MUTATIONS');
const ALLOW_FOLDER_CLEANUP = envFlag('MAIL_TEST_ALLOW_FOLDER_CLEANUP');
const ALLOW_SYNC_ALL = envFlag('MAIL_TEST_ALLOW_SYNC_ALL');
const ALLOW_CLEANUP = envFlag('MAIL_TEST_ALLOW_CLEANUP');
const ALLOW_RETENTION_RUN = envFlag('MAIL_TEST_ALLOW_RETENTION_RUN');
const ALLOW_WEBHOOK_OPS = envFlag('MAIL_TEST_ALLOW_WEBHOOK_OPS');
const ALLOW_QUEUE_ADMIN = envFlag('MAIL_TEST_ALLOW_QUEUE_ADMIN');
const ALLOW_LABEL_MUTATIONS = envFlag('MAIL_TEST_ALLOW_LABEL_MUTATIONS');
const ALLOW_CALENDAR_INVITE = envFlag('MAIL_TEST_ALLOW_CALENDAR_INVITE');

function envFlag(name: string): boolean {
  const raw = process.env[name] || '';
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
  if (err instanceof Error) return err.message;
  return String(err);
}

function assertStatus(res: AxiosResponse, allowed: number[], label: string) {
  if (!allowed.includes(res.status)) {
    const body = safeJson(res.data);
    throw new Error(`${label} unexpected status ${res.status}. Body: ${body}`);
  }
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text.length > 300 ? `${text.slice(0, 300)}...` : text;
  } catch {
    return String(value);
  }
}

function extractEmails(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.emails || [];
}

function extractConversations(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data?.conversations || [];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function main() {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is required to generate API token');
  }

  const tenantId = await resolveTenantId();
  const user = await resolveUser(tenantId);
  const providers = await resolveProviders(tenantId);
  const providerIds = filterProvidersByEnv(providers).map((p) => p.id);
  const activeProviders = providers.filter((p) => providerIds.includes(p.id));

  if (activeProviders.length === 0) {
    throw new Error('No active providers found for tenant');
  }

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

  const sampleEmails = await prisma.email.findMany({
    where: { tenantId, isDeleted: false, isDraft: false },
    orderBy: { receivedAt: 'desc' },
    take: 20,
    select: {
      id: true,
      providerId: true,
      threadId: true,
      subject: true,
      isRead: true,
      isStarred: true,
      isFlagged: true,
      folder: true,
      bodyText: true,
      bodyHtml: true,
    },
  });

  const sampleEmail = sampleEmails[0] || null;
  const bulkEmails = sampleEmails.slice(0, 3);
  const emailMissingBody = sampleEmails.find((e) => !e.bodyHtml && !e.bodyText);

  // Prefer s3-cached attachments (guaranteed to work), then Gmail/MS (stable APIs)
  // Avoid IMAP outbox attachments which are transient (moved after send)
  let attachment = await prisma.emailAttachment.findFirst({
    where: {
      email: { tenantId, isDeleted: false },
      size: { lte: 2000000 },
      storageType: 's3', // Already cached - always works
    },
    select: { id: true, emailId: true, filename: true, size: true, storageType: true },
  });

  // Fallback to Gmail/MS attachments (stable APIs)
  if (!attachment) {
    attachment = await prisma.emailAttachment.findFirst({
      where: {
        email: { tenantId, isDeleted: false, provider: { providerType: { in: ['google', 'microsoft'] } } },
        size: { lte: 2000000 },
      },
      select: { id: true, emailId: true, filename: true, size: true, storageType: true },
    });
  }

  // Last resort: IMAP from stable folders only (not outbox/drafts)
  if (!attachment) {
    attachment = await prisma.emailAttachment.findFirst({
      where: {
        email: {
          tenantId,
          isDeleted: false,
          folder: { notIn: ['outbox', 'Outbox', 'OUTBOX', 'drafts', 'Drafts', 'DRAFTS'] },
        },
        size: { lte: 2000000 },
      },
      select: { id: true, emailId: true, filename: true, size: true, storageType: true },
    });
  }

  const calendarInviteEmail = await prisma.email.findFirst({
    where: { tenantId, isDeleted: false, hasCalendarInvite: true },
    select: { id: true },
  });

  console.log(`Using tenant: ${tenantId}`);
  console.log(`Using user: ${user.email}`);
  console.log(`Providers: ${activeProviders.map((p) => `${p.providerType}:${p.email}`).join(', ')}`);

  await runTest('emails.list', async () => {
    const res = await api.get('/emails', { params: { limit: 5 } });
    assertStatus(res, [200], 'emails.list');
    const items = extractEmails(res.data);
    return { details: `count=${items.length}` };
  });

  await runTest('emails.list.byProvider', async () => {
    const res = await api.get('/emails', { params: { providerId: activeProviders[0].id, limit: 5 } });
    assertStatus(res, [200], 'emails.list.byProvider');
    const items = extractEmails(res.data);
    return { details: `count=${items.length}` };
  });

  await runTest('emails.list.specialUse', async () => {
    const res = await api.get('/emails', { params: { specialUse: 'INBOX', limit: 5 } });
    assertStatus(res, [200], 'emails.list.specialUse');
    const items = extractEmails(res.data);
    return { details: `count=${items.length}` };
  });

  if (sampleEmail?.folder) {
    await runTest('emails.list.folder', async () => {
      const res = await api.get('/emails', { params: { folder: sampleEmail.folder, limit: 5 } });
      assertStatus(res, [200], 'emails.list.folder');
      const items = extractEmails(res.data);
      return { details: `folder=${sampleEmail.folder}, count=${items.length}` };
    });
  }

  await runTest('emails.list.filters', async () => {
    const res = await api.get('/emails', {
      params: { isRead: false, isImportant: true, excludeTrashSpam: true, limit: 5 },
    });
    assertStatus(res, [200], 'emails.list.filters');
    return { details: 'filtered list ok' };
  });

  await runTest('emails.stats', async () => {
    const res = await api.get('/emails/stats');
    assertStatus(res, [200], 'emails.stats');
    return { details: `total=${res.data?.total ?? 0}` };
  });

  await runTest('emails.stats.byProvider', async () => {
    const res = await api.get('/emails/stats', { params: { providerId: activeProviders[0].id } });
    assertStatus(res, [200], 'emails.stats.byProvider');
    return { details: `total=${res.data?.total ?? 0}` };
  });

  await runTest('emails.search', async () => {
    const res = await api.get('/emails/search', { params: { q: 'test', limit: 5 } });
    assertStatus(res, [200], 'emails.search');
    const items = extractEmails(res.data);
    return { details: `count=${items.length}` };
  });

  await runTest('emails.conversations', async () => {
    const res = await api.get('/emails/conversations', { params: { limit: 5 } });
    assertStatus(res, [200], 'emails.conversations');
    const items = extractConversations(res.data);
    return { details: `count=${items.length}` };
  });
  if (sampleEmail?.threadId) {
    await runTest('emails.thread', async () => {
      const res = await api.get(`/emails/thread/${sampleEmail.threadId}`);
      assertStatus(res, [200], 'emails.thread');
      return { details: `threadId=${sampleEmail.threadId}` };
    });
  } else {
    await runTest('emails.thread', async () => ({ skip: true, details: 'no threadId available' }));
  }

  if (sampleEmail?.id) {
    await runTest('emails.get', async () => {
      const res = await api.get(`/emails/${sampleEmail.id}`);
      assertStatus(res, [200], 'emails.get');
      return { details: `subject=${(res.data?.subject || '').slice(0, 40)}` };
    });
  } else {
    await runTest('emails.get', async () => ({ skip: true, details: 'no sample email' }));
  }

  const sendProvider = activeProviders[0];
  const attachmentText = 'MailAgent test attachment';
  const attachmentBase64 = Buffer.from(attachmentText, 'utf-8').toString('base64');
  const sendSubject = `MailAgent API Test ${testSuffix}`;
  let createdEmailId: string | null = null;

  await runTest('emails.send', async () => {
    const res = await api.post('/emails/send', {
      providerId: sendProvider.id,
      to: [recipientEmail],
      subject: sendSubject,
      bodyText: `MailAgent test message ${testSuffix}`,
      bodyHtml: `<p>MailAgent test message ${testSuffix}</p>`,
      attachments: [
        {
          filename: 'mailagent-test.txt',
          contentType: 'text/plain',
          contentBase64: attachmentBase64,
          size: attachmentText.length,
        },
      ],
    });
    assertStatus(res, [200, 201], 'emails.send');
    return { details: `messageId=${res.data?.messageId || 'ok'}` };
  });

  await runTest('email-sync.sync.provider', async () => {
    const res = await api.post(`/email-sync/sync/${sendProvider.id}`);
    assertStatus(res, [200, 201], 'email-sync.sync.provider');
    return { details: 'sync queued' };
  });

  await runTest('emails.search.sent', async () => {
    const found = await pollForEmail(api, sendSubject, sendProvider.id, tenantId);
    if (!found) {
      return { skip: true, details: 'sent email not indexed yet' };
    }
    createdEmailId = found.id;
    return { details: `emailId=${found.id}` };
  });

  await runTest('emails.list.search', async () => {
    const res = await api.get('/emails', { params: { search: sendSubject, limit: 5 } });
    assertStatus(res, [200], 'emails.list.search');
    const items = extractEmails(res.data);
    return { details: `count=${items.length}` };
  });

  if (sampleEmail?.id) {
    await runTest('emails.reply', async () => {
      const res = await api.post(`/emails/${sampleEmail.id}/reply`, {
        to: [recipientEmail],
        subject: `Re: ${sampleEmail.subject || 'Test'}`,
        bodyText: `Reply test ${testSuffix}`,
        bodyHtml: `<p>Reply test ${testSuffix}</p>`,
      });
      assertStatus(res, [200, 201], 'emails.reply');
      return { details: `messageId=${res.data?.messageId || 'ok'}` };
    });

    await runTest('emails.forward', async () => {
      const res = await api.post(`/emails/${sampleEmail.id}/forward`, {
        to: [recipientEmail],
        subject: `Fwd: ${sampleEmail.subject || 'Test'}`,
        bodyText: `Forward test ${testSuffix}`,
        bodyHtml: `<p>Forward test ${testSuffix}</p>`,
      });
      assertStatus(res, [200, 201], 'emails.forward');
      return { details: `messageId=${res.data?.messageId || 'ok'}` };
    });
  } else {
    await runTest('emails.reply', async () => ({ skip: true, details: 'no sample email' }));
    await runTest('emails.forward', async () => ({ skip: true, details: 'no sample email' }));
  }

  if (sampleEmail?.id) {
    await runTest('emails.patch', async () => {
      const res = await api.patch(`/emails/${sampleEmail.id}`, { isRead: !sampleEmail.isRead });
      assertStatus(res, [200], 'emails.patch');
      await api.patch(`/emails/${sampleEmail.id}`, { isRead: sampleEmail.isRead });
      return { details: 'toggled isRead' };
    });
  }

  if (bulkEmails.length >= 2) {
    const emailIds = bulkEmails.map((e) => e.id);
    await runTest('emails.bulk.read', async () => {
      const res = await api.patch('/emails/bulk/read', { emailIds, isRead: true });
      assertStatus(res, [200], 'emails.bulk.read');
      await api.patch('/emails/bulk/read', { emailIds, isRead: false });
      return { details: `count=${emailIds.length}` };
    });

    await runTest('emails.bulk.star', async () => {
      const res = await api.patch('/emails/bulk/star', { emailIds, isStarred: true });
      assertStatus(res, [200], 'emails.bulk.star');
      await api.patch('/emails/bulk/star', { emailIds, isStarred: false });
      return { details: `count=${emailIds.length}` };
    });

    await runTest('emails.bulk.flag', async () => {
      const res = await api.patch('/emails/bulk/flag', { emailIds, isFlagged: true });
      assertStatus(res, [200], 'emails.bulk.flag');
      await api.patch('/emails/bulk/flag', { emailIds, isFlagged: false });
      return { details: `count=${emailIds.length}` };
    });

    await runTest('emails.bulk.move', async () => {
      const targetFolder = bulkEmails[0].folder;
      const res = await api.patch('/emails/bulk/move', { emailIds, folder: targetFolder });
      assertStatus(res, [200], 'emails.bulk.move');
      return { details: `folder=${targetFolder}` };
    });
  } else {
    await runTest('emails.bulk.read', async () => ({ skip: true, details: 'not enough emails' }));
    await runTest('emails.bulk.star', async () => ({ skip: true, details: 'not enough emails' }));
    await runTest('emails.bulk.flag', async () => ({ skip: true, details: 'not enough emails' }));
    await runTest('emails.bulk.move', async () => ({ skip: true, details: 'not enough emails' }));
  }
  let draftId: string | null = null;
  await runTest('emails.drafts.create', async () => {
    const res = await api.post('/emails/drafts', {
      providerId: sendProvider.id,
      to: [recipientEmail],
      subject: `Draft ${testSuffix}`,
      bodyText: `Draft body ${testSuffix}`,
      bodyHtml: `<p>Draft body ${testSuffix}</p>`,
      attachments: [
        {
          filename: 'draft.txt',
          contentType: 'text/plain',
          contentBase64: attachmentBase64,
          size: attachmentText.length,
        },
      ],
    });
    assertStatus(res, [200, 201], 'emails.drafts.create');
    draftId = res.data?.id || res.data?.draft?.id || null;
    return { details: `draftId=${draftId || 'n/a'}` };
  });

  if (draftId) {
    await runTest('emails.drafts.get', async () => {
      const res = await api.get(`/emails/drafts/${draftId}`);
      assertStatus(res, [200], 'emails.drafts.get');
      return { details: `draftId=${draftId}` };
    });

    await runTest('emails.drafts.update', async () => {
      const res = await api.post('/emails/drafts', {
        id: draftId,
        providerId: sendProvider.id,
        to: [recipientEmail],
        subject: `Draft Updated ${testSuffix}`,
        bodyText: `Draft updated ${testSuffix}`,
        bodyHtml: `<p>Draft updated ${testSuffix}</p>`,
      });
      assertStatus(res, [200, 201], 'emails.drafts.update');
      return { details: `draftId=${draftId}` };
    });

    await runTest('emails.drafts.delete', async () => {
      const res = await api.delete(`/emails/drafts/${draftId}`);
      assertStatus(res, [204], 'emails.drafts.delete');
      return { details: `draftId=${draftId}` };
    });
  } else {
    await runTest('emails.drafts.get', async () => ({ skip: true, details: 'draft not created' }));
    await runTest('emails.drafts.update', async () => ({ skip: true, details: 'draft not created' }));
    await runTest('emails.drafts.delete', async () => ({ skip: true, details: 'draft not created' }));
  }

  if (emailMissingBody?.id) {
    await runTest('emails.fetch-archived', async () => {
      const res = await api.post(`/emails/${emailMissingBody.id}/fetch-archived`);
      assertStatus(res, [200, 201], 'emails.fetch-archived');
      return { details: `emailId=${emailMissingBody.id}` };
    });
  } else {
    await runTest('emails.fetch-archived', async () => ({ skip: true, details: 'no email missing body' }));
  }

  if (calendarInviteEmail?.id) {
    await runTest('emails.calendar-invite.get', async () => {
      const res = await api.get(`/emails/${calendarInviteEmail.id}/calendar-invite`);
      assertStatus(res, [200], 'emails.calendar-invite.get');
      return { details: `emailId=${calendarInviteEmail.id}` };
    });
  } else if (sampleEmail?.id) {
    await runTest('emails.calendar-invite.get', async () => {
      const res = await api.get(`/emails/${sampleEmail.id}/calendar-invite`);
      assertStatus(res, [404], 'emails.calendar-invite.get');
      return { details: 'no invite found' };
    });
  }

  if (ALLOW_CALENDAR_INVITE) {
    let createdEventId: string | null = null;
    await runTest('emails.calendar-invite.send', async () => {
      const start = new Date(Date.now() + 3600000);
      const end = new Date(start.getTime() + 3600000);
      const res = await api.post('/emails/calendar-invite/send', {
        providerId: sendProvider.id,
        to: [{ email: recipientEmail }],
        summary: `MailAgent Invite ${testSuffix}`,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      });
      assertStatus(res, [200, 201, 404], 'emails.calendar-invite.send'); // 404 if provider doesn't support calendar
      createdEventId = res.data?.eventId || null;
      return { details: `eventId=${createdEventId || 'n/a'}` };
    });

    if (createdEventId) {
      await runTest('emails.calendar-invite.cancel', async () => {
        const res = await api.post(`/emails/calendar-invite/${createdEventId}/cancel`, { reason: 'Test cancel' });
        assertStatus(res, [200, 201], 'emails.calendar-invite.cancel');
        return { details: `eventId=${createdEventId}` };
      });
    } else {
      await runTest('emails.calendar-invite.cancel', async () => ({ skip: true, details: 'no eventId' }));
    }
  } else {
    await runTest('emails.calendar-invite.send', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_CALENDAR_INVITE=false' }));
    await runTest('emails.calendar-invite.cancel', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_CALENDAR_INVITE=false' }));
  }

  if (calendarInviteEmail?.id) {
    await runTest('emails.calendar-invite.respond', async () => {
      const res = await api.post(`/emails/${calendarInviteEmail.id}/calendar-invite/respond`, { response: 'accept' });
      assertStatus(res, [200], 'emails.calendar-invite.respond');
      return { details: `emailId=${calendarInviteEmail.id}` };
    });
  } else if (sampleEmail?.id) {
    await runTest('emails.calendar-invite.respond', async () => {
      const res = await api.post(`/emails/${sampleEmail.id}/calendar-invite/respond`, { response: 'accept' });
      assertStatus(res, [404], 'emails.calendar-invite.respond');
      return { details: 'no invite found' };
    });
  }

  if (attachment) {
    await runTest('emails.attachments.download', async () => {
      const res = await api.get(`/emails/${attachment.emailId}/attachments/${attachment.id}/download`, {
        maxRedirects: 0,
        validateStatus: () => true,
      });
      assertStatus(res, [302, 200], 'emails.attachments.download');
      return { details: `attachmentId=${attachment.id}` };
    });

    await runTest('email.attachments.metadata', async () => {
      const res = await api.get(`/email/attachments/${attachment.id}/metadata`);
      assertStatus(res, [200], 'email.attachments.metadata');
      return { details: `filename=${attachment.filename}` };
    });

    await runTest('email.attachments.download', async () => {
      const res = await api.get(`/email/attachments/${attachment.id}/download`, {
        responseType: 'stream',
      });
      assertStatus(res, [200], 'email.attachments.download');
      res.data.destroy();
      return { details: `attachmentId=${attachment.id}` };
    });
  } else {
    await runTest('emails.attachments.download', async () => ({ skip: true, details: 'no attachment found' }));
    await runTest('email.attachments.metadata', async () => ({ skip: true, details: 'no attachment found' }));
    await runTest('email.attachments.download', async () => ({ skip: true, details: 'no attachment found' }));
  }
  await runTest('folders.metadata', async () => {
    const res = await api.get('/folders/metadata');
    assertStatus(res, [200], 'folders.metadata');
    return { details: `systemFolders=${(res.data?.systemFolders || []).length}` };
  });

  await runTest('folders.list', async () => {
    const res = await api.get('/folders');
    assertStatus(res, [200], 'folders.list');
    return { details: `providers=${(res.data?.providers || []).length}` };
  });

  for (const provider of activeProviders) {
    await runTest(`folders.provider.${provider.providerType}`, async () => {
      const res = await api.get(`/folders/provider/${provider.id}`);
      assertStatus(res, [200], `folders.provider.${provider.providerType}`);
      return { details: `count=${(res.data?.folders || []).length}` };
    });

    await runTest(`folders.sync.${provider.providerType}`, async () => {
      const res = await api.post(`/folders/sync/${provider.id}`);
      assertStatus(res, [200, 201], `folders.sync.${provider.providerType}`);
      return { details: `folders=${res.data?.foldersCount ?? 0}` };
    });

    await runTest(`folders.update-counts.${provider.providerType}`, async () => {
      const res = await api.post(`/folders/update-counts/${provider.id}`);
      assertStatus(res, [200, 201], `folders.update-counts.${provider.providerType}`);
      return { details: res.data?.message || 'ok' };
    });

    await runTest(`folders.audit.${provider.providerType}`, async () => {
      const res = await api.get(`/folders/audit/${provider.id}`);
      assertStatus(res, [200], `folders.audit.${provider.providerType}`);
      return { details: `orphaned=${res.data?.orphanedCount ?? 0}` };
    });

    if (ALLOW_FOLDER_CLEANUP) {
      await runTest(`folders.cleanup.${provider.providerType}`, async () => {
        const res = await api.post(`/folders/cleanup/${provider.id}`);
        assertStatus(res, [200, 201], `folders.cleanup.${provider.providerType}`);
        return { details: `removed=${res.data?.deletedCount ?? 0}` };
      });
    } else {
      await runTest(`folders.cleanup.${provider.providerType}`, async () => ({
        skip: true,
        details: 'MAIL_TEST_ALLOW_FOLDER_CLEANUP=false',
      }));
    }
  }

  await runTest('folders.queue.status', async () => {
    const res = await api.get('/folders/queue/status');
    assertStatus(res, [200], 'folders.queue.status');
    return { details: `waiting=${res.data?.waiting ?? 0}` };
  });

  await runTest('folders.queue.job', async () => {
    const res = await api.get('/folders/queue/job/invalid-job-id');
    assertStatus(res, [404], 'folders.queue.job');
    return { details: 'validated 404 for missing job' };
  });

  if (ALLOW_FOLDER_MUTATIONS) {
    let folderId: string | null = null;
    await runTest('folders.create', async () => {
      const res = await api.post('/folders', { providerId: sendProvider.id, name: `MailAgent-Test-${testSuffix}` });
      assertStatus(res, [200, 201], 'folders.create');
      folderId = res.data?.id || null;
      return { details: `folderId=${folderId || 'n/a'}` };
    });

    if (folderId) {
      await runTest('folders.rename', async () => {
        const res = await api.patch(`/folders/${folderId}`, { newName: `MailAgent-Test-${testSuffix}-Renamed` });
        assertStatus(res, [200], 'folders.rename');
        return { details: `folderId=${folderId}` };
      });

      await runTest('folders.delete', async () => {
        const res = await api.delete(`/folders/${folderId}`);
        assertStatus(res, [200, 400], 'folders.delete'); // 400 if IMAP provider doesn't support deletion
        return { details: `folderId=${folderId}, status=${res.status}` };
      });
    }
  } else {
    await runTest('folders.create', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_FOLDER_MUTATIONS=false' }));
    await runTest('folders.rename', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_FOLDER_MUTATIONS=false' }));
    await runTest('folders.delete', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_FOLDER_MUTATIONS=false' }));
  }

  if (ALLOW_SYNC_ALL) {
    await runTest('folders.sync-all', async () => {
      const res = await api.post('/folders/sync-all');
      assertStatus(res, [200, 201], 'folders.sync-all');
      return { details: `providers=${res.data?.results?.length ?? 0}` };
    });
  } else {
    await runTest('folders.sync-all', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_SYNC_ALL=false' }));
  }

  const labelsListRes = await api.get('/labels');
  const labelsFeatureEnabled = labelsListRes.status === 200;

  await runTest('labels.list', async () => {
    if (!labelsFeatureEnabled) {
      assertStatus(labelsListRes, [403], 'labels.list');
      return { details: 'labels feature disabled' };
    }
    return { details: `count=${(labelsListRes.data?.labels || []).length}` };
  });

  let labelId: string | null = null;
  if (labelsFeatureEnabled && ALLOW_LABEL_MUTATIONS) {
    await runTest('labels.create', async () => {
      const res = await api.post('/labels', { name: `MailAgent Label ${testSuffix}` });
      assertStatus(res, [201], 'labels.create');
      labelId = res.data?.label?.id || null;
      return { details: `labelId=${labelId || 'n/a'}` };
    });

    if (labelId) {
      await runTest('labels.get', async () => {
        const res = await api.get(`/labels/${labelId}`);
        assertStatus(res, [200], 'labels.get');
        return { details: `labelId=${labelId}` };
      });

      await runTest('labels.update', async () => {
        const res = await api.put(`/labels/${labelId}`, { name: `MailAgent Label ${testSuffix} Updated` });
        assertStatus(res, [200], 'labels.update');
        return { details: `labelId=${labelId}` };
      });

      if (sampleEmail?.id) {
        await runTest('labels.add-emails', async () => {
          const res = await api.post(`/labels/${labelId}/emails`, { emailIds: [sampleEmail.id] });
          assertStatus(res, [200, 201], 'labels.add-emails');
          return { details: `emailId=${sampleEmail.id}` };
        });

        await runTest('labels.get-emails', async () => {
          const res = await api.get(`/labels/${labelId}/emails`);
          assertStatus(res, [200], 'labels.get-emails');
          return { details: `count=${(res.data?.emails || []).length}` };
        });

        await runTest('labels.remove-email', async () => {
          const res = await api.delete(`/labels/${labelId}/emails/${sampleEmail.id}`);
          assertStatus(res, [200], 'labels.remove-email');
          return { details: `emailId=${sampleEmail.id}` };
        });
      }

      const listRes = await api.get('/labels');
      const listIds = (listRes.data?.labels || []).map((l: any) => l.id);
      if (listIds.length > 0) {
        await runTest('labels.reorder', async () => {
          const res = await api.post('/labels/reorder', { labelIds: listIds });
          assertStatus(res, [204], 'labels.reorder');
          return { details: `count=${listIds.length}` };
        });
      }

      await runTest('emails.list.labelIds', async () => {
        const res = await api.get('/emails', { params: { labelIds: labelId, limit: 5 } });
        assertStatus(res, [200], 'emails.list.labelIds');
        const items = extractEmails(res.data);
        return { details: `count=${items.length}` };
      });

      await runTest('labels.delete', async () => {
        const res = await api.delete(`/labels/${labelId}`);
        assertStatus(res, [204], 'labels.delete');
        return { details: `labelId=${labelId}` };
      });
    }
  } else if (!labelsFeatureEnabled) {
    await runTest('labels.create', async () => ({ skip: true, details: 'labels feature disabled' }));
    await runTest('labels.get', async () => ({ skip: true, details: 'labels feature disabled' }));
    await runTest('labels.update', async () => ({ skip: true, details: 'labels feature disabled' }));
    await runTest('labels.add-emails', async () => ({ skip: true, details: 'labels feature disabled' }));
    await runTest('labels.get-emails', async () => ({ skip: true, details: 'labels feature disabled' }));
    await runTest('labels.remove-email', async () => ({ skip: true, details: 'labels feature disabled' }));
    await runTest('labels.reorder', async () => ({ skip: true, details: 'labels feature disabled' }));
    await runTest('emails.list.labelIds', async () => ({ skip: true, details: 'labels feature disabled' }));
    await runTest('labels.delete', async () => ({ skip: true, details: 'labels feature disabled' }));
  } else {
    await runTest('labels.create', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
    await runTest('labels.get', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
    await runTest('labels.update', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
    await runTest('labels.add-emails', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
    await runTest('labels.get-emails', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
    await runTest('labels.remove-email', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
    await runTest('labels.reorder', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
    await runTest('emails.list.labelIds', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
    await runTest('labels.delete', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_LABEL_MUTATIONS=false' }));
  }

  if (labelId && bulkEmails.length > 0) {
    const emailIds = bulkEmails.map((e) => e.id);
    await runTest('emails.bulk.labels.add', async () => {
      const res = await api.patch('/emails/bulk/labels/add', { emailIds, labelIds: [labelId] });
      assertStatus(res, [200], 'emails.bulk.labels.add');
      return { details: `count=${emailIds.length}` };
    });

    await runTest('emails.bulk.labels.remove', async () => {
      const res = await api.patch('/emails/bulk/labels/remove', { emailIds, labelIds: [labelId] });
      assertStatus(res, [200], 'emails.bulk.labels.remove');
      return { details: `count=${emailIds.length}` };
    });
  } else {
    await runTest('emails.bulk.labels.add', async () => ({ skip: true, details: 'label not available' }));
    await runTest('emails.bulk.labels.remove', async () => ({ skip: true, details: 'label not available' }));
  }
  await runTest('email-sync.status', async () => {
    const res = await api.get('/email-sync/status');
    assertStatus(res, [200], 'email-sync.status');
    return { details: 'ok' };
  });

  await runTest('email-sync.health', async () => {
    const res = await api.get('/email-sync/health');
    assertStatus(res, [200], 'email-sync.health');
    return { details: 'ok' };
  });

  await runTest('email-sync.queues', async () => {
    const res = await api.get('/email-sync/queues');
    assertStatus(res, [200], 'email-sync.queues');
    return { details: `queues=${Array.isArray(res.data) ? res.data.length : 0}` };
  });

  if (ALLOW_SYNC_ALL) {
    await runTest('email-sync.sync-all', async () => {
      const res = await api.post('/email-sync/sync-all');
      assertStatus(res, [200, 201], 'email-sync.sync-all');
      return { details: res.data?.message || 'ok' };
    });
  } else {
    await runTest('email-sync.sync-all', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_SYNC_ALL=false' }));
  }

  if (user.role !== 'super-admin') {
    await runTest('email-sync.queue.pause', async () => {
      const res = await api.post('/email-sync/queues/low/pause');
      assertStatus(res, [403], 'email-sync.queue.pause');
      return { details: 'forbidden as expected' };
    });

    await runTest('email-sync.queue.resume', async () => {
      const res = await api.post('/email-sync/queues/low/resume');
      assertStatus(res, [403], 'email-sync.queue.resume');
      return { details: 'forbidden as expected' };
    });

    await runTest('email-sync.queue.clear', async () => {
      const res = await api.post('/email-sync/queues/low/clear');
      assertStatus(res, [403], 'email-sync.queue.clear');
      return { details: 'forbidden as expected' };
    });
  } else if (ALLOW_QUEUE_ADMIN) {
    await runTest('email-sync.queue.pause', async () => {
      const res = await api.post('/email-sync/queues/low/pause');
      assertStatus(res, [200], 'email-sync.queue.pause');
      return { details: res.data?.message || 'paused' };
    });

    await runTest('email-sync.queue.resume', async () => {
      const res = await api.post('/email-sync/queues/low/resume');
      assertStatus(res, [200], 'email-sync.queue.resume');
      return { details: res.data?.message || 'resumed' };
    });

    await runTest('email-sync.queue.clear', async () => {
      const res = await api.post('/email-sync/queues/low/clear');
      assertStatus(res, [200], 'email-sync.queue.clear');
      return { details: res.data?.message || 'cleared' };
    });
  } else {
    await runTest('email-sync.queue.pause', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_QUEUE_ADMIN=false' }));
    await runTest('email-sync.queue.resume', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_QUEUE_ADMIN=false' }));
    await runTest('email-sync.queue.clear', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_QUEUE_ADMIN=false' }));
  }

  if (ALLOW_WEBHOOK_OPS) {
    await runTest('email-sync.webhooks.create-all', async () => {
      const res = await api.post('/email-sync/webhooks/create-all');
      assertStatus(res, [200, 201], 'email-sync.webhooks.create-all');
      return { details: `created=${res.data?.created ?? 0}` };
    });

    await runTest('email-sync.webhooks.renew', async () => {
      const res = await api.post('/email-sync/webhooks/renew');
      assertStatus(res, [200, 201], 'email-sync.webhooks.renew');
      return { details: res.data?.message || 'renewed' };
    });
  } else {
    await runTest('email-sync.webhooks.create-all', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_WEBHOOK_OPS=false' }));
    await runTest('email-sync.webhooks.renew', async () => ({ skip: true, details: 'MAIL_TEST_ALLOW_WEBHOOK_OPS=false' }));
  }

  await runTest('email-sync.webhooks.health', async () => {
    const res = await api.get('/email-sync/webhooks/health');
    assertStatus(res, [200], 'email-sync.webhooks.health');
    return { details: 'ok' };
  });

  await runTest('email-sync.alerts', async () => {
    const res = await api.get('/email-sync/alerts');
    assertStatus(res, [200], 'email-sync.alerts');
    return { details: `alerts=${res.data?.alerts?.length ?? 0}` };
  });

  await runTest('providers.list', async () => {
    const res = await api.get('/providers');
    assertStatus(res, [200], 'providers.list');
    return { details: `count=${Array.isArray(res.data) ? res.data.length : 0}` };
  });

  for (const provider of activeProviders) {
    await runTest(`providers.get.${provider.providerType}`, async () => {
      const res = await api.get(`/providers/${provider.id}`);
      assertStatus(res, [200], `providers.get.${provider.providerType}`);
      return { details: provider.email };
    });

    await runTest(`providers.aliases.${provider.providerType}`, async () => {
      const res = await api.get(`/providers/${provider.id}/aliases`);
      assertStatus(res, [200], `providers.aliases.${provider.providerType}`);
      return { details: `aliases=${res.data?.length ?? 0}` };
    });

    if (provider.providerType === 'google') {
      await runTest('providers.test.gmail-labels', async () => {
        const res = await api.get(`/providers/${provider.id}/test/gmail-labels`);
        assertStatus(res, [200], 'providers.test.gmail-labels');
        return { details: 'ok' };
      });

      await runTest('providers.test.gmail-messages', async () => {
        const res = await api.get(`/providers/${provider.id}/test/gmail-messages`);
        assertStatus(res, [200], 'providers.test.gmail-messages');
        return { details: 'ok' };
      });
    }

    if (provider.providerType === 'microsoft') {
      await runTest('providers.test.mail-folders', async () => {
        const res = await api.get(`/providers/${provider.id}/test/mail-folders`);
        assertStatus(res, [200], 'providers.test.mail-folders');
        return { details: 'ok' };
      });

      await runTest('providers.test.mail-messages', async () => {
        const res = await api.get(`/providers/${provider.id}/test/mail-messages`);
        assertStatus(res, [200], 'providers.test.mail-messages');
        return { details: 'ok' };
      });
    }

    if (provider.providerType === 'generic') {
      await runTest('providers.test.imap-connection', async () => {
        const res = await api.get(`/providers/${provider.id}/test/imap-connection`);
        assertStatus(res, [200], 'providers.test.imap-connection');
        return { details: 'ok' };
      });

      await runTest('providers.test.imap-folders', async () => {
        const res = await api.get(`/providers/${provider.id}/test/imap-folders`);
        assertStatus(res, [200], 'providers.test.imap-folders');
        return { details: 'ok' };
      });

      await runTest('providers.test.imap-messages', async () => {
        const res = await api.get(`/providers/${provider.id}/test/imap-messages`);
        assertStatus(res, [200], 'providers.test.imap-messages');
        return { details: 'ok' };
      });

      await runTest('providers.test.smtp-connection', async () => {
        const res = await api.get(`/providers/${provider.id}/test/smtp-connection`);
        assertStatus(res, [200], 'providers.test.smtp-connection');
        return { details: 'ok' };
      });
    }
  }

  await runTest('emails.maintenance.cleanup', async () => {
    if (user.role !== 'admin' && user.role !== 'super-admin') {
      const res = await api.post('/emails/maintenance/cleanup');
      assertStatus(res, [403], 'emails.maintenance.cleanup');
      return { details: 'forbidden as expected' };
    }
    if (!ALLOW_CLEANUP) {
      return { skip: true, details: 'MAIL_TEST_ALLOW_CLEANUP=false' };
    }
    const res = await api.post('/emails/maintenance/cleanup');
    assertStatus(res, [200, 201], 'emails.maintenance.cleanup');
    return { details: 'cleanup ok' };
  });

  await runTest('emails.retention.stats', async () => {
    const res = await api.get('/emails/retention/stats');
    const expected = user.role === 'admin' || user.role === 'super-admin' ? [200] : [403];
    assertStatus(res, expected, 'emails.retention.stats');
    return { details: res.status === 200 ? 'stats ok' : 'forbidden' };
  });

  await runTest('emails.retention.run', async () => {
    if (user.role !== 'super-admin') {
      const res = await api.post('/emails/retention/run', { retentionDays: 1 });
      assertStatus(res, [403], 'emails.retention.run');
      return { details: 'forbidden as expected' };
    }
    if (!ALLOW_RETENTION_RUN) {
      return { skip: true, details: 'MAIL_TEST_ALLOW_RETENTION_RUN=false' };
    }
    const res = await api.post('/emails/retention/run', { retentionDays: 1 });
    assertStatus(res, [200], 'emails.retention.run');
    return { details: 'run ok' };
  });

  await runTest('emails.bulk.delete', async () => {
    const emailIds = createdEmailId ? [createdEmailId] : ['missing-email-id'];
    const res = await api.delete('/emails/bulk', { data: { emailIds } });
    assertStatus(res, [200], 'emails.bulk.delete');
    return { details: `count=${emailIds.length}` };
  });

  await runTest('emails.delete', async () => {
    const targetId = createdEmailId || 'missing-email-id';
    const res = await api.delete(`/emails/${targetId}`);
    assertStatus(res, [204, 404], 'emails.delete');
    return { details: `emailId=${targetId}` };
  });

  await runTest('webhooks.health', async () => {
    const res = await api.get('/webhooks/health');
    assertStatus(res, [200], 'webhooks.health');
    return { details: 'ok' };
  });

  await summary();
  await prisma.$disconnect();
}
async function resolveTenantId(): Promise<string> {
  const envTenant = process.env.MAIL_TEST_TENANT_ID;
  if (envTenant) return envTenant;
  const provider = await prisma.providerConfig.findFirst({
    where: { isActive: true, supportsEmail: true },
    select: { tenantId: true },
  });
  if (!provider?.tenantId) throw new Error('No active provider found to infer tenantId');
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
  if (!user) throw new Error('No active user found for tenant');
  return user;
}

async function resolveProviders(tenantId: string) {
  return prisma.providerConfig.findMany({
    where: { tenantId, isActive: true, supportsEmail: true },
    select: { id: true, email: true, providerType: true },
  });
}

function filterProvidersByEnv(providers: Array<{ id: string }>) {
  const raw = process.env.MAIL_TEST_PROVIDER_IDS;
  if (!raw) return providers;
  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  return providers.filter((p) => ids.includes(p.id));
}

async function pollForEmail(api: AxiosInstance, subject: string, providerId: string, tenantId: string) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await api.get('/emails/search', { params: { q: subject, providerId, limit: 5 } });
    if (res.status === 200) {
      const items = extractEmails(res.data);
      if (items.length > 0) {
        return { id: items[0].id, threadId: items[0].threadId };
      }
    }
    await sleep(5000);
  }

  const fallback = await prisma.email.findFirst({
    where: { tenantId, providerId, subject },
    select: { id: true, threadId: true },
  });

  return fallback ? { id: fallback.id, threadId: fallback.threadId } : null;
}

async function summary() {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log('--- Email validation summary ---');
  console.log(`Total: ${results.length}`);
  console.log(`PASS: ${passed}`);
  console.log(`FAIL: ${failed}`);
  console.log(`SKIP: ${skipped}`);

  if (failed > 0) {
    console.log('Failed tests:');
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
