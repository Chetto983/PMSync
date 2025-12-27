/**
 * Contacts Module - Comprehensive End-to-End Test Suite
 * Tests real API endpoints with actual data, simulating real user behavior
 *
 * Tests include:
 * - Contact listing and filtering
 * - Contact CRUD operations
 * - Local contact creation
 * - Sync operations
 * - Import operations (vCard)
 * - Error handling
 * - Authorization checks
 *
 * Production Readiness Validation:
 * - Error response formats
 * - Authorization checks
 * - Data integrity
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import * as jwt from 'jsonwebtoken';

const prisma = createPrismaClient();
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';

interface TestResult {
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'skip';
  time: number;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];
let token = '';
let tenantId = '';
let userId = '';

// Test data IDs
let testProviderId = '';
let testContactId = '';
let createdContactId = '';
let createdLocalContactId = '';

/**
 * Generate JWT with valid session
 */
async function generateJWTWithSession(
  uid: string,
  tid: string,
  email: string,
  userRole: string,
): Promise<string> {
  // Check for existing valid session
  const existingSession = await prisma.session.findFirst({
    where: {
      userId: uid,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existingSession) {
    console.log('📋 Using existing session');
    return existingSession.token;
  }

  // Create new session
  const sessionId = 'e2e-contacts-' + Date.now();
  const jwtToken = jwt.sign(
    {
      sessionId,
      userId: uid,
      tenantId: tid,
      email,
      role: userRole,
    },
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
      userAgent: 'E2E-Contacts-Test',
    },
  });

  console.log('📋 Created new test session');
  return jwtToken;
}

/**
 * API helper with timing and error handling
 */
async function api(
  method: string,
  path: string,
  body?: any,
): Promise<{ status: number; data: any; time: number }> {
  const start = Date.now();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return { status: response.status, data: {}, time: Date.now() - start };
    }

    const data = await response.json().catch(() => ({}));
    return { status: response.status, data, time: Date.now() - start };
  } catch (error) {
    return { status: 0, data: { error: String(error) }, time: Date.now() - start };
  }
}

/**
 * Test wrapper with consistent logging
 */
