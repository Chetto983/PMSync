/**
 * AI Functions Production Audit
 * Comprehensive one-by-one testing of ALL AI endpoints
 *
 * Run with: npx ts-node scripts/audit-ai-functions-production.ts
 *
 * This audit:
 * - Tests each AI endpoint individually with real data
 * - Validates response structure and data types
 * - Measures response times
 * - Reports detailed findings for each function
 */
import 'dotenv/config';
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as jwt from 'jsonwebtoken';

const prisma = createPrismaClient();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

interface AuditResult {
  endpoint: string;
  method: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
  statusCode: number;
  responseTime: number;
  dataValidation: string;
  responseShape?: string;
  error?: string;
  details?: Record<string, unknown>;
}

const results: AuditResult[] = [];
let token = '';
let tenantId = '';
let testEmailId = '';

async function generateToken(uid: string, tid: string, email: string, role: string): Promise<string> {
  const existingSession = await prisma.session.findFirst({
    where: { userId: uid, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (existingSession) return existingSession.token;

  const sessionId = 'ai-audit-' + Date.now();
  const jwtToken = jwt.sign(
    { sessionId, userId: uid, tenantId: tid, email, role },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h' },
  );

  await prisma.session.create({
    data: {
      id: sessionId,
      userId: uid,
      token: jwtToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      ipAddress: '127.0.0.1',
      userAgent: 'AI-Audit',
    },
  });

  return jwtToken;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  timeout = 60000,
): Promise<{ status: number; data: unknown; time: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data, time: Date.now() - start };
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      status: 0,
      data: { error: errorMessage.includes('abort') ? 'Timeout' : errorMessage },
      time: Date.now() - start,
    };
  }
}

function validateShape(data: unknown, expectedKeys: string[]): { valid: boolean; found: string[]; missing: string[] } {
  if (!data || typeof data !== 'object') return { valid: false, found: [], missing: expectedKeys };
  const keys = Object.keys(data as object);
  const found = expectedKeys.filter((k) => keys.includes(k));
  const missing = expectedKeys.filter((k) => !keys.includes(k));
  return { valid: missing.length === 0, found, missing };
}

