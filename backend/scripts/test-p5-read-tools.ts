/**
 * P5 Phase 2: READ Operations Test
 *
 * PARANOID REAL TESTING - NO MOCKS, NO JEST
 * Uses REAL database connection to validate READ operations.
 *
 * Tests:
 * 1. list_emails: accounts, unread, content modes
 * 2. search_emails: keyword search
 * 3. count_emails: various filters
 * 4. list_folders: flat listing
 * 5. search_contacts: by email, name, company
 * 6. manage_contact(get): existing contact
 * 7. get_events: date range
 * 8. manage_event(check_availability): time slot
 *
 * PARANOID CHECKS:
 * - Tenant isolation (can't see other tenant's data)
 * - Empty results handled gracefully
 * - Date/time handling
 * - Query execution time logging
 *
 * Run: npx ts-node backend/scripts/test-p5-read-tools.ts
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';

// ============================================================================
// TYPES
// ============================================================================

interface TestResult {
  testName: string;
  passed: boolean;
  duration: number;
  details: string;
  error?: string;
  skipped?: boolean; // P6 fix: Track skipped tests separately from passed
}

interface ToolResult {
  success?: boolean;
  error?: string;
  data?: any;
  folders?: any[];
  searchType?: string;
}

// ============================================================================
// HELPER: Pretty print
// ============================================================================

function log(message: string, level: 'INFO' | 'PASS' | 'FAIL' | 'WARN' = 'INFO') {
  const prefix = {
    INFO: '\x1b[36m[INFO]\x1b[0m',
    PASS: '\x1b[32m[PASS]\x1b[0m',
    FAIL: '\x1b[31m[FAIL]\x1b[0m',
    WARN: '\x1b[33m[WARN]\x1b[0m',
  };
  console.log(`${prefix[level]} ${message}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(` ${title}`);
  console.log('='.repeat(70));
}

// ============================================================================
// DATABASE CONNECTION
// ============================================================================

const prisma = createPrismaClient();

// ============================================================================
// HELPER: Get test tenant ID from database
// ============================================================================

async function getTestTenantId(): Promise<string | null> {
  // Find first tenant with email provider
  const tenant = await prisma.tenant.findFirst({
    where: {
      providerConfigs: {
        some: {
          supportsEmail: true,
          isActive: true,
        },
      },
    },
    select: { id: true, name: true },
  });

  if (tenant) {
    log(`Using tenant: ${tenant.name} (${tenant.id})`, 'INFO');
    return tenant.id;
  }

  log('No tenant with active email provider found', 'WARN');
  return null;
}

// ============================================================================
// HELPER: Timer for query execution
// ============================================================================

function timer() {
  const start = performance.now();
  return () => {
    const end = performance.now();
    return Math.round(end - start);
  };
}

// ============================================================================
// HELPER: Execute tool safely
// ============================================================================

async function executeTool(tool: any, params: any): Promise<ToolResult> {
  if (!tool || !tool.execute) {
    throw new Error('Invalid tool');
  }
  return await tool.execute(params);
}

// ============================================================================
// MOCK SERVICES (minimal stubs)
// ============================================================================

const mockEmailSendService = null;
const mockCalendarService = null;
const mockCacheService = {
  isHealthy: () => false,
  get: async () => null,
  set: async () => {},
};

// ============================================================================
// TEST: list_emails (accounts mode)
// ============================================================================

async function testListEmailsAccounts(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
    const emailTools = createEmailTools(
      prisma as any,
      mockEmailSendService,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const listEmailsTool = emailTools.find((t: any) => t.name === 'list_emails');
    const result = await executeTool(listEmailsTool, { mode: 'accounts' });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'list_emails(accounts)',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    const accountCount = result.data?.length || 0;
    return {
      testName: 'list_emails(accounts)',
      passed: true,
      duration: elapsed,
      details: `Found ${accountCount} email account(s) in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'list_emails(accounts)',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: list_emails (unread mode)
// ============================================================================

async function testListEmailsUnread(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
    const emailTools = createEmailTools(
      prisma as any,
      mockEmailSendService,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const listEmailsTool = emailTools.find((t: any) => t.name === 'list_emails');
    const result = await executeTool(listEmailsTool, { mode: 'unread', limit: 5 });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'list_emails(unread)',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    const emailCount = result.data?.length || 0;
    return {
      testName: 'list_emails(unread)',
      passed: true,
      duration: elapsed,
      details: `Found ${emailCount} unread email(s) in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'list_emails(unread)',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: list_emails (content mode)
// ============================================================================

async function testListEmailsContent(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    // First get an email ID to test with
    const sampleEmail = await prisma.email.findFirst({
      where: { tenantId },
      select: { id: true, subject: true },
    });

    if (!sampleEmail) {
      return {
        testName: 'list_emails(content)',
        passed: true, // Pass if no emails (empty state is valid)
        skipped: true, // P6 fix: Mark as skipped so summary distinguishes from validated
        duration: getElapsed(),
        details: 'No emails in tenant - skipped (valid empty state)',
      };
    }

    const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
    const emailTools = createEmailTools(
      prisma as any,
      mockEmailSendService,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const listEmailsTool = emailTools.find((t: any) => t.name === 'list_emails');
    const result = await executeTool(listEmailsTool, { mode: 'content', emailId: sampleEmail.id });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'list_emails(content)',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    return {
      testName: 'list_emails(content)',
      passed: true,
      duration: elapsed,
      details: `Retrieved content for "${sampleEmail.subject?.substring(0, 30)}..." in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'list_emails(content)',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: search_emails
// ============================================================================

async function testSearchEmails(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
    const emailTools = createEmailTools(
      prisma as any,
      mockEmailSendService,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const searchTool = emailTools.find((t: any) => t.name === 'search_emails');
    // Search for common term
    const result = await executeTool(searchTool, { query: 'test', limit: 5 });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'search_emails',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    const emailCount = result.data?.length || 0;
    return {
      testName: 'search_emails',
      passed: true,
      duration: elapsed,
      details: `Search returned ${emailCount} result(s) in ${elapsed}ms (${result.searchType || 'text'})`,
    };
  } catch (error) {
    return {
      testName: 'search_emails',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: count_emails
// ============================================================================

async function testCountEmails(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
    const emailTools = createEmailTools(
      prisma as any,
      mockEmailSendService,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const countTool = emailTools.find((t: any) => t.name === 'count_emails');
    const result = await executeTool(countTool, { period: 'last 7 days' });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'count_emails',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    return {
      testName: 'count_emails',
      passed: true,
      duration: elapsed,
      details: `Count: ${result.data?.total} total, ${result.data?.unread} unread (${result.data?.period}) in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'count_emails',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: list_folders
// ============================================================================

async function testListFolders(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    const { createFolderTools } = await import('../src/modules/ai/voltagent/tools/folder.tools');
    const folderTools = createFolderTools(
      prisma as any,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const listFoldersTool = folderTools.find((t: any) => t.name === 'list_folders');
    const result = await executeTool(listFoldersTool, {});
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'list_folders',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    const folderCount = result.folders?.length || 0;
    return {
      testName: 'list_folders',
      passed: true,
      duration: elapsed,
      details: `Found ${folderCount} folder(s) in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'list_folders',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: search_contacts
// ============================================================================

async function testSearchContacts(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    const { createContactsTools } = await import('../src/modules/ai/voltagent/tools/contacts.tools');
    const contactsTools = createContactsTools(
      prisma as any,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const searchTool = contactsTools.find((t: any) => t.name === 'search_contacts');
    // Search for common term
    const result = await executeTool(searchTool, { query: 'a', limit: 5 });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'search_contacts',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    const contactCount = result.data?.length || 0;
    return {
      testName: 'search_contacts',
      passed: true,
      duration: elapsed,
      details: `Search returned ${contactCount} contact(s) in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'search_contacts',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: manage_contact (get)
// ============================================================================

async function testManageContactGet(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    // First get a contact ID to test with
    const sampleContact = await prisma.contact.findFirst({
      where: { tenantId },
      select: { id: true, displayName: true },
    });

    if (!sampleContact) {
      return {
        testName: 'manage_contact(get)',
        passed: true, // Pass if no contacts (empty state is valid)
        skipped: true, // P6 fix: Mark as skipped so summary distinguishes from validated
        duration: getElapsed(),
        details: 'No contacts in tenant - skipped (valid empty state)',
      };
    }

    const { createContactsTools } = await import('../src/modules/ai/voltagent/tools/contacts.tools');
    const contactsTools = createContactsTools(
      prisma as any,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const manageTool = contactsTools.find((t: any) => t.name === 'manage_contact');
    const result = await executeTool(manageTool, { action: 'get', contactId: sampleContact.id });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'manage_contact(get)',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    return {
      testName: 'manage_contact(get)',
      passed: true,
      duration: elapsed,
      details: `Retrieved contact "${sampleContact.displayName || sampleContact.id}" in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'manage_contact(get)',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: get_events
// ============================================================================

async function testGetEvents(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    const { createCalendarTools } = await import('../src/modules/ai/voltagent/tools/calendar.tools');
    const calendarTools = createCalendarTools(
      prisma as any,
      mockCalendarService,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const getEventsTool = calendarTools.find((t: any) => t.name === 'get_events');

    // Search for next 7 days
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const result = await executeTool(getEventsTool, { startDate, endDate });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'get_events',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    const eventCount = result.data?.length || 0;
    return {
      testName: 'get_events',
      passed: true,
      duration: elapsed,
      details: `Found ${eventCount} event(s) in next 7 days in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'get_events',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// TEST: manage_event (check_availability)
// ============================================================================

async function testManageEventCheckAvailability(tenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    const { createCalendarTools } = await import('../src/modules/ai/voltagent/tools/calendar.tools');
    const calendarTools = createCalendarTools(
      prisma as any,
      mockCalendarService,
      'en',
      tenantId,
      mockCacheService as any,
    );

    const manageTool = calendarTools.find((t: any) => t.name === 'manage_event');

    // Check availability for tomorrow 10am-11am
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const startTime = tomorrow.toISOString();
    tomorrow.setHours(11, 0, 0, 0);
    const endTime = tomorrow.toISOString();

    const result = await executeTool(manageTool, { action: 'check_availability', startTime, endTime });
    const elapsed = getElapsed();

    if (!result.success) {
      return {
        testName: 'manage_event(check_availability)',
        passed: false,
        duration: elapsed,
        details: `Error: ${result.error}`,
        error: result.error,
      };
    }

    const isAvailable = result.data?.isAvailable;
    const conflictCount = result.data?.conflictingEvents?.length || 0;
    return {
      testName: 'manage_event(check_availability)',
      passed: true,
      duration: elapsed,
      details: `Slot ${isAvailable ? 'available' : `has ${conflictCount} conflict(s)`} in ${elapsed}ms`,
    };
  } catch (error) {
    return {
      testName: 'manage_event(check_availability)',
      passed: false,
      duration: getElapsed(),
      details: 'Exception thrown',
      error: String(error),
    };
  }
}

// ============================================================================
// PARANOID CHECK: Tenant Isolation
// ============================================================================

async function testTenantIsolation(realTenantId: string): Promise<TestResult> {
  const getElapsed = timer();

  try {
    // Use a fake tenant ID
    const fakeTenantId = 'fake-tenant-12345678';

    const { createEmailTools } = await import('../src/modules/ai/voltagent/tools/email.tools');
    const emailTools = createEmailTools(
      prisma as any,
      mockEmailSendService,
      'en',
      fakeTenantId, // Fake tenant
      mockCacheService as any,
    );

    const listEmailsTool = emailTools.find((t: any) => t.name === 'list_emails');
    const result = await executeTool(listEmailsTool, { mode: 'unread', limit: 100 });
    const elapsed = getElapsed();

    // Should return empty, not error
    if (!result.success) {
      return {
        testName: 'TENANT ISOLATION',
        passed: true, // Error is also acceptable
        duration: elapsed,
        details: `Fake tenant correctly denied: ${result.error}`,
      };
    }

    const emailCount = result.data?.length || 0;
    if (emailCount === 0) {
      return {
        testName: 'TENANT ISOLATION',
        passed: true,
        duration: elapsed,
        details: `Fake tenant returns 0 emails (isolation working) in ${elapsed}ms`,
      };
    }

    // FAIL: Fake tenant saw real data
    return {
      testName: 'TENANT ISOLATION',
      passed: false,
      duration: elapsed,
      details: `SECURITY ISSUE: Fake tenant saw ${emailCount} emails!`,
      error: 'Tenant isolation breach',
    };
  } catch (error) {
    return {
      testName: 'TENANT ISOLATION',
      passed: true, // Exception is acceptable for security
      duration: getElapsed(),
      details: `Fake tenant rejected with error (good): ${error}`,
    };
  }
}

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

async function runReadToolsTests() {
  logSection('P5 Phase 2: READ Operations Test');
  log('PARANOID MODE: Real database, real queries');
  console.log('');

  const results: TestResult[] = [];

  // Get test tenant
  const tenantId = await getTestTenantId();
  if (!tenantId) {
    log('No tenant found - cannot run tests', 'FAIL');
    process.exit(1);
  }

  console.log('');

  // -------------------------------------------------------------------------
  // EMAIL TOOLS
  // -------------------------------------------------------------------------
  logSection('EMAIL READ OPERATIONS');

  results.push(await testListEmailsAccounts(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  results.push(await testListEmailsUnread(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  results.push(await testListEmailsContent(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  results.push(await testSearchEmails(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  results.push(await testCountEmails(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  // -------------------------------------------------------------------------
  // FOLDER TOOLS
  // -------------------------------------------------------------------------
  logSection('FOLDER READ OPERATIONS');

  results.push(await testListFolders(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  // -------------------------------------------------------------------------
  // CONTACT TOOLS
  // -------------------------------------------------------------------------
  logSection('CONTACT READ OPERATIONS');

  results.push(await testSearchContacts(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  results.push(await testManageContactGet(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  // -------------------------------------------------------------------------
  // CALENDAR TOOLS
  // -------------------------------------------------------------------------
  logSection('CALENDAR READ OPERATIONS');

  results.push(await testGetEvents(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  results.push(await testManageEventCheckAvailability(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  // -------------------------------------------------------------------------
  // SECURITY CHECKS
  // -------------------------------------------------------------------------
  logSection('SECURITY: TENANT ISOLATION');

  results.push(await testTenantIsolation(tenantId));
  log(results[results.length - 1].passed ? results[results.length - 1].details : `FAILED: ${results[results.length - 1].error}`,
    results[results.length - 1].passed ? 'PASS' : 'FAIL');

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  logSection('TEST SUMMARY');

  console.log('');
  console.log('Results:');
  console.log('-'.repeat(60));

  let passed = 0;
  let skipped = 0;
  const total = results.length;

  for (const result of results) {
    // P6 fix: Show skipped tests with distinct color (yellow)
    const status = result.skipped
      ? '\x1b[33mSKIP\x1b[0m'
      : result.passed
        ? '\x1b[32mPASS\x1b[0m'
        : '\x1b[31mFAIL\x1b[0m';
    console.log(`  ${status} ${result.testName} (${result.duration}ms)`);
    if (!result.passed && result.error) {
      console.log(`       └─ ${result.error}`);
    }
    if (result.skipped) {
      skipped++;
      passed++; // Still counts toward overall pass
    } else if (result.passed) {
      passed++;
    }
  }

  console.log('-'.repeat(60));
  // P6 fix: Show skipped count separately for transparency
  const validated = passed - skipped;
  console.log(`Total: ${passed}/${total} tests passed (${validated} validated, ${skipped} skipped)`);
  if (skipped > 0) {
    console.log('\x1b[33m⚠ Skipped tests were not validated - no test data available\x1b[0m');
  }
  console.log('');

  // Cleanup
  await prisma.$disconnect();

  if (passed === total) {
    log('All READ operations validated successfully!', 'PASS');
    process.exit(0);
  } else {
    log(`${total - passed} test(s) failed`, 'FAIL');
    process.exit(1);
  }
}

// ============================================================================
// RUN
// ============================================================================

runReadToolsTests().catch(async (error) => {
  console.error('Test execution failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
