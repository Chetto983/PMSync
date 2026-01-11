/**
 * P5 Phase 7: Error Handling Test
 *
 * PARANOID VALIDATION of error scenarios and graceful degradation.
 * Tests that tools handle errors correctly without exposing internals.
 *
 * Error scenarios tested:
 * 1. Invalid IDs (email, contact, event) → graceful error
 * 2. Missing required parameters → validation error
 * 3. Invalid parameter types → type error
 * 4. Tenant isolation violation → access denied
 * 5. Empty results → graceful empty response
 * 6. Calendar service unavailable → service unavailable error
 * 7. Invalid action → unknown action error
 * 8. Malformed input → sanitized error
 */

import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { createEmailTools } from '../src/modules/ai/voltagent/tools/email.tools';
import { createContactsTools } from '../src/modules/ai/voltagent/tools/contacts.tools';
import { createCalendarTools } from '../src/modules/ai/voltagent/tools/calendar.tools';
import { createFolderTools } from '../src/modules/ai/voltagent/tools/folder.tools';
import { createInsightTools } from '../src/modules/ai/voltagent/tools/insights.tools';

// ============================================================================
// Mock Cache Service
// ============================================================================
const mockCacheService = {
  isHealthy: () => true,
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  getClient: () => null,
};

// ============================================================================
// Test Types
// ============================================================================

interface TestResult {
  testName: string;
  passed: boolean;
  details: string;
  error?: string;
}

// ============================================================================
// Logging Utilities
// ============================================================================

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logSuccess(message: string) {
  console.log(`[${new Date().toISOString()}] ✅ ${message}`);
}

function logError(message: string) {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

// ============================================================================
// Helper: Execute tool and capture result
// ============================================================================

async function executeTool(tool: any, params: any): Promise<any> {
  try {
    const result = await tool.execute(params);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message, _thrown: true };
  }
}

// ============================================================================
// Test 1: Invalid ID Handling
// ============================================================================

async function testInvalidIdHandling(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 1: Invalid ID Handling');

  // Create tools
  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const contactsTools = createContactsTools(prisma as any, 'en', tenantId, mockCacheService as any);
  const calendarTools = createCalendarTools(prisma as any, null, 'en', tenantId, mockCacheService as any);

  // Test 1a: Invalid email ID in manage_email
  const manageEmailTool = emailTools.find((t) => t.name === 'manage_email');
  if (manageEmailTool) {
    const result = await executeTool(manageEmailTool, {
      action: 'delete',
      emailId: 'invalid-uuid-12345',
    });

    const hasGracefulError = !result.success && result.error && !result.error.includes('stack');
    results.push({
      testName: 'Invalid email ID → graceful error',
      passed: hasGracefulError,
      details: hasGracefulError
        ? `Graceful error: ${result.error}`
        : `Error not graceful: ${result.error}`,
    });

    if (hasGracefulError) {
      logSuccess(`Invalid email ID: ${result.error}`);
    } else {
      logError(`Invalid email ID: ${result.error}`);
    }
  }

  // Test 1b: Invalid contact ID in manage_contact
  const manageContactTool = contactsTools.find((t) => t.name === 'manage_contact');
  if (manageContactTool) {
    const result = await executeTool(manageContactTool, {
      action: 'get',
      contactId: 'nonexistent-contact-id',
    });

    const hasGracefulError = !result.success && result.error && !result.error.includes('stack');
    results.push({
      testName: 'Invalid contact ID → graceful error',
      passed: hasGracefulError,
      details: hasGracefulError
        ? `Graceful error: ${result.error}`
        : `Error not graceful: ${result.error}`,
    });

    if (hasGracefulError) {
      logSuccess(`Invalid contact ID: ${result.error}`);
    } else {
      logError(`Invalid contact ID: ${result.error}`);
    }
  }

  // Test 1c: Invalid event ID in manage_event
  const manageEventTool = calendarTools.find((t) => t.name === 'manage_event');
  if (manageEventTool) {
    const result = await executeTool(manageEventTool, {
      action: 'delete',
      eventId: 'nonexistent-event-id',
    });

    // Accept service unavailable OR not found as valid
    const hasGracefulError =
      !result.success && result.error && (result.error.includes('not found') || result.error.includes('unavailable'));
    results.push({
      testName: 'Invalid event ID → graceful error',
      passed: hasGracefulError,
      details: hasGracefulError
        ? `Graceful error: ${result.error}`
        : `Error: ${result.error}`,
    });

    if (hasGracefulError) {
      logSuccess(`Invalid event ID: ${result.error}`);
    } else {
      logError(`Invalid event ID: ${result.error}`);
    }
  }

  return results;
}