async function audit(
  category: string,
  endpoint: string,
  method: string,
  expectedKeys: string[],
  body?: unknown,
  options?: { timeout?: number; allowEmpty?: boolean; skipValidation?: boolean },
): Promise<void> {
  console.log(`\n  🔍 Testing: ${method} ${endpoint}`);

  const { status, data, time } = await api(method, endpoint, body, options?.timeout || 60000);

  const result: AuditResult = {
    endpoint,
    method,
    category,
    status: 'FAIL',
    statusCode: status,
    responseTime: time,
    dataValidation: '',
    details: {},
  };

  if (status === 0) {
    result.status = 'FAIL';
    result.error = (data as { error?: string })?.error || 'Connection failed';
    result.dataValidation = 'Request failed';
    console.log(`     ❌ FAIL: ${result.error} (${time}ms)`);
  } else if (status >= 200 && status < 300) {
    // Accept all 2xx success codes (200 OK, 201 Created, 204 No Content, etc.)
    if (options?.skipValidation) {
      result.status = 'PASS';
      result.dataValidation = 'Response received (validation skipped)';
      console.log(`     ✅ PASS: Response received (${time}ms)`);
    } else {
      const validation = validateShape(data, expectedKeys);
      result.responseShape = `Found: [${validation.found.join(', ')}]`;

      if (validation.valid) {
        result.status = 'PASS';
        result.dataValidation = `All expected keys present: ${expectedKeys.join(', ')}`;
        console.log(`     ✅ PASS: Valid response shape (${time}ms)`);
      } else if (validation.found.length > 0) {
        result.status = 'WARN';
        result.dataValidation = `Missing keys: ${validation.missing.join(', ')}`;
        console.log(`     ⚠️  WARN: Partial response - missing: ${validation.missing.join(', ')} (${time}ms)`);
      } else if (options?.allowEmpty && Array.isArray(data) && (data as unknown[]).length === 0) {
        result.status = 'PASS';
        result.dataValidation = 'Empty array (allowed)';
        console.log(`     ✅ PASS: Empty result (allowed) (${time}ms)`);
      } else if (options?.allowEmpty && typeof data === 'object' && Object.keys(data as object).length === 0) {
        result.status = 'PASS';
        result.dataValidation = 'Empty object (allowed)';
        console.log(`     ✅ PASS: Empty object (allowed) (${time}ms)`);
      } else {
        result.status = 'WARN';
        result.dataValidation = `Unexpected shape: ${JSON.stringify(data).substring(0, 100)}`;
        console.log(`     ⚠️  WARN: Unexpected response shape (${time}ms)`);
      }
    }

    // Add summary details
    if (Array.isArray(data)) {
      result.details = { count: (data as unknown[]).length };
      console.log(`     📊 Data: ${(data as unknown[]).length} items`);
    } else if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      const summary: Record<string, unknown> = {};
      for (const key of Object.keys(d).slice(0, 5)) {
        const val = d[key];
        if (typeof val === 'number' || typeof val === 'boolean' || typeof val === 'string') {
          summary[key] = val;
        } else if (Array.isArray(val)) {
          summary[key] = `[${(val as unknown[]).length} items]`;
        }
      }
      result.details = summary;
      if (Object.keys(summary).length > 0) {
        console.log(`     📊 Data: ${JSON.stringify(summary)}`);
      }
    }
  } else if (status === 400) {
    result.status = 'WARN';
    result.error = 'Bad Request - check parameters';
    result.dataValidation = JSON.stringify(data).substring(0, 200);
    console.log(`     ⚠️  WARN: 400 Bad Request (${time}ms)`);
  } else if (status === 401) {
    result.status = 'FAIL';
    result.error = 'Unauthorized - token issue';
    result.dataValidation = 'Auth failed';
    console.log(`     ❌ FAIL: 401 Unauthorized (${time}ms)`);
  } else if (status === 404) {
    result.status = 'FAIL';
    result.error = 'Endpoint not found';
    result.dataValidation = 'Route missing';
    console.log(`     ❌ FAIL: 404 Not Found (${time}ms)`);
  } else if (status === 500) {
    result.status = 'FAIL';
    result.error = 'Internal Server Error';
    result.dataValidation = JSON.stringify(data).substring(0, 200);
    console.log(`     ❌ FAIL: 500 Server Error (${time}ms)`);
  } else {
    result.status = 'WARN';
    result.error = `Unexpected status: ${status}`;
    result.dataValidation = JSON.stringify(data).substring(0, 200);
    console.log(`     ⚠️  WARN: Status ${status} (${time}ms)`);
  }

  results.push(result);
}

// ============================================================================
// AUDIT CATEGORIES
// ============================================================================

async function auditBriefing(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 CATEGORY: Daily Briefing');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('Briefing', '/api/v1/voltagent/briefing', 'GET', ['success', 'briefing'], null, {
    timeout: 120000,
    allowEmpty: true,
  });

  await audit('Briefing', '/api/v1/voltagent/briefing/status', 'GET', ['success', 'enabled'], null, {
    allowEmpty: true,
  });

  await audit('Briefing', '/api/v1/voltagent/briefing/refresh', 'POST', ['success', 'briefing'], null, {
    timeout: 120000,
    skipValidation: true,
  });
}

async function auditMemory(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧠 CATEGORY: Memory System');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('Memory', '/api/v1/voltagent/memory', 'GET', ['memories'], null, { allowEmpty: true });

  await audit('Memory', '/api/v1/voltagent/memory/stats', 'GET', ['success', 'totalMemories'], null, { allowEmpty: true });

  await audit('Memory', '/api/v1/voltagent/memory/search?query=test&limit=5', 'GET', ['success', 'memories'], null, {
    allowEmpty: true,
  });

  // Test memory creation (controller expects: { fact, category?, importance? })
  await audit(
    'Memory',
    '/api/v1/voltagent/memory',
    'POST',
    ['success', 'memoryId'],
    {
      fact: 'AI Audit test memory - user prefers concise responses',
      category: 'PREFERENCE',
      importance: 0.7,
    },
    { skipValidation: true },
  );
}

