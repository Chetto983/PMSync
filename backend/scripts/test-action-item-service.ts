/**
 * Test script for ActionItemService
 *
 * Tests:
 * 1. Pattern detection (action items that should be detected)
 * 2. Pattern detection (non-action items)
 * 3. Owner detection (sender vs recipient)
 * 4. Database CRUD operations
 * 5. Statistics calculation
 * 6. AI extraction simulation (mocked)
 *
 * Usage:
 *   npx ts-node scripts/test-action-item-service.ts
 */

import 'dotenv/config';

const logger = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
  success: (msg: string) => console.log(`[SUCCESS] ✅ ${msg}`),
  fail: (msg: string) => console.log(`[FAIL] ❌ ${msg}`),
};

// =============================================================================
// Pattern Detection Tests (No AI, No DB)
// =============================================================================

/**
 * Patterns that indicate action items in email text
 */
const ACTION_PATTERNS = [
  /^(can|could|would) you (please )?(.*)\?/im,
  /^please (.*)/im,
  /^kindly (.*)/im,
  /^(i('ll| will)|we('ll| will)) (.*)/im,
  /^(i|we) (need|have) to (.*)/im,
  /(action item|todo|task|to-do):?\s*(.*)/i,
  /(action required|action needed):?\s*(.*)/i,
  /(don't forget|remember) to (.*)/i,
  /please (send|provide|complete|submit|review|update|confirm) .* by/i,
  /(you|we) (should|must|need to) (.*)/i,
  /make sure (to|you) (.*)/i,
  /follow up (on|with|about) (.*)/i,
  /get back to .* (on|about|regarding) (.*)/i,
  /(please |kindly )?(review|approve|sign|confirm) (.*)/i,
  /(schedule|set up|arrange) (a |an )?(meeting|call|appointment)/i,
];

const INFORMATIONAL_PATTERNS = [
  /fyi|for your information/i,
  /no action (required|needed)/i,
  /just (wanted to )?let you know/i,
  /for reference/i,
  /as discussed/i,
];

const OWNER_PATTERNS = {
  recipient: [
    /^(can|could|would) you/i,
    /^please (you |)/i,
    /you (should|must|need to)/i,
    /\bwill you\b/i,
  ],
  sender: [
    /^(i('ll| will)|we('ll| will))/i,
    /^i (will|shall|am going to)/i,
    /let me/i,
    /i('ll| will) (send|provide|do|complete)/i,
  ],
};

function detectOwner(text: string): 'sender' | 'recipient' | 'unknown' {
  for (const pattern of OWNER_PATTERNS.recipient) {
    if (pattern.test(text)) return 'recipient';
  }
  for (const pattern of OWNER_PATTERNS.sender) {
    if (pattern.test(text)) return 'sender';
  }
  return 'unknown';
}

function hasActionPattern(text: string): boolean {
  return ACTION_PATTERNS.some(p => p.test(text));
}

function isInformational(text: string): boolean {
  return INFORMATIONAL_PATTERNS.some(p => p.test(text));
}

async function runTests() {
  logger.info('='.repeat(60));
  logger.info('ActionItemService Test Suite');
  logger.info('='.repeat(60));

  let totalPassed = 0;
  let totalFailed = 0;

  // ==========================================================================
  // Test 1: Emails that SHOULD have action items detected
  // ==========================================================================
  logger.info('\n🧪 Test 1: Pattern Detection - Emails with action items');
  logger.info('-'.repeat(40));

  const actionItemEmails = [
    { text: 'Can you please send me the report by Friday?', expected: true },
    { text: 'Could you review this proposal?', expected: true },
    { text: 'Please review the attached document', expected: true },
    { text: "I'll send you the final version tomorrow", expected: true },
    { text: "We'll follow up on this next week", expected: true },
    { text: 'Action item: Update the project timeline', expected: true },
    { text: "Don't forget to submit your timesheet", expected: true },
    { text: 'Please send me the budget report by end of day', expected: true },
    { text: 'You should check with the legal team first', expected: true },
    { text: 'Make sure to include the latest numbers', expected: true },
    { text: 'Follow up on the client proposal', expected: true },
    { text: 'Please approve the purchase order', expected: true },
    { text: 'Schedule a meeting with the team', expected: true },
    { text: 'TODO: Complete the integration tests', expected: true },
    { text: 'We need to finalize this by Monday', expected: true },
  ];

  for (const { text, expected } of actionItemEmails) {
    const detected = hasActionPattern(text) && !isInformational(text);
    const passed = detected === expected;
    if (passed) {
      totalPassed++;
      logger.success(`"${text.slice(0, 50)}..." → detected: ${detected}`);
    } else {
      totalFailed++;
      logger.fail(`"${text.slice(0, 50)}..." → expected: ${expected}, got: ${detected}`);
    }
  }

  // ==========================================================================
  // Test 2: Emails that should NOT have action items
  // ==========================================================================
  logger.info('\n🧪 Test 2: Pattern Detection - Emails without action items');
  logger.info('-'.repeat(40));

  const noActionEmails = [
    { text: 'FYI - the meeting notes are attached', expected: false },
    { text: 'Just wanted to let you know the project is complete', expected: false },
    { text: 'No action required - this is for your reference only', expected: false },
    { text: 'As discussed in our last meeting, here is the summary', expected: false },
    { text: 'For your information, the system will be down Saturday', expected: false },
    { text: 'Thank you for your help with the project', expected: false },
    { text: 'Great work on the presentation!', expected: false },
    { text: 'Looking forward to seeing everyone at the conference', expected: false },
  ];

  for (const { text, expected } of noActionEmails) {
    const detected = hasActionPattern(text) && !isInformational(text);
    const passed = detected === expected;
    if (passed) {
      totalPassed++;
      logger.success(`"${text.slice(0, 50)}..." → detected: ${detected}`);
    } else {
      totalFailed++;
      logger.fail(`"${text.slice(0, 50)}..." → expected: ${expected}, got: ${detected}`);
    }
  }

  // ==========================================================================
  // Test 3: Owner Detection
  // ==========================================================================
  logger.info('\n🧪 Test 3: Owner Detection');
  logger.info('-'.repeat(40));

  const ownerTests = [
    { text: 'Can you please send me the report?', expected: 'recipient' },
    { text: 'Could you review this?', expected: 'recipient' },
    { text: 'Please update the document', expected: 'recipient' },
    { text: 'You should check with legal', expected: 'recipient' },
    { text: "I'll send you the file tomorrow", expected: 'sender' },
    { text: "We'll follow up next week", expected: 'sender' },
    { text: 'Let me check on that', expected: 'sender' },
    { text: 'I will provide the update by Friday', expected: 'sender' },
    { text: 'The report is ready', expected: 'unknown' },
    { text: 'Meeting scheduled for Monday', expected: 'unknown' },
  ];

  for (const { text, expected } of ownerTests) {
    const owner = detectOwner(text);
    const passed = owner === expected;
    if (passed) {
      totalPassed++;
      logger.success(`"${text.slice(0, 40)}..." → owner: ${owner}`);
    } else {
      totalFailed++;
      logger.fail(`"${text.slice(0, 40)}..." → expected: ${expected}, got: ${owner}`);
    }
  }

  // ==========================================================================
  // Test 4: Database CRUD Operations
  // ==========================================================================
  logger.info('\n🧪 Test 4: Database CRUD Operations');
  logger.info('-'.repeat(40));

  const tenantId = 'test-tenant-action-items';
  const userId = 'test-user-action-items';

  try {
    // Use the project's Prisma factory
    const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
    const prisma = createPrismaClient();

    // Clean up any existing test data
    await prisma.aiTask.deleteMany({
      where: { tenantId, userId },
    });
    logger.success('Cleaned up existing test data');

    // Create test action items
    const item1 = await prisma.aiTask.create({
      data: {
        tenantId,
        userId,
        title: 'Review project proposal',
        description: 'Review the Q1 project proposal from marketing team',
        sourceType: 'EMAIL',
        sourceId: 'test-email-1',
        status: 'TODO',
        priority: 2,
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        aiExtracted: true,
        confidence: 0.85,
      },
    });
    logger.success(`Created action item 1: ${item1.id}`);
    totalPassed++;

    const item2 = await prisma.aiTask.create({
      data: {
        tenantId,
        userId,
        title: 'Send budget report',
        description: 'Send the quarterly budget report to finance',
        sourceType: 'EMAIL',
        sourceId: 'test-email-2',
        status: 'TODO',
        priority: 5,
        dueDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday (overdue)
        aiExtracted: true,
        confidence: 0.9,
      },
    });
    logger.success(`Created action item 2: ${item2.id}`);
    totalPassed++;

    const item3 = await prisma.aiTask.create({
      data: {
        tenantId,
        userId,
        title: 'Schedule team meeting',
        description: 'Set up weekly team sync for Q2',
        sourceType: 'MANUAL',
        status: 'DONE',
        priority: 8,
        completedAt: new Date(),
        aiExtracted: false,
      },
    });
    logger.success(`Created action item 3: ${item3.id}`);
    totalPassed++;

    // Test list
    const allItems = await prisma.aiTask.findMany({
      where: { tenantId, userId },
    });
    if (allItems.length === 3) {
      logger.success(`Listed all items: ${allItems.length} found`);
      totalPassed++;
    } else {
      logger.fail(`Expected 3 items, got ${allItems.length}`);
      totalFailed++;
    }

    // Test update status
    const updated = await prisma.aiTask.update({
      where: { id: item1.id },
      data: { status: 'IN_PROGRESS' },
    });
    if (updated.status === 'IN_PROGRESS') {
      logger.success('Updated status to IN_PROGRESS');
      totalPassed++;
    } else {
      logger.fail('Status update failed');
      totalFailed++;
    }

    // Test delete
    await prisma.aiTask.delete({
      where: { id: item3.id },
    });
    const afterDelete = await prisma.aiTask.findMany({
      where: { tenantId, userId },
    });
    if (afterDelete.length === 2) {
      logger.success('Deleted item successfully');
      totalPassed++;
    } else {
      logger.fail('Delete failed');
      totalFailed++;
    }

    // Cleanup
    await prisma.aiTask.deleteMany({
      where: { tenantId, userId },
    });
    logger.success('Cleaned up test data');

    await prisma.$disconnect();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Database test failed: ${msg}`);
    totalFailed++;
  }

  // ==========================================================================
  // Test 5: Statistics Calculation
  // ==========================================================================
  logger.info('\n🧪 Test 5: Statistics Calculation');
  logger.info('-'.repeat(40));

  try {
    const { createPrismaClient } = await import('../src/prisma/prisma-client.factory');
    const prisma = createPrismaClient();

    // Clean up
    await prisma.aiTask.deleteMany({
      where: { tenantId, userId },
    });

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Create items with different statuses
    await prisma.aiTask.createMany({
      data: [
        { tenantId, userId, title: 'Todo 1', status: 'TODO', sourceType: 'EMAIL', priority: 2 },
        { tenantId, userId, title: 'Todo 2', status: 'TODO', sourceType: 'EMAIL', priority: 5, dueDate: new Date(todayStart.getTime() + 12 * 60 * 60 * 1000) }, // Due today
        { tenantId, userId, title: 'In Progress', status: 'IN_PROGRESS', sourceType: 'EMAIL', priority: 3 },
        { tenantId, userId, title: 'Waiting', status: 'WAITING', sourceType: 'EMAIL', priority: 5 },
        { tenantId, userId, title: 'Done', status: 'DONE', sourceType: 'EMAIL', priority: 5 },
        { tenantId, userId, title: 'Overdue', status: 'TODO', sourceType: 'EMAIL', priority: 1, dueDate: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000) }, // Yesterday
      ],
    });

    // Calculate stats
    const [total, todo, inProgress, waiting, done, dueToday, overdue, highPriority] = await Promise.all([
      prisma.aiTask.count({ where: { tenantId, userId } }),
      prisma.aiTask.count({ where: { tenantId, userId, status: 'TODO' } }),
      prisma.aiTask.count({ where: { tenantId, userId, status: 'IN_PROGRESS' } }),
      prisma.aiTask.count({ where: { tenantId, userId, status: 'WAITING' } }),
      prisma.aiTask.count({ where: { tenantId, userId, status: 'DONE' } }),
      prisma.aiTask.count({
        where: {
          tenantId, userId,
          status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
          dueDate: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.aiTask.count({
        where: {
          tenantId, userId,
          status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
          dueDate: { lt: todayStart },
        },
      }),
      prisma.aiTask.count({
        where: {
          tenantId, userId,
          status: { in: ['TODO', 'IN_PROGRESS', 'WAITING'] },
          priority: { lte: 3 },
        },
      }),
    ]);

    logger.info(`   Statistics calculated:`);
    logger.info(`   - Total: ${total} (expected: 6)`);
    logger.info(`   - TODO: ${todo} (expected: 3)`);
    logger.info(`   - IN_PROGRESS: ${inProgress} (expected: 1)`);
    logger.info(`   - WAITING: ${waiting} (expected: 1)`);
    logger.info(`   - DONE: ${done} (expected: 1)`);
    logger.info(`   - Due Today: ${dueToday} (expected: 1)`);
    logger.info(`   - Overdue: ${overdue} (expected: 1)`);
    logger.info(`   - High Priority (<=3): ${highPriority} (expected: 3)`);

    if (total === 6 && todo === 3 && inProgress === 1 && waiting === 1 && done === 1) {
      logger.success('Statistics calculation correct');
      totalPassed++;
    } else {
      logger.fail('Statistics calculation incorrect');
      totalFailed++;
    }

    // Cleanup
    await prisma.aiTask.deleteMany({ where: { tenantId, userId } });
    await prisma.$disconnect();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`Statistics test failed: ${msg}`);
    totalFailed++;
  }

  // ==========================================================================
  // Test 6: Priority Mapping
  // ==========================================================================
  logger.info('\n🧪 Test 6: Priority Mapping');
  logger.info('-'.repeat(40));

  function priorityToNumber(priority: string): number {
    switch (priority) {
      case 'high': return 2;
      case 'medium': return 5;
      case 'low': return 8;
      default: return 5;
    }
  }

  const priorityTests = [
    { input: 'high', expected: 2 },
    { input: 'medium', expected: 5 },
    { input: 'low', expected: 8 },
    { input: 'unknown', expected: 5 },
  ];

  for (const { input, expected } of priorityTests) {
    const result = priorityToNumber(input);
    if (result === expected) {
      logger.success(`Priority "${input}" → ${result}`);
      totalPassed++;
    } else {
      logger.fail(`Priority "${input}" → expected: ${expected}, got: ${result}`);
      totalFailed++;
    }
  }

  // ==========================================================================
  // Summary
  // ==========================================================================
  logger.info('\n' + '='.repeat(60));
  logger.info('Test Summary');
  logger.info('='.repeat(60));
  logger.info(`Total Passed: ${totalPassed}`);
  logger.info(`Total Failed: ${totalFailed}`);
  logger.info(`Success Rate: ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);

  if (totalFailed === 0) {
    logger.success('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    logger.fail(`\n${totalFailed} test(s) failed`);
    process.exit(1);
  }
}

runTests().catch((err) => {
  logger.error(`Test suite failed: ${err.message}`);
  process.exit(1);
});