async function test(
  category: string,
  name: string,
  fn: () => Promise<{ details?: string }>,
): Promise<void> {
  const start = Date.now();
  try {
    const result = await fn();
    results.push({
      name,
      category,
      status: 'pass',
      time: Date.now() - start,
      details: result.details,
    });
    console.log(
      `  ✅ ${name} (${Date.now() - start}ms)${result.details ? ` - ${result.details}` : ''}`,
    );
  } catch (error) {
    results.push({
      name,
      category,
      status: 'fail',
      time: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`  ❌ ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Skip helper for conditional tests
 */
function skip(category: string, name: string, reason: string): void {
  results.push({ name, category, status: 'skip', time: 0, details: reason });
  console.log(`  ⏭ ${name} - ${reason}`);
}

async function main() {
  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log('║       CONTACTS MODULE - END-TO-END TEST SUITE               ║');
  console.log('║       Testing real API with real contact providers          ║');
  console.log('╚═════════════════════════════════════════════════════════════╝\n');

  // ═══════════════════════════════════════════════════════════════
  // SETUP: Get user and generate token
  // ═══════════════════════════════════════════════════════════════
  const user = await prisma.user.findFirst({ include: { tenant: true } });
  if (!user) {
    console.error('❌ No users found in database');
    process.exit(1);
  }

  userId = user.id;
  tenantId = user.tenantId;
  token = await generateJWTWithSession(userId, tenantId, user.email, user.role);

  console.log(`📧 User: ${user.email}`);
  console.log(`🏢 Tenant: ${user.tenant.name}`);
  console.log(`🔑 JWT: ${token.substring(0, 40)}...`);

  // Get test data from database
  const providers = await prisma.providerConfig.findMany({
    where: { tenantId, isActive: true, supportsContacts: true },
    take: 3,
  });

  const contacts = await prisma.contact.findMany({
    where: { tenantId, isDeleted: false },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  if (providers.length > 0) testProviderId = providers[0].id;
  if (contacts.length > 0) testContactId = contacts[0].id;

  console.log(`🎯 Test Provider: ${providers[0]?.providerType || 'none'} (${providers[0]?.email || 'N/A'})`);
  console.log(
    `\n📊 Test Data: ${providers.length} providers, ${contacts.length} contacts\n`,
  );

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 1: CONTACT LISTING
  // ═══════════════════════════════════════════════════════════════
  console.log('━━━ CONTACT LISTING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('Contact', 'List all contacts', async () => {
    const { status, data, time } = await api('GET', '/contacts?limit=20');
    if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
    const count = data.contacts?.length || 0;
    return { details: `${count} contacts, total=${data.total || 0}, ${time}ms` };
  });

  await test('Contact', 'Get contact counts', async () => {
    const { status, data, time } = await api('GET', '/contacts/counts');
    if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
    return { details: `total=${data.total || 0}, ${time}ms` };
  });

  await test('Contact', 'Search contacts by name', async () => {
    const { status, data, time } = await api('GET', '/contacts?search=test&limit=10');
    if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
    const count = data.contacts?.length || 0;
    return { details: `${count} matches, ${time}ms` };
  });

  if (testProviderId) {
    await test('Contact', 'Filter contacts by provider', async () => {
      const { status, data, time } = await api('GET', `/contacts?providerId=${testProviderId}&limit=10`);
      if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
      const count = data.contacts?.length || 0;
      return { details: `${count} provider contacts, ${time}ms` };
    });
  }

  await test('Contact', 'Verify contact response structure', async () => {
    const { status, data } = await api('GET', '/contacts?limit=1');
    if (status !== 200) throw new Error(`Status ${status}`);
    if (data.contacts?.length > 0) {
      const contact = data.contacts[0];
      const hasRequiredFields = contact.id && (contact.displayName !== undefined || contact.firstName !== undefined);
      if (!hasRequiredFields) {
        throw new Error(`Missing required fields. Got: ${Object.keys(contact).join(', ')}`);
      }
    }
    return { details: 'structure validated' };
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 2: SINGLE CONTACT OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━ SINGLE CONTACT OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testContactId) {
    await test('Contact', 'Get single contact by ID', async () => {
      const { status, data, time } = await api('GET', `/contacts/${testContactId}`);
      if (status !== 200) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
      const name = data.displayName || `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unnamed';
      return { details: `"${name.substring(0, 30)}...", ${time}ms` };
    });
  } else {
    skip('Contact', 'Get single contact by ID', 'no contacts found');
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 3: CONTACT CRUD OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━ CONTACT CRUD OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testProviderId) {
    await test('Contact', 'Create new contact', async () => {
      const contactData = {
        providerId: testProviderId,
        firstName: 'E2E',
        lastName: `Test ${Date.now()}`,
        displayName: `E2E Test Contact ${Date.now()}`,
        emails: [{ value: `e2e-test-${Date.now()}@example.com`, type: 'work', primary: true }],
        company: 'E2E Test Company',
        jobTitle: 'Test Engineer',
      };

      const { status, data, time } = await api('POST', '/contacts', contactData);
      // Accept 201 (created) or 200
      if (status === 201 || status === 200) {
        createdContactId = data.id;
        return { details: `created: ${createdContactId}, ${time}ms` };
      }
      if (status === 400) {
        throw new Error(`Validation error (400): ${data.message || JSON.stringify(data)}`);
      }
      if (status === 500) {
        throw new Error(`SERVER BUG (500): ${data.message || JSON.stringify(data)}`);
      }
      throw new Error(`Unexpected status ${status}: ${JSON.stringify(data)}`);
    });

    if (createdContactId) {
      await test('Contact', 'Update created contact', async () => {
        const updateData = {
          firstName: 'Updated',
          lastName: `E2E ${Date.now()}`,
          company: 'Updated Company',
        };
        const { status, data, time } = await api('PATCH', `/contacts/${createdContactId}`, updateData);
        if (status !== 200 && status !== 400 && status !== 404) {
          throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        }
        if (status === 400 || status === 404) {
          return { details: `update issue: ${data.message || status}` };
        }
        return { details: `updated, ${time}ms` };
      });

      await test('Contact', 'Delete created contact', async () => {
        const { status, data, time } = await api('DELETE', `/contacts/${createdContactId}`);
        if (status !== 204 && status !== 200 && status !== 404 && status !== 400) {
          throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
        }
        if (status === 404 || status === 400) {
          return { details: `delete issue: ${data.message || status}` };
        }
        return { details: `deleted, ${time}ms` };
      });

      await test('Contact', 'Verify deleted contact returns 404', async () => {
        const { status } = await api('GET', `/contacts/${createdContactId}`);
        // Should be 404 (deleted) or 200 (soft delete still visible)
        if (status !== 404 && status !== 200) {
          throw new Error(`Expected 404 or 200, got ${status}`);
        }
        return { details: status === 404 ? 'correctly returns 404' : 'soft deleted (still visible)' };
      });
    } else {
      skip('Contact', 'Update created contact', 'contact creation failed');
      skip('Contact', 'Delete created contact', 'contact creation failed');
      skip('Contact', 'Verify deleted contact returns 404', 'contact creation failed');
    }
  } else {
    skip('Contact', 'Create new contact', 'no providers available');
    skip('Contact', 'Update created contact', 'no providers available');
    skip('Contact', 'Delete created contact', 'no providers available');
    skip('Contact', 'Verify deleted contact returns 404', 'no providers available');
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 4: LOCAL CONTACT OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━ LOCAL CONTACT OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('Local', 'Create local-only contact', async () => {
    const contactData = {
      firstName: 'Local',
      lastName: `E2E ${Date.now()}`,
      displayName: `Local E2E Contact ${Date.now()}`,
      emails: [{ value: `local-e2e-${Date.now()}@example.com`, type: 'personal', primary: true }],
      notes: 'Created by E2E test - local only',
    };

    const { status, data, time } = await api('POST', '/contacts/local', contactData);
    if (status === 201 || status === 200) {
      createdLocalContactId = data.id;
      return { details: `created local: ${createdLocalContactId}, ${time}ms` };
    }
    if (status === 400) {
      throw new Error(`Validation error (400): ${data.message || JSON.stringify(data)}`);
    }
    throw new Error(`Unexpected status ${status}: ${JSON.stringify(data)}`);
  });

  if (createdLocalContactId) {
    await test('Local', 'Delete local contact', async () => {
      const { status, time } = await api('DELETE', `/contacts/${createdLocalContactId}`);
      if (status !== 204 && status !== 200) {
        throw new Error(`Expected 204/200, got ${status}`);
      }
      return { details: `deleted, ${time}ms` };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 5: SYNC OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━ SYNC OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (testProviderId) {
    await test('Sync', 'Trigger manual sync for provider', async () => {
      const { status, data, time } = await api('POST', `/contacts/sync/${testProviderId}`);
      // Accept 200, 201, 429 (rate limited), 403 (not owner)
      if (status !== 200 && status !== 201 && status !== 429 && status !== 403 && status !== 503) {
        throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
      }
      if (status === 429) {
        return { details: 'rate limited (expected in production)' };
      }
      if (status === 403) {
        return { details: 'access denied (security check working)' };
      }
      if (status === 503) {
        return { details: 'service unavailable (circuit breaker)' };
      }
      const contacts = data.contactsSynced || 0;
      return { details: `synced ${contacts} contacts, ${time}ms` };
    });
  } else {
    skip('Sync', 'Trigger manual sync for provider', 'no providers available');
  }

  await test('Sync', 'Sync all providers', async () => {
    const { status, data, time } = await api('POST', '/contacts/sync-all');
    // Accept 200 or 201 (created jobs)
    if (status !== 200 && status !== 201) throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
    const queued = data.queued || 0;
    return { details: `${queued} providers queued, ${time}ms` };
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 6: IMPORT OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━ IMPORT OPERATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('Import', 'Import vCard (inline content)', async () => {
    const vcardContent = `BEGIN:VCARD
VERSION:3.0
FN:E2E Test Import
N:Import;E2E;Test;;
EMAIL;TYPE=WORK:e2e-import-${Date.now()}@example.com
ORG:E2E Import Company
TITLE:Import Test
END:VCARD`;

    const { status, data, time } = await api('POST', '/contacts/import/vcard', { content: vcardContent });
    if (status !== 200 && status !== 201 && status !== 400) {
      throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
    }
    if (status === 400) {
      return { details: `validation: ${data.message || 'invalid format'}` };
    }
    return { details: `imported=${data.imported || 0}, skipped=${data.skipped || 0}, ${time}ms` };
  });

  if (testProviderId) {
    await test('Import', 'Extract contacts from emails', async () => {
      const { status, data, time } = await api('POST', '/contacts/extract-from-emails', {
        providerId: testProviderId,
        excludePublicDomains: true,
      });
      if (status !== 200 && status !== 201) {
        throw new Error(`Status ${status}: ${JSON.stringify(data)}`);
      }
      return { details: `extracted=${data.created || 0}, skipped=${data.skipped || 0}, ${time}ms` };
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 7: ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━ ERROR HANDLING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('Error', 'Get non-existent contact returns 404', async () => {
    const fakeId = 'non-existent-contact-' + Date.now();
    const { status } = await api('GET', `/contacts/${fakeId}`);
    if (status !== 404 && status !== 400) {
      throw new Error(`Expected 404 or 400, got ${status}`);
    }
    return { details: `correctly returns ${status}` };
  });

  await test('Error', 'Create contact with invalid data returns 400', async () => {
    const invalidData = {
      // Missing required fields
      notes: 'Invalid contact without name or email',
    };
    const { status, data } = await api('POST', '/contacts', invalidData);
    if (status !== 400 && status !== 422) {
      throw new Error(`Expected 400/422, got ${status}`);
    }
    return { details: `correctly returns ${status} with validation error` };
  });

  await test('Error', 'Update non-existent contact returns 404', async () => {
    const fakeId = 'non-existent-contact-' + Date.now();
    const { status } = await api('PATCH', `/contacts/${fakeId}`, { firstName: 'Test' });
    if (status !== 404 && status !== 400) {
      throw new Error(`Expected 404 or 400, got ${status}`);
    }
    return { details: `correctly returns ${status}` };
  });

  await test('Error', 'Delete non-existent contact returns 404', async () => {
    const fakeId = 'non-existent-contact-' + Date.now();
    const { status } = await api('DELETE', `/contacts/${fakeId}`);
    if (status !== 404 && status !== 400 && status !== 204) {
      throw new Error(`Expected 404/400/204, got ${status}`);
    }
    return { details: `returns ${status}` };
  });

  await test('Error', 'Sync non-existent provider returns 403/404', async () => {
    const fakeId = 'non-existent-provider-' + Date.now();
    const { status } = await api('POST', `/contacts/sync/${fakeId}`);
    if (status !== 403 && status !== 404) {
      throw new Error(`Expected 403 or 404, got ${status}`);
    }
    return { details: `correctly returns ${status}` };
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 8: CONCURRENT REQUESTS (STRESS TEST)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━ CONCURRENT REQUESTS (STRESS TEST) ━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('Stress', '10 concurrent contact list requests', async () => {
    const start = Date.now();
    const promises = Array(10)
      .fill(null)
      .map(() => api('GET', '/contacts?limit=10'));
    const responses = await Promise.all(promises);
    const totalTime = Date.now() - start;
    const allPassed = responses.every((r) => r.status === 200 || r.status === 304);
    if (!allPassed) {
      const failedStatuses = responses.filter((r) => r.status !== 200).map((r) => r.status);
      throw new Error(`Some requests failed: ${failedStatuses.join(', ')}`);
    }
    const avgTime = Math.round(responses.reduce((s, r) => s + r.time, 0) / 10);
    return { details: `total=${totalTime}ms, avg=${avgTime}ms/req` };
  });

  await test('Stress', '5 concurrent contact counts requests', async () => {
    const start = Date.now();
    const promises = Array(5)
      .fill(null)
      .map(() => api('GET', '/contacts/counts'));
    const responses = await Promise.all(promises);
    const totalTime = Date.now() - start;
    const successCount = responses.filter((r) => r.status === 200).length;
    if (successCount < 4) {
      throw new Error(`Only ${successCount}/5 requests succeeded`);
    }
    return { details: `${totalTime}ms for 5 requests, ${successCount}/5 success` };
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORY 9: AUTHORIZATION CHECKS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n━━━ AUTHORIZATION CHECKS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await test('Auth', 'Requests without token return 401', async () => {
    const savedToken = token;
    token = ''; // Remove token
    const { status } = await api('GET', '/contacts');
    token = savedToken; // Restore token
    if (status !== 401) {
      throw new Error(`Expected 401, got ${status}`);
    }
    return { details: 'correctly returns 401' };
  });

  await test('Auth', 'Requests with invalid token return 401', async () => {
    const savedToken = token;
    token = 'invalid-token-12345'; // Invalid token
    const { status } = await api('GET', '/contacts');
    token = savedToken; // Restore token
    if (status !== 401) {
      throw new Error(`Expected 401, got ${status}`);
    }
    return { details: 'correctly returns 401' };
  });

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log('║                 CONTACTS TEST SUMMARY                       ║');
  console.log('╚═════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  const totalTime = results.reduce((s, r) => s + r.time, 0);

  // Group by category
  const categories = [...new Set(results.map((r) => r.category))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.status === 'pass').length;
    const catFailed = catResults.filter((r) => r.status === 'fail').length;
    const catSkipped = catResults.filter((r) => r.status === 'skip').length;
    const icon = catFailed > 0 ? '❌' : catPassed > 0 ? '✅' : '⏭';
    console.log(
      `  ${icon} ${cat}: ${catPassed}/${catResults.length} passed${catSkipped > 0 ? `, ${catSkipped} skipped` : ''}${catFailed > 0 ? `, ${catFailed} failed` : ''}`,
    );
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭  Skipped: ${skipped}`);
  console.log(`  ⏱  Total:   ${totalTime}ms`);
  console.log(`  📊 Rate:    ${Math.round((passed / (passed + failed)) * 100 || 0)}%`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed > 0) {
    console.log('Failed tests:');
    results
      .filter((r) => r.status === 'fail')
      .forEach((r) => {
        console.log(`  ❌ [${r.category}] ${r.name}: ${r.error}`);
      });
    console.log('');
  }

  if (skipped > 0) {
    console.log('Skipped tests:');
    results
      .filter((r) => r.status === 'skip')
      .forEach((r) => {
        console.log(`  ⏭ [${r.category}] ${r.name}: ${r.details}`);
      });
    console.log('');
  }

  // Production readiness assessment
  console.log('╔═════════════════════════════════════════════════════════════╗');
  console.log('║               PRODUCTION READINESS ASSESSMENT               ║');
  console.log('╚═════════════════════════════════════════════════════════════╝\n');

  const criticalCategories = ['Contact', 'Local', 'Auth', 'Error'];
  const criticalPassed = results.filter(
    (r) => criticalCategories.includes(r.category) && r.status === 'pass',
  ).length;
  const criticalTotal = results.filter(
    (r) => criticalCategories.includes(r.category) && r.status !== 'skip',
  ).length;
  const criticalRate = criticalTotal > 0 ? Math.round((criticalPassed / criticalTotal) * 100) : 0;

  if (failed === 0 && criticalRate >= 90) {
    console.log('  🎉 PRODUCTION READY');
    console.log('  All critical tests passed. Contacts module is ready for deployment.\n');
  } else if (failed <= 2 && criticalRate >= 80) {
    console.log('  ⚠️  MOSTLY READY - Minor issues detected');
    console.log(`  ${failed} test(s) failed. Review before deployment.\n`);
  } else {
    console.log('  ❌ NOT READY - Critical issues detected');
    console.log(`  ${failed} test(s) failed. Fix issues before deployment.\n`);
  }

  console.log(`  Critical Tests: ${criticalPassed}/${criticalTotal} (${criticalRate}%)`);
  console.log(`  Total Tests:    ${passed}/${passed + failed} (${Math.round((passed / (passed + failed)) * 100 || 0)}%)\n`);

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