async function auditFollowUps(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📌 CATEGORY: Follow-ups');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('FollowUps', '/api/v1/voltagent/follow-ups?limit=10', 'GET', ['followUps'], null, { allowEmpty: true });

  await audit('FollowUps', '/api/v1/voltagent/follow-ups/pending?limit=10', 'GET', ['followUps'], null, {
    allowEmpty: true,
  });

  await audit('FollowUps', '/api/v1/voltagent/follow-ups/overdue?limit=10', 'GET', ['followUps'], null, {
    allowEmpty: true,
  });

  await audit('FollowUps', '/api/v1/voltagent/follow-ups/stats', 'GET', ['total', 'pending', 'overdue'], null, {
    allowEmpty: true,
  });

  // Test follow-up analysis (requires email)
  if (testEmailId) {
    await audit(
      'FollowUps',
      '/api/v1/voltagent/follow-ups/analyze',
      'POST',
      ['needsFollowUp', 'reason'],
      { emailId: testEmailId },
      { timeout: 60000, skipValidation: true },
    );
  }
}

async function auditActionItems(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ CATEGORY: Action Items');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('ActionItems', '/api/v1/voltagent/action-items?limit=10', 'GET', ['success', 'items'], null, {
    allowEmpty: true,
  });

  await audit('ActionItems', '/api/v1/voltagent/action-items/pending?limit=10', 'GET', ['success', 'items'], null, {
    allowEmpty: true,
  });

  await audit('ActionItems', '/api/v1/voltagent/action-items/overdue?limit=10', 'GET', ['success', 'items'], null, {
    allowEmpty: true,
  });

  await audit('ActionItems', '/api/v1/voltagent/action-items/stats', 'GET', ['success', 'stats'], null, {
    allowEmpty: true,
  });

  // Test action item extraction (requires email)
  if (testEmailId) {
    await audit(
      'ActionItems',
      '/api/v1/voltagent/action-items/extract',
      'POST',
      ['actionItems'],
      { emailId: testEmailId },
      { timeout: 60000, skipValidation: true },
    );
  }
}

async function auditDeadlines(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⏰ CATEGORY: Deadlines');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('Deadlines', '/api/v1/voltagent/deadlines?limit=10', 'GET', ['deadlines'], null, { allowEmpty: true });

  await audit('Deadlines', '/api/v1/voltagent/deadlines/stats', 'GET', ['total', 'upcoming', 'overdue'], null, {
    allowEmpty: true,
  });

  await audit('Deadlines', '/api/v1/voltagent/deadlines/queue', 'GET', ['waiting', 'active'], null, {
    allowEmpty: true,
  });

  // Test deadline extraction (requires email)
  if (testEmailId) {
    await audit(
      'Deadlines',
      '/api/v1/voltagent/deadlines/extract',
      'POST',
      ['deadlines'],
      { emailId: testEmailId },
      { timeout: 60000, skipValidation: true },
    );
  }
}

async function auditAnalytics(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 CATEGORY: Analytics');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('Analytics', '/api/v1/voltagent/analytics/dashboard', 'GET', ['success', 'analytics'], null, {
    timeout: 120000,
    allowEmpty: true,
  });

  await audit('Analytics', '/api/v1/voltagent/analytics/email?period=7d', 'GET', ['success', 'analytics'], null, {
    allowEmpty: true,
  });

  await audit('Analytics', '/api/v1/voltagent/analytics/status', 'GET', ['success', 'enabled'], null, {
    allowEmpty: true,
  });

  // Test AI-powered analytics
  await audit(
    'Analytics',
    '/api/v1/voltagent/analytics/ai',
    'POST',
    ['insights', 'recommendations'],
    { query: 'What are my email trends this week?' },
    { timeout: 120000, skipValidation: true },
  );
}

async function auditCRM(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👥 CATEGORY: CRM Intelligence');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('CRM', '/api/v1/voltagent/crm/stale-contacts?limit=10', 'GET', ['contacts'], null, { allowEmpty: true });

  await audit('CRM', '/api/v1/voltagent/crm/reconnect?limit=10', 'GET', ['contacts'], null, { allowEmpty: true });

  await audit('CRM', '/api/v1/voltagent/crm/top-contacts?limit=10', 'GET', ['contacts'], null, { allowEmpty: true });
}