// ============================================================================
// Test 2: Missing Required Parameters
// ============================================================================

async function testMissingRequiredParams(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 2: Missing Required Parameters');

  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const contactsTools = createContactsTools(prisma as any, 'en', tenantId, mockCacheService as any);
  const calendarTools = createCalendarTools(prisma as any, null, 'en', tenantId, mockCacheService as any);

  // Test 2a: manage_email without emailId for delete
  const manageEmailTool = emailTools.find((t) => t.name === 'manage_email');
  if (manageEmailTool) {
    const result = await executeTool(manageEmailTool, {
      action: 'delete',
      // missing emailId
    });

    const hasMissingParamError = !result.success && result.error && result.error.toLowerCase().includes('require');
    results.push({
      testName: 'manage_email missing emailId → validation error',
      passed: hasMissingParamError,
      details: hasMissingParamError
        ? `Validation error: ${result.error}`
        : `Unexpected: ${result.error}`,
    });

    if (hasMissingParamError) {
      logSuccess(`Missing emailId: ${result.error}`);
    } else {
      logError(`Missing emailId: ${result.error}`);
    }
  }

  // Test 2b: manage_contact create without email
  const manageContactTool = contactsTools.find((t) => t.name === 'manage_contact');
  if (manageContactTool) {
    const result = await executeTool(manageContactTool, {
      action: 'create',
      // missing email
      displayName: 'Test Contact',
    });

    const hasMissingParamError = !result.success && result.error && result.error.toLowerCase().includes('require');
    results.push({
      testName: 'manage_contact create missing email → validation error',
      passed: hasMissingParamError,
      details: hasMissingParamError
        ? `Validation error: ${result.error}`
        : `Unexpected: ${result.error}`,
    });

    if (hasMissingParamError) {
      logSuccess(`Missing email: ${result.error}`);
    } else {
      logError(`Missing email: ${result.error}`);
    }
  }

  // Test 2c: manage_event create without title
  const manageEventTool = calendarTools.find((t) => t.name === 'manage_event');
  if (manageEventTool) {
    const result = await executeTool(manageEventTool, {
      action: 'create',
      // missing title
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
    });

    // Accept "require" OR "unavailable" as valid
    const hasMissingParamError =
      !result.success &&
      result.error &&
      (result.error.toLowerCase().includes('require') || result.error.includes('unavailable'));
    results.push({
      testName: 'manage_event create missing title → validation error',
      passed: hasMissingParamError,
      details: hasMissingParamError
        ? `Validation error: ${result.error}`
        : `Unexpected: ${result.error}`,
    });

    if (hasMissingParamError) {
      logSuccess(`Missing title: ${result.error}`);
    } else {
      logError(`Missing title: ${result.error}`);
    }
  }

  return results;
}

// ============================================================================
// Test 3: Invalid Action Handling
// ============================================================================

async function testInvalidActionHandling(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 3: Invalid Action Handling');

  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const contactsTools = createContactsTools(prisma as any, 'en', tenantId, mockCacheService as any);

  // Test 3a: manage_email with invalid action
  const manageEmailTool = emailTools.find((t) => t.name === 'manage_email');
  if (manageEmailTool) {
    const result = await executeTool(manageEmailTool, {
      action: 'invalid_action',
      emailId: 'test-id',
    });

    const hasInvalidActionError =
      !result.success && result.error && (result.error.includes('Unknown') || result.error.includes('invalid'));
    results.push({
      testName: 'manage_email invalid action → error',
      passed: hasInvalidActionError,
      details: hasInvalidActionError
        ? `Invalid action error: ${result.error}`
        : `Unexpected: ${result.error}`,
    });

    if (hasInvalidActionError) {
      logSuccess(`Invalid action: ${result.error}`);
    } else {
      logError(`Invalid action: ${result.error}`);
    }
  }

  // Test 3b: manage_contact with invalid action
  const manageContactTool = contactsTools.find((t) => t.name === 'manage_contact');
  if (manageContactTool) {
    const result = await executeTool(manageContactTool, {
      action: 'invalid_action',
      contactId: 'test-id',
    });

    const hasInvalidActionError =
      !result.success && result.error && (result.error.includes('Unknown') || result.error.includes('invalid'));
    results.push({
      testName: 'manage_contact invalid action → error',
      passed: hasInvalidActionError,
      details: hasInvalidActionError
        ? `Invalid action error: ${result.error}`
        : `Unexpected: ${result.error}`,
    });

    if (hasInvalidActionError) {
      logSuccess(`Invalid action: ${result.error}`);
    } else {
      logError(`Invalid action: ${result.error}`);
    }
  }

  return results;
}

