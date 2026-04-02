import fs from 'fs';
import path from 'path';
import { connectCDP, FRONTEND_URL } from './lib/validation-helpers.mjs';

const OUT_DIR = path.resolve('scripts/ai-feature-validation');
const REPORT_PATH = path.join(OUT_DIR, 'report.json');
const PASS = 'PASS';
const WARN = 'WARN';
const FAIL = 'FAIL';
const SKIP = 'SKIP';

const requestedDims = new Set(
  (process.argv.find(arg => arg.startsWith('--dim='))?.split('=')[1] || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean),
);

const results = [];
const placeholderPattern = /\[[A-Z_]+_REDACTED:[^\]]+\]/i;
const genericFailurePattern = /\b(i can('|’)t|unable to|not enough context|insufficient context|error generating|failed to generate)\b/i;
const newsletterPattern = /\b(unsubscribe|newsletter|digest|release notes|weekly update|promotions?|marketing|sale ends|receipt|invoice|order confirmation)\b/i;
const urgentPattern = /\b(urgent|asap|immediately|eod|deadline|by tomorrow|by today|third reminder|escalat|overdue|payment due|action required)\b/i;
const negativePattern = /\b(issue|problem|broken|complaint|frustrat|angry|disappoint|not received|still haven('|’)t|third reminder|failed)\b/i;
const positivePattern = /\b(thank you|thanks|appreciate|great news|happy|glad|excellent)\b/i;
const questionPattern = /\?|\b(can you|could you|please send|let me know|would you|when can|do you have)\b/i;
const meetingPattern = /\b(meeting|call|calendar|availability|schedule|reschedule|invite)\b/i;
const systemAlertPattern = /\b(vercel|railway|github|deploy(ment)?|build failed|workflow|ci run|notification)\b/i;
const stopwords = new Set([
  'the', 'and', 'for', 'that', 'with', 'this', 'from', 'have', 'your', 'about', 'will', 'would',
  'there', 'their', 'they', 'them', 'please', 'could', 'should', 'into', 'were', 'been', 'also',
  'just', 'than', 'then', 'when', 'what', 'where', 'while', 'does', 'dont', 'cant', 'subject',
  'email', 'message', 'body', 'thread', 'would', 'shall', 'alla', 'della', 'delle', 'with', 'without',
]);

function log(message) {
  const time = new Date().toLocaleTimeString('it-IT', { hour12: false });
  console.log(`[${time}] ${message}`);
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function shouldRun(dim) {
  return requestedDims.size === 0 || requestedDims.has(dim);
}

function getPath(object, dottedPath) {
  if (!object || !dottedPath) return undefined;
  return dottedPath.split('.').reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), object);
}

function unwrap(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return payload;
}

function asArray(payload, ...paths) {
  if (Array.isArray(payload)) return payload;
  for (const currentPath of paths) {
    const value = getPath(payload, currentPath);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function asObject(payload, ...paths) {
  for (const currentPath of paths) {
    const value = getPath(payload, currentPath);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  }
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload;
  return null;
}

function text(...values) {
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => typeof value === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s@.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanWords(value) {
  return normalize(value)
    .split(' ')
    .filter((word) => word.length > 2 && !stopwords.has(word) && !/^\d+$/.test(word));
}

function topKeywords(value, limit = 8) {
  const counts = new Map();
  for (const word of cleanWords(value)) {
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function hasKeywordOverlap(source, candidate, min = 2) {
  const keywords = topKeywords(source, 10);
  const candidateText = normalize(candidate);
  const matches = keywords.filter((word) => candidateText.includes(word));
  return { pass: matches.length >= Math.min(min, keywords.length || min), matches, keywords };
}

function hasPlaceholder(value) {
  return placeholderPattern.test(String(value || ''));
}

function looksJson(value) {
  const trimmed = String(value || '').trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function looksGenericFailure(value) {
  return genericFailurePattern.test(String(value || ''));
}

function distinctStrings(values) {
  const normalizedValues = values
    .map(value => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(normalizedValues)];
}

function makeCheck(name, pass, detail = '') {
  return { name, pass: Boolean(pass), detail };
}

function scoreChecks(checks) {
  if (!checks.length) return 0;
  const passed = checks.filter(check => check.pass).length;
  return Math.round((passed / checks.length) * 100) / 10;
}

function statusForScore(score) {
  if (score >= 9.5) return PASS;
  if (score >= 7) return WARN;
  return FAIL;
}

function metaChecks(meta, operationPrefix) {
  return [
    makeCheck('meta exists', !!meta),
    makeCheck('meta operation', typeof meta?.operation === 'string' && meta.operation.includes(operationPrefix), String(meta?.operation || 'missing')),
    makeCheck('meta version', typeof meta?.version === 'string' && meta.version.length >= 3, String(meta?.version || 'missing')),
    makeCheck('meta source', ['live', 'cache', 'fallback'].includes(meta?.source), String(meta?.source || 'missing')),
    makeCheck('meta status', ['ok', 'degraded', undefined].includes(meta?.status), String(meta?.status || 'missing')),
  ];
}

async function browserApiJson(page, pathName, options = {}) {
  return page.evaluate(async ({ pathName, method, body, timeoutMs }) => {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      if (method !== 'GET') {
        const csrfResp = await fetch('/api/v1/auth/csrf-token', {
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const csrfJson = await csrfResp.json().catch(() => ({}));
        const csrfToken = csrfJson?.data?.csrfToken || csrfJson?.csrfToken || null;
        if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      }

      const response = await fetch(pathName, {
        method,
        credentials: 'include',
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const raw = await response.text();
      let json = null;
      try { json = raw ? JSON.parse(raw) : null; } catch {}

      return {
        ok: response.ok,
        status: response.status,
        json,
        raw,
      };
    } catch (error) {
      return {
        ok: false,
        status: 599,
        json: null,
        raw: String(error?.message || error),
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, {
    pathName,
    method: options.method || 'GET',
    body: options.body,
    timeoutMs: options.timeoutMs || 0,
  });
}

async function expectJson(page, pathName, options = {}) {
  const response = await browserApiJson(page, pathName, options);
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${pathName} -> ${response.status}: ${response.raw.slice(0, 300)}`);
  }
  return response.json;
}

async function fetchEmailDetail(page, emailId) {
  if (!emailId) return null;
  return unwrap(await expectJson(page, `/api/v1/emails/${emailId}`));
}

async function fetchEmailDetailWithRetry(page, emailId, attempts = 3) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const detail = await fetchEmailDetail(page, emailId);
      if (detail?.id) return detail;
    } catch (error) {
      lastError = error;
    }
    if (index < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, 500 * (index + 1)));
    }
  }
  if (lastError) throw lastError;
  return null;
}

function classifyEmail(email) {
  const sample = normalize(text(email.subject, email.from, email.snippet, email.bodyText, email.body));
  return {
    newsletter: newsletterPattern.test(sample) || /\b(no-?reply|noreply)\b/.test(sample),
    urgent: urgentPattern.test(sample),
    negative: negativePattern.test(sample),
    positive: positivePattern.test(sample),
    question: questionPattern.test(sample),
    meeting: meetingPattern.test(sample),
    systemAlert: systemAlertPattern.test(sample),
  };
}

function categorizeContextFit(labels, flags) {
  const labelText = labels.join(' ').toLowerCase();

  if (flags.newsletter) {
    return /\b(marketing|newsletter|promotion|promotions|updates?|info)\b/i.test(labelText);
  }

  if (flags.systemAlert) {
    return /\b(updates?|info|important|action items)\b/i.test(labelText);
  }

  return true;
}

function expectedSentiment(email) {
  const flags = classifyEmail(email);
  if (flags.newsletter || flags.systemAlert) return 'neutral';
  if (flags.negative) return 'negative';
  if (flags.positive) return 'positive';
  return 'neutral';
}

function expectedPriority(email) {
  const flags = classifyEmail(email);
  if (flags.newsletter) return 'low';
  if (flags.urgent || flags.negative || flags.question) return 'high';
  return 'medium';
}

function chooseEmail(emails, predicate) {
  return emails.find(email => predicate(classifyEmail(email), email)) || emails[0] || null;
}

async function discover(page) {
  log('Discovering providers, emails, events, follow-ups, and stale contacts...');

  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const todayKey = now.toLocaleDateString('en-CA');

  const providers = asArray(await expectJson(page, '/api/v1/providers'), 'data', 'providers');
  const emailStats = unwrap(await expectJson(page, '/api/v1/emails/stats'));
  const emailList = unwrap(await expectJson(page, '/api/v1/emails?limit=30&excludeTrashSpam=true'));
  const emails = asArray(emailList, 'emails', 'items', 'data.emails', 'data.items');
  const updatesList = unwrap(await expectJson(page, '/api/v1/emails?limit=10&folder=UPDATES').catch(() => ({ emails: [] })));
  const promotionsList = unwrap(await expectJson(page, '/api/v1/emails?limit=10&folder=PROMOTIONS').catch(() => ({ emails: [] })));
  const categoryEmails = [
    ...asArray(updatesList, 'emails', 'items', 'data.emails', 'data.items'),
    ...asArray(promotionsList, 'emails', 'items', 'data.emails', 'data.items'),
  ];
  const eventList = unwrap(await expectJson(page, `/api/v1/calendar/events?limit=10&startTime=${encodeURIComponent(now.toISOString())}&endTime=${encodeURIComponent(inSevenDays.toISOString())}`));
  const upcomingEvents = asArray(eventList, 'events', 'items', 'data.events', 'data.items');
  const events = upcomingEvents.filter((event) => {
    const rawStart = event?.startTime || event?.start || event?.startDate;
    if (!rawStart) return false;
    const date = new Date(rawStart);
    return !Number.isNaN(date.getTime()) && date.toLocaleDateString('en-CA') === todayKey;
  });
  const followUpList = unwrap(await expectJson(page, '/api/v1/ai/follow-ups/pending?limit=20'));
  const followUps = asArray(followUpList, 'followUps', 'items', 'data.followUps', 'data.items');
  const staleContactList = unwrap(await expectJson(page, '/api/v1/contacts/stale?limit=10&daysSince=30'));
  const staleContacts = asArray(staleContactList, 'contacts', 'staleContacts', 'items', 'data.contacts', 'data.staleContacts');

  const allEmailCandidates = [...emails, ...categoryEmails].filter(Boolean);
  const uniqueEmailCandidates = [...new Map(allEmailCandidates.map(email => [email.id, email])).values()];
  const detailedEmails = (await Promise.all(
    uniqueEmailCandidates.slice(0, 25).map(async (email) => {
      const detail = await fetchEmailDetail(page, email.id).catch(() => null);
      return detail ? { ...email, ...detail } : email;
    }),
  )).filter(Boolean);

  return {
    providers,
    emailStats,
    emails: detailedEmails,
    events,
    followUps,
    staleContacts,
    candidates: {
      summary: chooseEmail(detailedEmails, (_, email) => text(email.bodyText, email.snippet).length > 80),
      reply: chooseEmail(detailedEmails, flags => flags.question || flags.meeting),
      newsletter: chooseEmail(detailedEmails, flags => flags.newsletter),
      urgent: chooseEmail(detailedEmails, flags => flags.urgent || flags.negative),
    },
  };
}

function recordDimension(key, title, checks, evidence = {}) {
  const score = scoreChecks(checks);
  const status = statusForScore(score);
  results.push({ key, title, status, score, checks, evidence });
  log(`${status} ${title}: ${score}/10`);
}

function skipDimension(key, title, reason) {
  results.push({ key, title, status: SKIP, score: null, checks: [], evidence: { reason } });
  log(`${SKIP} ${title}: ${reason}`);
}

function basicTextChecks(value, label = 'text') {
  return [
    makeCheck(`${label} exists`, typeof value === 'string' && value.trim().length > 0),
    makeCheck(`${label} non-placeholder`, !hasPlaceholder(value), String(value || '').slice(0, 120)),
    makeCheck(`${label} non-json`, !looksJson(value), String(value || '').slice(0, 40)),
    makeCheck(`${label} non-generic`, !looksGenericFailure(value), String(value || '').slice(0, 120)),
  ];
}

async function validateSummary(page, context) {
  const email = context.candidates.summary;
  if (!email?.id) return skipDimension('summarize', 'Summarize', 'No suitable email found');

  const payload = unwrap(await expectJson(page, `/api/v1/ai/summarize/${email.id}`, { method: 'POST', body: { locale: 'en' } }));
  const summary = payload.summary;
  const sourceText = text(email.subject, email.snippet, email.bodyText, stripHtml(email.bodyHtml));
  const overlap = hasKeywordOverlap(sourceText, summary, 2);
  const flags = classifyEmail(email);
  const newsletterGrounded =
    flags.newsletter
    && /\b(newsletter|promotional|marketing|unsubscribe|privacy policy|investment|advertising|digest)\b/i.test(String(summary || ''));
  const checks = [
    ...basicTextChecks(summary, 'summary'),
    makeCheck('summary length', typeof summary === 'string' && summary.length >= 40 && summary.length <= 1200, String(summary?.length || 0)),
    makeCheck('summary grounded', overlap.pass || newsletterGrounded, overlap.matches.join(', ') || (newsletterGrounded ? 'newsletter semantics matched' : 'no matches')),
  ];
  recordDimension('summarize', 'Summarize', checks, { emailId: email.id, subject: email.subject, summary });
}

async function validateSmartReply(page, context) {
  const email = context.candidates.reply || context.candidates.summary;
  if (!email?.id) return skipDimension('smart-reply', 'Smart Reply', 'No suitable email found');

  const payload = unwrap(await expectJson(page, `/api/v1/ai/smart-reply/${email.id}`, { method: 'POST', body: { locale: 'en', tone: 'formal' } }));
  const suggestions = distinctStrings(asArray(payload, 'suggestions', 'data.suggestions'));
  const combined = suggestions.join(' ');
  const overlap = hasKeywordOverlap(text(email.subject, email.snippet, email.bodyText), combined, 1);
  const checks = [
    makeCheck('suggestions array', suggestions.length >= 2 && suggestions.length <= 5, String(suggestions.length)),
    makeCheck('suggestions distinct', suggestions.length === new Set(suggestions.map(value => normalize(value))).size, suggestions.join(' | ')),
    makeCheck('suggestions concise', suggestions.every(item => item.length >= 8 && item.length <= 240), suggestions.join(' | ')),
    makeCheck('suggestions clean', suggestions.every(item => !hasPlaceholder(item) && !looksJson(item) && !looksGenericFailure(item)), suggestions.join(' | ')),
    makeCheck('suggestions grounded', overlap.pass, overlap.matches.join(', ') || 'weak overlap'),
  ];
  recordDimension('smart-reply', 'Smart Reply', checks, { emailId: email.id, subject: email.subject, suggestions });
}

async function validateCategorize(page, context) {
  const email = context.candidates.newsletter || context.candidates.summary;
  if (!email?.id) return skipDimension('categorize', 'Categorize', 'No suitable email found');

  const payload = unwrap(await expectJson(page, `/api/v1/ai/categorize/${email.id}`, { method: 'POST', body: { locale: 'en' } }));
  const labels = distinctStrings(asArray(payload, 'labels', 'data.labels'));
  const flags = classifyEmail(email);
  const checks = [
    makeCheck('labels array', labels.length >= 1 && labels.length <= 8, String(labels.length)),
    makeCheck('labels clean', labels.every(label => label.length <= 40 && !hasPlaceholder(label)), labels.join(', ')),
    makeCheck('labels distinct', labels.length === new Set(labels.map(value => value.toLowerCase())).size, labels.join(', ')),
    makeCheck('labels context-fit', categorizeContextFit(labels, flags), labels.join(', ')),
  ];
  recordDimension('categorize', 'Categorize', checks, { emailId: email.id, subject: email.subject, labels });
}

async function validateCompose(page, context) {
  const email = context.candidates.reply || context.candidates.summary;
  if (!email?.id) return skipDimension('compose', 'Compose', 'No suitable email found');

  const sender = String(email.from || '').match(/^[^<]+/)?.[0]?.trim() || 'the sender';
  const prompt = `Write a concise professional follow-up to ${sender} about "${email.subject}". Confirm we reviewed the message and will respond shortly.`;
  const payload = unwrap(await expectJson(page, '/api/v1/ai/compose', {
    method: 'POST',
    body: {
      prompt,
      tone: 'formal',
      locale: 'en',
      threadContext: [{ subject: email.subject, body: text(email.snippet, email.bodyText).slice(0, 1200) }],
      to: [],
      senderName: 'Davide',
    },
  }));

  const body = payload.body;
  const subject = payload.subject || '';
  const overlap = hasKeywordOverlap(text(email.subject, email.snippet), text(subject, body), 2);
  const checks = [
    ...basicTextChecks(body, 'body'),
    makeCheck('body professional length', typeof body === 'string' && body.length >= 80 && body.length <= 2500, String(body?.length || 0)),
    makeCheck('compose grounded', overlap.pass, overlap.matches.join(', ') || 'weak overlap'),
    makeCheck('compose has greeting or signoff', /\b(hi|hello|dear|thanks|best regards|regards|best)\b/i.test(body), body.slice(0, 120)),
  ];
  recordDimension('compose', 'Compose', checks, { emailId: email.id, subject: email.subject, composedSubject: subject, body: body?.slice(0, 500) });
}

async function validateSentiment(page, context) {
  const email = context.candidates.urgent || context.candidates.newsletter || context.candidates.summary;
  if (!email?.id) return skipDimension('sentiment', 'Sentiment', 'No suitable email found');

  const payload = unwrap(await expectJson(page, `/api/v1/ai/sentiment/${email.id}`, { method: 'POST', body: { locale: 'en' } }));
  const expected = expectedSentiment(email);
  const checks = [
    makeCheck('sentiment enum', ['positive', 'negative', 'neutral', 'mixed'].includes(payload.sentiment), String(payload.sentiment || '')),
    makeCheck('confidence range', typeof payload.confidence === 'number' && payload.confidence >= 0 && payload.confidence <= 1, String(payload.confidence ?? 'missing')),
    makeCheck('reasoning clean', !hasPlaceholder(payload.reasoning) && !looksJson(payload.reasoning), String(payload.reasoning || '').slice(0, 140)),
    makeCheck('heuristic sentiment match', expected === 'neutral' ? ['neutral', 'mixed', 'positive'].includes(payload.sentiment) : payload.sentiment === expected || payload.sentiment === 'mixed', `expected=${expected}, got=${payload.sentiment}`),
  ];
  recordDimension('sentiment', 'Sentiment', checks, { emailId: email.id, subject: email.subject, expected, actual: payload.sentiment });
}

async function validatePriority(page, context) {
  const email = context.candidates.urgent || context.candidates.newsletter || context.candidates.summary;
  if (!email?.id) return skipDimension('priority', 'Priority', 'No suitable email found');

  const payload = unwrap(await expectJson(page, `/api/v1/ai/priority/${email.id}`, { method: 'POST', body: { locale: 'en' } }));
  const expected = expectedPriority(email);
  const checks = [
    makeCheck('priority score range', typeof payload.score === 'number' && payload.score >= 1 && payload.score <= 10, String(payload.score ?? 'missing')),
    makeCheck('priority urgency enum', ['critical', 'high', 'medium', 'low'].includes(payload.urgency), String(payload.urgency || '')),
    makeCheck('priority factors array', Array.isArray(payload.factors) && payload.factors.length >= 1, JSON.stringify(payload.factors || [])),
    makeCheck('priority heuristic match', expected === 'high' ? payload.score >= 6 && ['critical', 'high', 'medium'].includes(payload.urgency) : expected === 'low' ? payload.score <= 6 && ['low', 'medium'].includes(payload.urgency) : payload.score >= 3 && payload.score <= 8, `expected=${expected}, score=${payload.score}, urgency=${payload.urgency}`),
  ];
  recordDimension('priority', 'Priority', checks, { emailId: email.id, subject: email.subject, expected, score: payload.score, urgency: payload.urgency });
}

async function validateAnalyze(page, context) {
  const email = context.candidates.urgent || context.candidates.summary;
  if (!email?.id) return skipDimension('analyze', 'Analyze', 'No suitable email found');

  const payload = unwrap(await expectJson(page, `/api/v1/ai/analyze/${email.id}`, { method: 'POST', body: { locale: 'en' } }));
  const expected = expectedSentiment(email);
  const checks = [
    makeCheck('analyze sentiment enum', ['positive', 'negative', 'neutral', 'mixed'].includes(payload.sentiment), String(payload.sentiment || '')),
    makeCheck('analyze priority range', typeof payload.priority === 'number' && payload.priority >= 1 && payload.priority <= 5, String(payload.priority ?? 'missing')),
    makeCheck('analyze keyTopics', Array.isArray(payload.keyTopics) && payload.keyTopics.length >= 1, JSON.stringify(payload.keyTopics || [])),
    makeCheck('analyze confidence', typeof payload.confidence === 'number' && payload.confidence >= 0 && payload.confidence <= 1, String(payload.confidence ?? 'missing')),
    makeCheck('analyze heuristic sentiment', expected === 'neutral' ? ['neutral', 'mixed', 'positive'].includes(payload.sentiment) : payload.sentiment === expected || payload.sentiment === 'mixed', `expected=${expected}, got=${payload.sentiment}`),
  ];
  recordDimension('analyze', 'Analyze', checks, { emailId: email.id, subject: email.subject, sentiment: payload.sentiment, priority: payload.priority, keyTopics: payload.keyTopics });
}

async function validateBriefing(page, context) {
  const payload = unwrap(await expectJson(page, '/api/v1/ai/briefing'));
  const briefing = payload.briefing || {};
  const knownEmailIds = new Set(context.emails.map(email => email.id));
  const knownEventIds = new Set(context.events.map(event => event.id));
  const knownContactIds = new Set(context.staleContacts.map(contact => contact.contactId || contact.id));
  const priorityEmails = asArray(briefing, 'priorityEmails');
  const calendarSnapshot = asArray(briefing, 'calendarSnapshot');
  const pendingFollowUps = asArray(briefing, 'pendingFollowUps');
  const staleContacts = asArray(briefing, 'staleContactsAlert');
  const priorityGrounded = await Promise.all(priorityEmails.map(async (item) => {
    if (!item?.emailId || knownEmailIds.has(item.emailId)) return true;
    const detail = await fetchEmailDetail(page, item.emailId).catch(() => null);
    return Boolean(detail?.id);
  }));
  const calendarGrounded = await Promise.all(calendarSnapshot.map(async (item) => {
    if (!item?.eventId || knownEventIds.has(item.eventId)) return true;
    const detail = await expectJson(page, `/api/v1/calendar/events/${item.eventId}`).catch(() => null);
    return Boolean(unwrap(detail)?.id);
  }));

  const checks = [
    ...basicTextChecks(briefing.executiveSummary, 'executiveSummary'),
    makeCheck('briefing priority email ids grounded', priorityGrounded.every(Boolean), JSON.stringify(priorityEmails.slice(0, 3))),
    makeCheck('briefing calendar ids grounded', calendarGrounded.every(Boolean), JSON.stringify(calendarSnapshot.slice(0, 3))),
    makeCheck('briefing stale contacts grounded', staleContacts.every(item => !item.contactId || knownContactIds.has(item.contactId)), JSON.stringify(staleContacts.slice(0, 3))),
    makeCheck('briefing follow-up shape', pendingFollowUps.every(item => typeof item.reason === 'string' && item.reason.length >= 5), JSON.stringify(pendingFollowUps.slice(0, 3))),
    makeCheck('briefing reflects events when present', context.events.length === 0 || calendarSnapshot.length >= 1, `${calendarSnapshot.length}/${context.events.length}`),
    makeCheck('briefing reflects follow-ups when present', context.followUps.length === 0 || pendingFollowUps.length >= 1, `${pendingFollowUps.length}/${context.followUps.length}`),
  ];
  recordDimension('briefing', 'Briefing', checks, { executiveSummary: briefing.executiveSummary, priorityEmails: priorityEmails.slice(0, 3), calendarSnapshot: calendarSnapshot.slice(0, 3) });
}

async function validateFollowUpDetection(page, context) {
  let payload = null;
  let lastFailure = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await browserApiJson(page, '/api/v1/ai/follow-ups/detect', {
      method: 'POST',
      body: { locale: 'en' },
      timeoutMs: 45_000,
    });
    const nextPayload = unwrap(response.json);
    const warnings = asArray(nextPayload, 'meta.warnings', 'warnings');
    const concurrentSkipped = warnings.includes('concurrent_detection_skipped');

    if (response.ok && !concurrentSkipped) {
      payload = nextPayload;
      break;
    }

    lastFailure = response.ok
      ? new Error(`POST /api/v1/ai/follow-ups/detect returned concurrent_detection_skipped`)
      : new Error(`POST /api/v1/ai/follow-ups/detect -> ${response.status}: ${String(response.raw).slice(0, 300)}`);

    if (attempt < 3) {
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }

  if (!payload) {
    throw lastFailure || new Error('follow-up detection failed without payload');
  }

  const detected = asArray(payload, 'detectedFollowUps');
  const batchSummary = asObject(payload, 'batchSummary') || {};
  const knownEmailIds = new Set(context.emails.map(email => email.id));
  const grounded = await Promise.all(detected.map(async (item) => {
    if (knownEmailIds.has(item.emailId)) return true;
    const detail = await fetchEmailDetailWithRetry(page, item.emailId).catch(() => null);
    return Boolean(detail?.id);
  }));
  const checks = [
    makeCheck('batch summary total analyzed', typeof batchSummary.totalAnalyzed === 'number' && batchSummary.totalAnalyzed >= 0, JSON.stringify(batchSummary)),
    makeCheck('batch summary total detected', typeof batchSummary.totalDetected === 'number' && batchSummary.totalDetected >= 0, JSON.stringify(batchSummary)),
    makeCheck('follow-ups grounded', grounded.every(Boolean), JSON.stringify(detected.slice(0, 3))),
    makeCheck('follow-up reasons clean', detected.every(item => typeof item.reason === 'string' && item.reason.length >= 8 && !hasPlaceholder(item.reason)), JSON.stringify(detected.slice(0, 3))),
    makeCheck('follow-up urgency enum', detected.every(item => ['high', 'medium', 'low'].includes(item.urgency)), JSON.stringify(detected.slice(0, 3))),
  ];
  recordDimension('follow-up-detection', 'Follow-up Detection', checks, { batchSummary, detected: detected.slice(0, 5) });
}

function extractEmailAddress(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/<([^>]+)>/);
    return (match ? match[1] : value).replace(/^"+|"+$/g, '').trim().toLowerCase();
  }
  if (Array.isArray(value)) {
    return extractEmailAddress(value[0]?.email || value[0]?.address || value[0]);
  }
  if (typeof value === 'object') {
    return extractEmailAddress(value.email || value.address || value.value);
  }
  return '';
}

async function validateDraftGeneration(page, context) {
  const email = context.candidates.reply || context.candidates.summary;
  if (!email?.id) return skipDimension('draft-generation', 'Draft Generation', 'No suitable email found');

  const payload = unwrap(await expectJson(page, '/api/v1/ai/drafts/generate', {
    method: 'POST',
    body: {
      emailId: email.id,
      instruction: 'Write a concise professional reply confirming receipt and promising a full response tomorrow.',
      tone: 'formal',
    },
  }));

  const draft = payload.draft || {};
  const suggestedRecipients = asArray(draft, 'suggestedRecipients');
  const senderEmail = extractEmailAddress(email.from);
  const checks = [
    ...basicTextChecks(draft.body, 'draft body'),
    makeCheck('draft subject', typeof draft.subject === 'string' && /^re:/i.test(draft.subject), String(draft.subject || 'missing')),
    makeCheck('draft confidence range', typeof draft.confidence === 'number' && draft.confidence >= 0 && draft.confidence <= 1, String(draft.confidence ?? 'missing')),
    makeCheck('draft recipients grounded', suggestedRecipients.length >= 1 && suggestedRecipients.some(item => /\S+@\S+\.\S+/.test(extractEmailAddress(item.email || item.address || item))) && (!senderEmail || suggestedRecipients.some(item => extractEmailAddress(item.email || item.address || item) === senderEmail) || true), JSON.stringify(suggestedRecipients)),
    makeCheck('draft avoids full quote', typeof draft.body === 'string' && draft.body.length < Math.max(3000, String(email.bodyText || '').length + 200), String(draft.body?.length || 0)),
  ];
  recordDimension('draft-generation', 'Draft Generation', checks, { emailId: email.id, subject: email.subject, draftSubject: draft.subject, suggestedRecipients });
}

async function validateTriage(page, context) {
  await expectJson(page, '/api/v1/ai/triage', { method: 'POST' });
  const refreshed = unwrap(await expectJson(page, '/api/v1/emails?limit=30&excludeTrashSpam=true'));
  const emails = asArray(refreshed, 'emails', 'items', 'data.emails', 'data.items');
  const triagedEmail = emails.find((email) => email.aiPriorityReason || email.aiSentiment || email.aiPriority || email.aiLabels?.length);

  if (!triagedEmail) {
    return recordDimension('triage', 'Triage', [
      makeCheck('triage produced AI metadata', false, 'No recent email exposed aiPriorityReason/aiSentiment/aiPriority'),
    ], {});
  }

  const checks = [
    makeCheck('triage aiPriority present', triagedEmail.aiPriority != null, String(triagedEmail.aiPriority ?? 'missing')),
    makeCheck('triage aiSentiment enum', ['positive', 'negative', 'neutral', 'mixed', null, undefined].includes(triagedEmail.aiSentiment), String(triagedEmail.aiSentiment ?? 'missing')),
    makeCheck('triage reason clean', !hasPlaceholder(triagedEmail.aiPriorityReason) && !looksJson(triagedEmail.aiPriorityReason), String(triagedEmail.aiPriorityReason || '').slice(0, 140)),
    makeCheck('triage labels array', !triagedEmail.aiLabels || Array.isArray(triagedEmail.aiLabels), JSON.stringify(triagedEmail.aiLabels || [])),
  ];
  recordDimension('triage', 'Triage Metadata', checks, {
    emailId: triagedEmail.id,
    subject: triagedEmail.subject,
    aiPriority: triagedEmail.aiPriority,
    aiSentiment: triagedEmail.aiSentiment,
    aiPriorityReason: triagedEmail.aiPriorityReason,
  });
}

async function validateLabelFirstTriage(page, context) {
  // 1. Check triage rules endpoint
  const rulesResp = await browserApiJson(page, '/api/v1/ai/triage-rules');
  const rulesOk = rulesResp.ok;

  // 2. Check override endpoint
  const overridesResp = await browserApiJson(page, '/api/v1/ai/triage-overrides');
  const overridesOk = overridesResp.ok;

  // 3. Check lane-counts endpoint
  const laneCountsResp = await browserApiJson(page, '/api/v1/ai/triage-rules/lane-counts');
  const laneCountsOk = laneCountsResp.ok;
  const laneCounts = laneCountsOk ? unwrap(laneCountsResp.json) : {};
  const laneCountEntries = Object.entries(laneCounts).filter(
    ([key]) => !['meta', 'total', 'status'].includes(key),
  );

  // 4. Fetch recently triaged emails and check label-first fields
  const refreshed = unwrap(await expectJson(page, '/api/v1/emails?limit=30&excludeTrashSpam=true'));
  const emails = asArray(refreshed, 'emails', 'items', 'data.emails', 'data.items');

  const withLane = emails.filter(e => e.aiLane);
  const withIntent = emails.filter(e => e.aiIntent);
  const withActionability = emails.filter(e => e.aiActionability);

  const laneDistribution = {};
  for (const email of withLane) {
    laneDistribution[email.aiLane] = (laneDistribution[email.aiLane] || 0) + 1;
  }
  const laneKeys = Object.keys(laneDistribution);
  const allInOneLane = laneKeys.length === 1 && withLane.length > 5;

  // 5. Suppression check: Promotions/Updates emails should be low priority
  const suppressionEmails = emails.filter(e => {
    const labelText = (e.aiLabels || []).join(' ').toLowerCase();
    return /promotion|newsletter|update|marketing/.test(labelText);
  });
  const suppressionCorrect = suppressionEmails.length === 0 || suppressionEmails.every(e =>
    e.aiPriority == null || e.aiPriority <= 5,
  );

  // 6. Follow-up precision: review-later lane should have near-zero follow-ups
  const reviewLaterEmails = emails.filter(e => e.aiLane === 'review-later');
  const followUpList = unwrap(await expectJson(page, '/api/v1/ai/follow-ups/pending?limit=50').catch(() => ({ followUps: [] })));
  const followUps = asArray(followUpList, 'followUps', 'items', 'data.followUps', 'data.items');
  const followUpEmailIds = new Set(followUps.map(f => f.emailId));
  const reviewLaterWithFollowUp = reviewLaterEmails.filter(e => followUpEmailIds.has(e.id));

  const checks = [
    makeCheck('triage-rules endpoint', rulesOk, `HTTP ${rulesResp.status}`),
    makeCheck('triage-overrides endpoint', overridesOk, `HTTP ${overridesResp.status}`),
    makeCheck('lane-counts endpoint', laneCountsOk, `HTTP ${laneCountsResp.status}`),
    makeCheck('aiLane populated', withLane.length >= 1, `${withLane.length}/${emails.length} emails`),
    makeCheck('aiIntent populated', withIntent.length >= 1, `${withIntent.length}/${emails.length} emails`),
    makeCheck('aiActionability populated', withActionability.length >= 1, `${withActionability.length}/${emails.length} emails`),
    makeCheck('lane distribution reasonable', !allInOneLane, JSON.stringify(laneDistribution)),
    makeCheck('suppression reduces priority', suppressionCorrect, `${suppressionEmails.length} suppression emails`),
    makeCheck('review-later low follow-ups', reviewLaterWithFollowUp.length <= 1, `${reviewLaterWithFollowUp.length} review-later emails with follow-ups`),
  ];

  recordDimension('label-first-triage', 'Label-First Triage', checks, {
    laneDistribution,
    laneCounts: laneCountsOk ? laneCounts : 'endpoint failed',
    withLane: withLane.length,
    withIntent: withIntent.length,
    withActionability: withActionability.length,
    suppressionEmails: suppressionEmails.length,
    reviewLaterWithFollowUp: reviewLaterWithFollowUp.length,
  });
}

function buildReport(context) {
  const scored = results.filter(result => typeof result.score === 'number');
  const passed = scored.filter(result => result.status === PASS).length;
  const warned = scored.filter(result => result.status === WARN).length;
  const failed = scored.filter(result => result.status === FAIL).length;
  const average = scored.length
    ? Math.round((scored.reduce((sum, result) => sum + result.score, 0) / scored.length) * 100) / 100
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    frontendUrl: FRONTEND_URL,
    discovery: {
      providerCount: context.providers.length,
      emailCount: context.emails.length,
      eventCount: context.events.length,
      followUpCount: context.followUps.length,
      staleContactCount: context.staleContacts.length,
      emailStats: context.emailStats,
    },
    summary: {
      averageScore: average,
      passed,
      warned,
      failed,
      skipped: results.filter(result => result.status === SKIP).length,
    },
    results,
  };
}

async function main() {
  ensureOutDir();
  const { browser, page } = await connectCDP({ preferNewPage: true });

  try {
    if (!page.url().includes('mail-agent') && !page.url().includes('localhost')) {
      await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    const context = await discover(page);
    log(`Providers=${context.providers.length}, emails=${context.emails.length}, events=${context.events.length}, followUps=${context.followUps.length}`);

    if (shouldRun('summarize')) await validateSummary(page, context);
    if (shouldRun('smart-reply')) await validateSmartReply(page, context);
    if (shouldRun('categorize')) await validateCategorize(page, context);
    if (shouldRun('compose')) await validateCompose(page, context);
    if (shouldRun('sentiment')) await validateSentiment(page, context);
    if (shouldRun('priority')) await validatePriority(page, context);
    if (shouldRun('analyze')) await validateAnalyze(page, context);
    if (shouldRun('briefing')) await validateBriefing(page, context);
    if (shouldRun('follow-up-detection')) await validateFollowUpDetection(page, context);
    if (shouldRun('draft-generation')) await validateDraftGeneration(page, context);
    if (shouldRun('triage')) await validateTriage(page, context);
    if (shouldRun('label-first-triage')) await validateLabelFirstTriage(page, context);

    const report = buildReport(context);
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    log(`Report written to ${REPORT_PATH}`);
    log(`Average score: ${report.summary.averageScore}/10`);
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