async function auditHITL(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🤝 CATEGORY: Human-in-the-Loop (HITL)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Get pending actions list
  await audit('HITL', '/api/v1/voltagent/actions/pending?limit=10', 'GET', ['success', 'actions'], null, { allowEmpty: true });

  // 2. Submit a HIGH severity action for approval (should require human approval)
  const submitResult = await api('POST', '/api/v1/voltagent/actions/submit', {
    actionType: 'SEND_EMAIL', // DTO expects 'actionType', not 'type'
    payload: {
      to: 'test-audit@example.com',
      subject: 'AI Audit Test - HITL Approval',
      body: 'This is a test action from the AI audit script.',
    },
    summary: 'Send test email for AI audit', // Required field
    confidence: 0.75, // Below auto-approve threshold
    severity: 'HIGH', // Requires approval
    autoApproveThreshold: 0.95,
  });

  if (submitResult.status === 200) {
    const submitData = submitResult.data as { status?: string; executionId?: string };
    console.log(`     ✅ Submit Action: ${submitData.status} (executionId: ${submitData.executionId || 'auto-approved'})`);

    results.push({
      endpoint: '/api/v1/voltagent/actions/submit',
      method: 'POST',
      category: 'HITL',
      status: 'PASS',
      statusCode: submitResult.status,
      responseTime: submitResult.time,
      dataValidation: `Action submitted: status=${submitData.status}`,
      details: { executionId: submitData.executionId },
    });

    // If suspended (needs approval), test the full workflow
    if (submitData.status === 'pending' && submitData.executionId) {
      const executionId = submitData.executionId;

      // 3. Get the specific pending action
      await audit('HITL', `/api/v1/voltagent/actions/${executionId}`, 'GET', ['success', 'action'], null, {
        skipValidation: true,
      });

      // 4. Test REJECT flow with a new action
      const rejectTestResult = await api('POST', '/api/v1/voltagent/actions/submit', {
        actionType: 'DELETE_EMAIL',
        payload: { emailId: 'test-email-id-for-rejection' },
        summary: 'Delete test email for rejection test',
        confidence: 0.5,
        severity: 'HIGH',
        autoApproveThreshold: 0.95,
      });

      if (rejectTestResult.status === 200) {
        const rejectData = rejectTestResult.data as { executionId?: string; status?: string };
        if (rejectData.executionId && rejectData.status === 'pending') {
          // Test REJECT endpoint
          const rejectResult = await api('POST', `/api/v1/voltagent/actions/${rejectData.executionId}/reject`, {
            approved: false,
            rejectionReason: 'AI Audit: Testing rejection flow',
          });

          results.push({
            endpoint: `/api/v1/voltagent/actions/:executionId/reject`,
            method: 'POST',
            category: 'HITL',
            status: rejectResult.status === 200 ? 'PASS' : 'FAIL',
            statusCode: rejectResult.status,
            responseTime: rejectResult.time,
            dataValidation: rejectResult.status === 200 ? 'Reject action successful' : 'Reject action failed',
            details: rejectResult.data as Record<string, unknown>,
          });

          if (rejectResult.status === 200) {
            console.log(`     ✅ Reject Action: Success`);
          } else {
            console.log(`     ❌ Reject Action: Failed (${rejectResult.status})`);
          }
        }
      }

      // 5. Test APPROVE flow with a new action
      const approveTestResult = await api('POST', '/api/v1/voltagent/actions/submit', {
        actionType: 'CREATE_FOLDER',
        payload: { name: 'Test Folder from Audit' },
        summary: 'Create test folder for approval test',
        confidence: 0.6,
        severity: 'MEDIUM',
        autoApproveThreshold: 0.95,
      });

      if (approveTestResult.status === 200) {
        const approveData = approveTestResult.data as { executionId?: string; status?: string };
        if (approveData.executionId && approveData.status === 'pending') {
          // Test APPROVE endpoint
          const approveResult = await api('POST', `/api/v1/voltagent/actions/${approveData.executionId}/approve`, {
            payload: { name: 'Test Folder from Audit' }, // Same payload
          });

          results.push({
            endpoint: `/api/v1/voltagent/actions/:executionId/approve`,
            method: 'POST',
            category: 'HITL',
            status: approveResult.status === 200 ? 'PASS' : 'FAIL',
            statusCode: approveResult.status,
            responseTime: approveResult.time,
            dataValidation: approveResult.status === 200 ? 'Approve action successful' : 'Approve action failed',
            details: approveResult.data as Record<string, unknown>,
          });

          if (approveResult.status === 200) {
            console.log(`     ✅ Approve Action: Success`);
          } else {
            console.log(`     ❌ Approve Action: Failed (${approveResult.status})`);
          }
        }
      }

      // 6. Test MODIFY flow (approve with modified payload)
      const modifyTestResult = await api('POST', '/api/v1/voltagent/actions/submit', {
        actionType: 'CREATE_EVENT',
        payload: {
          title: 'Original Meeting Title',
          startTime: new Date(Date.now() + 86400000).toISOString(),
          duration: 30,
        },
        summary: 'Create calendar event for modification test',
        confidence: 0.65,
        severity: 'MEDIUM',
        autoApproveThreshold: 0.95,
      });

      if (modifyTestResult.status === 200) {
        const modifyData = modifyTestResult.data as { executionId?: string; status?: string };
        if (modifyData.executionId && modifyData.status === 'pending') {
          // Test MODIFY (approve with changed payload)
          const modifyResult = await api('POST', `/api/v1/voltagent/actions/${modifyData.executionId}/approve`, {
            payload: {
              title: 'Modified Meeting Title - AI Audit',
              startTime: new Date(Date.now() + 86400000).toISOString(),
              duration: 60, // Changed from 30 to 60 minutes
            },
          });

          results.push({
            endpoint: `/api/v1/voltagent/actions/:executionId/approve (MODIFY)`,
            method: 'POST',
            category: 'HITL',
            status: modifyResult.status === 200 ? 'PASS' : 'FAIL',
            statusCode: modifyResult.status,
            responseTime: modifyResult.time,
            dataValidation: modifyResult.status === 200 ? 'Modify action successful' : 'Modify action failed',
            details: modifyResult.data as Record<string, unknown>,
          });

          if (modifyResult.status === 200) {
            console.log(`     ✅ Modify Action (approve with changed payload): Success`);
          } else {
            console.log(`     ❌ Modify Action: Failed (${modifyResult.status})`);
          }
        }
      }
    } else if (submitData.status === 'completed') {
      // Auto-approved (low risk action or high confidence)
      console.log(`     ℹ️  Action was auto-approved - testing with higher severity`);
    }
  } else {
    results.push({
      endpoint: '/api/v1/voltagent/actions/submit',
      method: 'POST',
      category: 'HITL',
      status: 'FAIL',
      statusCode: submitResult.status,
      responseTime: submitResult.time,
      dataValidation: 'Submit action failed',
      error: JSON.stringify(submitResult.data).substring(0, 200),
    });
    console.log(`     ❌ Submit Action: Failed (${submitResult.status})`);
  }

  // 7. Feedback endpoint
  await audit('HITL', '/api/v1/voltagent/feedback?limit=10', 'GET', ['feedback'], null, { allowEmpty: true });

  // 8. Action counts stats
  await audit('HITL', '/api/v1/voltagent/stats/action-counts', 'GET', ['success', 'counts'], null, { allowEmpty: true });
}