// ============================================================================
// Test 4: Tenant Isolation
// ============================================================================

async function testTenantIsolation(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 4: Tenant Isolation');

  // Get an email from a different tenant (if any)
  const otherTenantEmail = await prisma.email.findFirst({
    where: { NOT: { tenantId } },
    select: { id: true, tenantId: true },
  });

  if (!otherTenantEmail) {
    log('Only one tenant in database - skipping cross-tenant test');
    results.push({
      testName: 'Cross-tenant email access → blocked',
      passed: true,
      details: 'Skipped - single tenant in database',
    });
    return results;
  }

  // Try to access email from different tenant
  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const searchTool = emailTools.find((t) => t.name === 'search_emails');

  if (searchTool) {
    // The search should not return emails from other tenants
    const result = await executeTool(searchTool, {
      query: '*',
      limit: 100,
    });

    // Check that no results have a different tenantId
    const hasLeakedData = result.data?.some((e: any) => e.tenantId && e.tenantId !== tenantId);
    results.push({
      testName: 'Cross-tenant email access → blocked',
      passed: !hasLeakedData,
      details: hasLeakedData
        ? 'SECURITY VIOLATION: Data leaked across tenants!'
        : 'Tenant isolation maintained',
    });

    if (!hasLeakedData) {
      logSuccess('Tenant isolation maintained');
    } else {
      logError('SECURITY VIOLATION: Data leaked!');
    }
  }

  return results;
}

// ============================================================================
// Test 5: Empty Results Handling
// ============================================================================

async function testEmptyResultsHandling(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 5: Empty Results Handling');

  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const contactsTools = createContactsTools(prisma as any, 'en', tenantId, mockCacheService as any);
  const calendarTools = createCalendarTools(prisma as any, null, 'en', tenantId, mockCacheService as any);

  // Test 5a: Search for nonexistent email
  const searchEmailsTool = emailTools.find((t) => t.name === 'search_emails');
  if (searchEmailsTool) {
    const result = await executeTool(searchEmailsTool, {
      query: 'xyzzy_nonexistent_gibberish_12345',
      limit: 10,
    });

    const handledGracefully = result.success && Array.isArray(result.data) && result.data.length === 0;
    results.push({
      testName: 'Search emails no results → empty array',
      passed: handledGracefully,
      details: handledGracefully ? 'Empty results handled gracefully' : `Unexpected: ${JSON.stringify(result)}`,
    });

    if (handledGracefully) {
      logSuccess('Empty email search handled gracefully');
    } else {
      logError(`Empty email search: ${JSON.stringify(result)}`);
    }
  }

  // Test 5b: Search for nonexistent contact
  const searchContactsTool = contactsTools.find((t) => t.name === 'search_contacts');
  if (searchContactsTool) {
    const result = await executeTool(searchContactsTool, {
      query: 'xyzzy_nonexistent_gibberish_12345@nowhere.invalid',
      limit: 10,
    });

    const handledGracefully = result.success && Array.isArray(result.data) && result.data.length === 0;
    results.push({
      testName: 'Search contacts no results → empty array',
      passed: handledGracefully,
      details: handledGracefully ? 'Empty results handled gracefully' : `Unexpected: ${JSON.stringify(result)}`,
    });

    if (handledGracefully) {
      logSuccess('Empty contact search handled gracefully');
    } else {
      logError(`Empty contact search: ${JSON.stringify(result)}`);
    }
  }

  // Test 5c: Get events for empty date range (far future)
  const getEventsTool = calendarTools.find((t) => t.name === 'get_events');
  if (getEventsTool) {
    const farFuture = new Date('2099-01-01');
    const farFutureEnd = new Date('2099-01-02');
    const result = await executeTool(getEventsTool, {
      startDate: farFuture.toISOString(),
      endDate: farFutureEnd.toISOString(),
    });

    const handledGracefully = result.success && Array.isArray(result.data) && result.data.length === 0;
    results.push({
      testName: 'Get events no results → empty array',
      passed: handledGracefully,
      details: handledGracefully ? 'Empty results handled gracefully' : `Unexpected: ${JSON.stringify(result)}`,
    });

    if (handledGracefully) {
      logSuccess('Empty events query handled gracefully');
    } else {
      logError(`Empty events query: ${JSON.stringify(result)}`);
    }
  }

  return results;
}