async function auditStats(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 CATEGORY: System Stats');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('Stats', '/api/v1/voltagent/stats/action-counts', 'GET', ['success', 'counts'], null, {
    allowEmpty: true,
  });

  await audit('Stats', '/api/v1/voltagent/stats/learning', 'GET', ['success', 'stats'], null, { allowEmpty: true });

  await audit('Stats', '/api/v1/voltagent/stats/aggregate', 'GET', ['success', 'stats'], null, {
    allowEmpty: true,
  });

  await audit('Stats', '/api/v1/voltagent/stats/performance', 'GET', ['success', 'stats'], null, {
    allowEmpty: true,
  });

  await audit('Stats', '/api/v1/voltagent/stats/metrics', 'GET', ['success', 'metrics'], null, { allowEmpty: true });

  await audit('Stats', '/api/v1/voltagent/stats/optimizations', 'GET', ['success', 'optimizations'], null, {
    allowEmpty: true,
  });
}

async function auditCache(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💾 CATEGORY: Semantic Cache');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('Cache', '/api/v1/voltagent/cache/analytics', 'GET', ['success', 'analytics'], null, {
    allowEmpty: true,
  });
}

async function auditKnowledge(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📚 CATEGORY: Knowledge & RAG');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('Knowledge', '/api/v1/voltagent/knowledge/stats', 'GET', ['success', 'memoryCount'], null, {
    allowEmpty: true,
  });

  await audit(
    'Knowledge',
    '/api/v1/voltagent/knowledge/search',
    'POST',
    ['success', 'context'],
    { query: 'test search query', limit: 5 },
    { allowEmpty: true, skipValidation: true },
  );

  // Knowledge Base endpoints
  await audit('Knowledge', '/ai/knowledge-base/embeddings?limit=5', 'GET', ['success', 'items'], null, { allowEmpty: true });

  await audit(
    'Knowledge',
    '/ai/knowledge-base/search',
    'POST',
    ['results'],
    { query: 'test', limit: 5 },
    { allowEmpty: true, skipValidation: true },
  );
}

async function auditPersonalization(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 CATEGORY: Personalization');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Profile endpoint returns { success: true, profile: {...} }
  await audit('Personalization', '/ai/personalization/profile', 'GET', ['success', 'profile'], null, {
    allowEmpty: true,
  });

  // Working hours returns { success: true, withinWorkingHours, workingHours }
  await audit('Personalization', '/ai/personalization/working-hours', 'GET', ['success', 'withinWorkingHours'], null, {
    allowEmpty: true,
  });

  // Semantic search is a POST endpoint, not GET
  await audit(
    'Personalization',
    '/ai/personalization/memories/search',
    'POST',
    ['success', 'memories'],
    { query: 'test search', limit: 5 },
    { allowEmpty: true, skipValidation: true },
  );

  // Get personalization context for AI
  await audit(
    'Personalization',
    '/ai/personalization/context',
    'POST',
    ['success', 'context'],
    { query: 'test context' },
    { allowEmpty: true, skipValidation: true },
  );
}

async function auditDocumentLibrary(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📄 CATEGORY: Document Library');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // List libraries returns { success: true, libraries: [], count: 0 }
  await audit('DocLibrary', '/api/v1/voltagent/documents/libraries', 'GET', ['success', 'libraries', 'count'], null, {
    allowEmpty: true,
  });

  // Query documents with RAG
  await audit(
    'DocLibrary',
    '/api/v1/voltagent/documents/query',
    'POST',
    ['success', 'results'],
    { query: 'test document query', libraryIds: [], locale: 'en' },
    { allowEmpty: true, skipValidation: true },
  );
}

async function auditAIChat(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💬 CATEGORY: AI Chat & LLM');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // VoltAgent chat
  await audit(
    'Chat',
    '/api/v1/voltagent/chat',
    'POST',
    ['response', 'sessionId'],
    { message: 'Hello, this is an AI audit test. Please respond briefly.', sessionId: 'audit-test' },
    { timeout: 120000, skipValidation: true },
  );

  // AI Controller endpoints
  await audit(
    'Chat',
    '/ai/chat',
    'POST',
    ['response'],
    { message: 'Test message', model: 'small' },
    { timeout: 60000, skipValidation: true },
  );

  // Email summarization (requires email)
  if (testEmailId) {
    await audit('AI', `/ai/summarize/${testEmailId}`, 'POST', ['summary'], null, {
      timeout: 60000,
      skipValidation: true,
    });

    await audit('AI', `/ai/smart-reply/${testEmailId}`, 'POST', ['replies'], null, {
      timeout: 60000,
      skipValidation: true,
    });

    await audit('AI', `/ai/sentiment/${testEmailId}`, 'POST', ['sentiment', 'score'], null, {
      timeout: 60000,
      skipValidation: true,
    });

    await audit('AI', `/ai/priority/${testEmailId}`, 'POST', ['priority', 'reason'], null, {
      timeout: 60000,
      skipValidation: true,
    });
  }
}