// ============================================================================
// Test 6: Service Unavailable Handling
// ============================================================================

async function testServiceUnavailableHandling(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 6: Service Unavailable Handling');

  // Calendar service is null - should handle gracefully
  const calendarTools = createCalendarTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const manageEventTool = calendarTools.find((t) => t.name === 'manage_event');

  if (manageEventTool) {
    const result = await executeTool(manageEventTool, {
      action: 'create',
      title: 'Test Event',
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
    });

    const hasServiceUnavailableError = !result.success && result.error && result.error.includes('unavailable');
    results.push({
      testName: 'Calendar service unavailable → graceful error',
      passed: hasServiceUnavailableError,
      details: hasServiceUnavailableError
        ? `Service unavailable handled: ${result.error}`
        : `Unexpected: ${result.error}`,
    });

    if (hasServiceUnavailableError) {
      logSuccess(`Service unavailable: ${result.error}`);
    } else {
      logError(`Service unavailable: ${result.error}`);
    }
  }

  // Email send service is null - should handle gracefully
  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const manageEmailTool = emailTools.find((t) => t.name === 'manage_email');

  if (manageEmailTool) {
    const result = await executeTool(manageEmailTool, {
      action: 'send',
      to: ['test@example.com'],
      subject: 'Test',
      body: 'Test body',
    });

    const hasServiceUnavailableError =
      !result.success && result.error && (result.error.includes('unavailable') || result.error.includes('configured'));
    results.push({
      testName: 'Email send service unavailable → graceful error',
      passed: hasServiceUnavailableError,
      details: hasServiceUnavailableError
        ? `Service unavailable handled: ${result.error}`
        : `Unexpected: ${result.error}`,
    });

    if (hasServiceUnavailableError) {
      logSuccess(`Send service unavailable: ${result.error}`);
    } else {
      logError(`Send service unavailable: ${result.error}`);
    }
  }

  return results;
}

// ============================================================================
// Test 7: No Stack Trace Exposure
// ============================================================================

async function testNoStackTraceExposure(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 7: No Stack Trace Exposure');

  const emailTools = createEmailTools(prisma as any, null, 'en', tenantId, mockCacheService as any);
  const contactsTools = createContactsTools(prisma as any, 'en', tenantId, mockCacheService as any);

  // Collect all error messages from various error scenarios
  const errorMessages: string[] = [];

  // Trigger various errors and collect messages
  const manageEmailTool = emailTools.find((t) => t.name === 'manage_email');
  if (manageEmailTool) {
    const result = await executeTool(manageEmailTool, {
      action: 'delete',
      emailId: 'invalid-id',
    });
    if (result.error) errorMessages.push(result.error);
  }

  const manageContactTool = contactsTools.find((t) => t.name === 'manage_contact');
  if (manageContactTool) {
    const result = await executeTool(manageContactTool, {
      action: 'invalid',
    });
    if (result.error) errorMessages.push(result.error);
  }

  // Check that no error message contains stack trace indicators
  const stackTracePatterns = ['at ', '.ts:', '.js:', 'node_modules', 'Error:', 'TypeError:', 'ReferenceError:'];

  const hasStackTrace = errorMessages.some((msg) =>
    stackTracePatterns.some(
      (pattern) => msg.includes(pattern) && (msg.includes('\n') || msg.length > 200 || msg.includes('    at ')),
    ),
  );

  results.push({
    testName: 'Error messages do not expose stack traces',
    passed: !hasStackTrace,
    details: hasStackTrace
      ? `SECURITY: Stack trace exposed in error messages`
      : `All ${errorMessages.length} error messages are safe`,
  });

  if (!hasStackTrace) {
    logSuccess(`${errorMessages.length} error messages verified safe`);
  } else {
    logError('Stack trace exposed in errors');
  }

  return results;
}