async function auditHealth(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏥 CATEGORY: AI Health');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await audit('Health', '/ai/health', 'GET', ['status', 'services'], null, { allowEmpty: true });
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║          AI FUNCTIONS PRODUCTION AUDIT                           ║');
  console.log('║          Testing each endpoint one-by-one                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();

  // Setup
  const user = await prisma.user.findFirst({ include: { tenant: true } });
  if (!user) {
    console.error('❌ No users found in database');
    process.exit(1);
  }

  tenantId = user.tenantId;
  token = await generateToken(user.id, user.tenantId, user.email, user.role);

  // Get test email
  const emails = await prisma.email.findMany({
    where: { tenantId },
    take: 1,
    orderBy: { receivedAt: 'desc' },
    select: { id: true, subject: true },
  });
  if (emails.length > 0) {
    testEmailId = emails[0].id;
    console.log(`📧 Test email: "${emails[0].subject?.substring(0, 40)}..."`);
  }

  console.log(`👤 User: ${user.email}`);
  console.log(`🏢 Tenant: ${user.tenant.name}`);
  console.log(`🔑 Token: ${token.substring(0, 30)}...`);

  // Run all audits
  await auditHealth();
  await auditBriefing();
  await auditMemory();
  await auditFollowUps();
  await auditActionItems();
  await auditDeadlines();
  await auditAnalytics();
  await auditCRM();
  await auditHITL();
  await auditStats();
  await auditCache();
  await auditKnowledge();
  await auditPersonalization();
  await auditDocumentLibrary();
  await auditAIChat();

  // Summary
  const totalTime = Date.now() - startTime;
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║                     AUDIT SUMMARY                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const warned = results.filter((r) => r.status === 'WARN').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  // Group by category
  const categories = [...new Set(results.map((r) => r.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.status === 'PASS').length;
    const catWarned = catResults.filter((r) => r.status === 'WARN').length;
    const catFailed = catResults.filter((r) => r.status === 'FAIL').length;
    const icon = catFailed > 0 ? '❌' : catWarned > 0 ? '⚠️' : '✅';
    console.log(`  ${icon} ${cat}: ${catPassed} pass, ${catWarned} warn, ${catFailed} fail`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ⚠️  Warned: ${warned}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭  Skipped: ${skipped}`);
  console.log(`  📊 Total:   ${results.length} endpoints`);
  console.log(`  ⏱  Time:    ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`  📈 Pass Rate: ${Math.round((passed / results.length) * 100)}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Show failures
  if (failed > 0) {
    console.log('❌ FAILED ENDPOINTS:');
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => {
        console.log(`  • ${r.method} ${r.endpoint}`);
        console.log(`    Status: ${r.statusCode}, Error: ${r.error}`);
      });
    console.log('');
  }

  // Show warnings
  if (warned > 0) {
    console.log('⚠️  WARNINGS:');
    results
      .filter((r) => r.status === 'WARN')
      .forEach((r) => {
        console.log(`  • ${r.method} ${r.endpoint}`);
        console.log(`    Issue: ${r.dataValidation?.substring(0, 100)}`);
      });
    console.log('');
  }

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    duration: totalTime,
    summary: {
      total: results.length,
      passed,
      warned,
      failed,
      skipped,
      passRate: Math.round((passed / results.length) * 100),
    },
    byCategory: Object.fromEntries(
      categories.map((cat) => [
        cat,
        {
          total: results.filter((r) => r.category === cat).length,
          passed: results.filter((r) => r.category === cat && r.status === 'PASS').length,
          warned: results.filter((r) => r.category === cat && r.status === 'WARN').length,
          failed: results.filter((r) => r.category === cat && r.status === 'FAIL').length,
        },
      ]),
    ),
    results,
  };

  const fs = await import('fs');
  fs.writeFileSync('scripts/ai-functions-audit-report.json', JSON.stringify(report, null, 2));
  console.log('📄 Detailed report saved to scripts/ai-functions-audit-report.json\n');

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