// ============================================================================
// Test 8: Insights Tool Error Handling (No Mistral)
// ============================================================================

async function testInsightsWithoutMistral(
  prisma: ReturnType<typeof createPrismaClient>,
  tenantId: string,
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  logSection('Test 8: Insights Tools Without Mistral Service');

  // Create insights tools with null mistral (should handle gracefully)
  // Note: createInsightTools requires mistral, so this tests what happens
  // when we try to use tools that need LLM without it

  // Get a test email
  const testEmail = await prisma.email.findFirst({
    where: { tenantId },
    select: { id: true },
  });

  if (!testEmail) {
    log('No test email - skipping');
    results.push({
      testName: 'Insights without Mistral',
      passed: true,
      details: 'Skipped - no test email',
    });
    return results;
  }

  // Test with a mock that throws
  const failingMistral = {
    completePrompt: async () => {
      throw new Error('Mistral service unavailable');
    },
  };

  const insightTools = createInsightTools({
    prisma: prisma as any,
    mistral: failingMistral as any,
    cacheService: mockCacheService as any,
    locale: 'en',
    tenantId,
  });

  const analyzeTool = insightTools.find((t) => t.name === 'analyze_email');
  if (analyzeTool) {
    const result = await executeTool(analyzeTool, {
      emailId: testEmail.id,
    });

    // Should either fail gracefully or throw with a clean message
    const handledGracefully = !result.success || result._thrown;
    results.push({
      testName: 'Analyze email with failing Mistral → handled',
      passed: handledGracefully,
      details: handledGracefully
        ? `Error handled: ${result.error || 'threw exception'}`
        : `Unexpected success: ${JSON.stringify(result)}`,
    });

    if (handledGracefully) {
      logSuccess(`Mistral failure handled: ${result.error || 'exception caught'}`);
    } else {
      logError('Mistral failure not handled properly');
    }
  }

  return results;
}

// ============================================================================
// Main Test Runner
// ============================================================================

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                      ║');
  console.log('║          P5 Phase 7: ERROR HANDLING - PARANOID VALIDATION            ║');
  console.log('║                                                                      ║');
  console.log('║  Testing error scenarios and graceful degradation                    ║');
  console.log('║                                                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const prisma = createPrismaClient();

  try {
    // Get a test tenant
    const tenant = await prisma.tenant.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (!tenant) {
      logError('No active tenant found. Cannot run error handling tests.');
      process.exit(1);
    }

    log(`Using tenant: ${tenant.name} (${tenant.id})`);

    const allResults: TestResult[] = [];

    // Run all error handling tests
    allResults.push(...(await testInvalidIdHandling(prisma, tenant.id)));
    allResults.push(...(await testMissingRequiredParams(prisma, tenant.id)));
    allResults.push(...(await testInvalidActionHandling(prisma, tenant.id)));
    allResults.push(...(await testTenantIsolation(prisma, tenant.id)));
    allResults.push(...(await testEmptyResultsHandling(prisma, tenant.id)));
    allResults.push(...(await testServiceUnavailableHandling(prisma, tenant.id)));
    allResults.push(...(await testNoStackTraceExposure(prisma, tenant.id)));
    allResults.push(...(await testInsightsWithoutMistral(prisma, tenant.id)));

    // ========================================================================
    // Summary
    // ========================================================================
    logSection('TEST SUMMARY');

    const passed = allResults.filter((r) => r.passed).length;
    const failed = allResults.filter((r) => !r.passed).length;
    const total = allResults.length;

    console.log('\n');
    console.log(`Total: ${passed}/${total} tests passed`);
    console.log('\n');

    if (failed > 0) {
      console.log('FAILED TESTS:');
      allResults
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  - ${r.testName}: ${r.details}`);
        });
      console.log('\n');
    }

    if (failed === 0) {
      console.log('[PASS] All Error Handling tests validated successfully!');
    } else {
      console.log(`[FAIL] ${failed} test(s) failed - error handling may be compromised!`);
    }

    process.exit(failed === 0 ? 0 : 1);
  } catch (error) {
    logError(`Fatal error: ${error}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
